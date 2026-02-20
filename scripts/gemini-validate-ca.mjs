/**
 * Gemini 3 Pro Preview — PYQ CA Classification Validator
 *
 * Sends all 1300 PYQ questions (2013-2025) to Gemini in batches,
 * asking it to classify each as "static" or "ca-linked".
 * Compares with existing metadata.category and computes true per-subject CA ratios.
 *
 * Usage:
 *   node scripts/gemini-validate-ca.mjs
 *   node scripts/gemini-validate-ca.mjs --year 2024          # single year
 *   node scripts/gemini-validate-ca.mjs --dry-run             # show what would be sent
 *
 * Writes results to: scripts/ca-validation-results.json
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { VertexAI } from "../apps/worker/node_modules/@google-cloud/vertexai/build/src/index.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PYQ_DIR = "apps/worker/pyqs/GS/parsed";
const OUTPUT_FILE = "scripts/ca-validation-results.json";
const BATCH_SIZE = 25;  // questions per API call
const MODEL = "gemini-3.1-pro-preview";
const LOCATION = "global";
const MAX_CONCURRENT = 2;  // parallel API calls
const RETRY_DELAY = 5000;  // ms between retries
const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Parse CLI flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const yearFilter = args.includes("--year")
  ? args[args.indexOf("--year") + 1]
  : null;

// ---------------------------------------------------------------------------
// Load service account
// ---------------------------------------------------------------------------
function loadServiceAccount() {
  const envFile = readFileSync("apps/worker/.env", "utf8");
  const line = envFile.split("\n").find(l => l.startsWith("GCP_SERVICE_ACCOUNT="));
  if (!line) throw new Error("GCP_SERVICE_ACCOUNT not found in apps/worker/.env");
  return JSON.parse(line.split("=").slice(1).join("="));
}

// ---------------------------------------------------------------------------
// Gemini client
// ---------------------------------------------------------------------------
function createClient(sa) {
  const vertexAI = new VertexAI({
    project: sa.project_id,
    location: LOCATION,
    apiEndpoint: LOCATION === "global" ? "aiplatform.googleapis.com" : undefined,
    googleAuthOptions: {
      credentials: {
        client_email: sa.client_email,
        private_key: sa.private_key,
      },
    },
  });

  return vertexAI.preview.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            qNum: { type: "INTEGER", description: "Question sequence number" },
            classification: {
              type: "STRING",
              enum: ["static", "ca-linked"],
              description: "Whether this question requires current affairs knowledge or is purely static/textbook",
            },
            confidence: {
              type: "STRING",
              enum: ["high", "medium", "low"],
              description: "Confidence in classification",
            },
            rationale: {
              type: "STRING",
              description: "Brief (1-2 sentence) justification for the classification",
            },
          },
          required: ["qNum", "classification", "confidence", "rationale"],
        },
      },
      temperature: 0.1,  // low temperature for consistent classification
    },
  });
}

// ---------------------------------------------------------------------------
// Build prompt for a batch of questions
// ---------------------------------------------------------------------------
function buildPrompt(year, questions) {
  const qTexts = questions.map(q => {
    const opts = q.options.map((o, i) => `  ${String.fromCharCode(65 + i)}) ${o}`).join("\n");
    return `Q${q.sequenceNumber}. ${q.questionText}\n${opts}`;
  }).join("\n\n---\n\n");

  return {
    system: `You are a UPSC exam analysis expert. Your task is to classify Previous Year Questions from UPSC Civil Services Preliminary Examination as either "static" or "ca-linked".

CLASSIFICATION CRITERIA:

**"static"** — The question tests timeless textbook knowledge that does not require awareness of any specific real-world event, policy launch, government scheme, international summit, or development from the years around the exam.

Examples of STATIC:
- Constitutional provisions (Article numbers, fundamental rights, DPSP)
- Physical geography (rivers, climate, soil types)
- Ancient/Medieval history (dynasties, battles, culture)
- Core economic concepts (monetary policy tools, types of deficits)
- Taxonomy, ecology fundamentals, biosphere concepts
- Classical art forms, temple architecture, literary works

**"ca-linked"** — The question's topic was LIKELY SELECTED because of a current event, policy change, government scheme, international development, scientific mission, or news event from the 1-3 years before the exam. The question may or may not explicitly mention dates/events — what matters is whether the TOPIC CHOICE was influenced by current affairs.

Examples of CA-LINKED:
- Questions about recently launched government schemes (even if framed as static)
- Questions about species/regions that were in the news
- Questions about new technologies, missions (ISRO, defense), or international agreements
- Questions about institutions/organizations that were recently in headlines
- Questions about recently amended laws or new legislation
- Questions referencing specific recent events ("In context of...", "With reference to recent...")
- Questions about concepts that became relevant due to news (e.g., "wet bulb temperature" during heatwave news)

IMPORTANT NUANCE — "DERIVED STATIC" counts as CA-LINKED:
If UPSC picked a topic BECAUSE it was in the news, but framed the question purely from textbooks — that is STILL "ca-linked". The test is: "Would UPSC have asked this specific question in THIS specific year if the topic hadn't been in the news?"

For example: A 2022 question about "Governor's power to withhold assent" is ca-linked even though it's a constitutional topic — because Governor-state conflicts were heavily in the news in 2021-2022.

YEAR CONTEXT: These questions are from ${year}. Consider what was in the news in ${year - 2}-${year} when evaluating whether a topic choice was CA-influenced.

Classify each question. Return JSON array with one entry per question.`,

    user: `Classify these ${questions.length} UPSC ${year} GS1 questions as "static" or "ca-linked":

${qTexts}`,
  };
}

// ---------------------------------------------------------------------------
// Call Gemini with retry
// ---------------------------------------------------------------------------
async function callGemini(model, systemPrompt, userPrompt, retries = 0) {
  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
    });

    const text = result.response.candidates?.[0]?.content?.parts
      ?.map(p => p.text || "").join("") || "";

    const usage = result.response.usageMetadata;
    return { data: JSON.parse(text), usage };
  } catch (err) {
    if (retries < MAX_RETRIES) {
      const delay = RETRY_DELAY * (retries + 1);
      console.error(`  Retry ${retries + 1}/${MAX_RETRIES} after ${delay}ms: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
      return callGemini(model, systemPrompt, userPrompt, retries + 1);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Process one year
// ---------------------------------------------------------------------------
async function processYear(model, year, questions) {
  const batches = [];
  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    batches.push(questions.slice(i, i + BATCH_SIZE));
  }

  console.log(`\n[${year}] ${questions.length}Q in ${batches.length} batches`);
  const results = [];
  let totalPrompt = 0;
  let totalCompletion = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const { system, user } = buildPrompt(year, batch);

    if (DRY_RUN) {
      console.log(`  Batch ${i + 1}: Q${batch[0].sequenceNumber}-Q${batch[batch.length - 1].sequenceNumber} (${batch.length}Q) [DRY RUN]`);
      continue;
    }

    process.stdout.write(`  Batch ${i + 1}/${batches.length}: Q${batch[0].sequenceNumber}-Q${batch[batch.length - 1].sequenceNumber}...`);

    const { data, usage } = await callGemini(model, system, user);
    totalPrompt += usage?.promptTokenCount || 0;
    totalCompletion += usage?.candidatesTokenCount || 0;

    results.push(...data);
    console.log(` ${data.length} classified (${data.filter(d => d.classification === "ca-linked").length} CA)`);

    // Rate limiting
    if (i < batches.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log(`  Tokens: ${totalPrompt} prompt + ${totalCompletion} completion = ${totalPrompt + totalCompletion} total`);
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const sa = loadServiceAccount();
  const model = createClient(sa);

  const files = readdirSync(PYQ_DIR).filter(f => f.endsWith(".json")).sort();

  // Load existing results if resuming
  let allResults = {};
  if (existsSync(OUTPUT_FILE)) {
    try {
      allResults = JSON.parse(readFileSync(OUTPUT_FILE, "utf8"));
      console.log(`Loaded existing results from ${OUTPUT_FILE} (${Object.keys(allResults).length} years)`);
    } catch { /* start fresh */ }
  }

  let totalTokens = 0;

  for (const file of files) {
    const data = JSON.parse(readFileSync(`${PYQ_DIR}/${file}`, "utf8"));
    const year = data.year;

    if (yearFilter && year !== yearFilter) continue;

    // Skip if already processed (resume support)
    if (allResults[year] && !yearFilter) {
      console.log(`[${year}] Already processed (${allResults[year].geminiResults.length} results), skipping. Use --year ${year} to redo.`);
      continue;
    }

    const geminiResults = await processYear(model, year, data.questions);

    if (!DRY_RUN && geminiResults.length > 0) {
      // Merge gemini results with original metadata
      const merged = data.questions.map(q => {
        const gemini = geminiResults.find(r => r.qNum === q.sequenceNumber);
        const origCat = (q.metadata?.category || "unknown").toLowerCase();
        const origIsStatic = origCat === "pure-static" || origCat === "static" || origCat === "static-theory";

        return {
          qNum: q.sequenceNumber,
          subject: q.metadata?.subject || "unknown",
          originalCategory: origCat,
          originalIsStatic: origIsStatic,
          geminiClassification: gemini?.classification || "unknown",
          geminiIsStatic: gemini?.classification === "static",
          confidence: gemini?.confidence || "unknown",
          rationale: gemini?.rationale || "",
          agrees: origIsStatic === (gemini?.classification === "static"),
          snippet: q.questionText.slice(0, 100),
        };
      });

      allResults[year] = {
        geminiResults: merged,
        summary: {
          total: merged.length,
          geminiStatic: merged.filter(m => m.geminiIsStatic).length,
          geminiCA: merged.filter(m => !m.geminiIsStatic).length,
          originalStatic: merged.filter(m => m.originalIsStatic).length,
          originalCA: merged.filter(m => !m.originalIsStatic).length,
          agreements: merged.filter(m => m.agrees).length,
          disagreements: merged.filter(m => !m.agrees).length,
        },
      };

      // Save after each year (resume support)
      writeFileSync(OUTPUT_FILE, JSON.stringify(allResults, null, 2));
      console.log(`  Saved to ${OUTPUT_FILE}`);
    }
  }

  if (DRY_RUN) {
    console.log("\n[DRY RUN] No API calls made.");
    return;
  }

  // ---------------------------------------------------------------------------
  // Final analysis
  // ---------------------------------------------------------------------------
  console.log("\n" + "=".repeat(80));
  console.log("FINAL ANALYSIS: GEMINI vs ORIGINAL CLASSIFICATION");
  console.log("=".repeat(80));

  // Year-by-year comparison
  console.log("\n--- YEAR-BY-YEAR ---\n");
  console.log("  Year  Orig-CA  Gemini-CA  Agree  Disagree");
  for (const year of Object.keys(allResults).sort()) {
    const s = allResults[year].summary;
    console.log(`  ${year}   ${String(s.originalCA).padStart(5)}     ${String(s.geminiCA).padStart(5)}   ${String(s.agreements).padStart(5)}    ${String(s.disagreements).padStart(5)}`);
  }

  // Per-subject CA rates (Gemini classification)
  console.log("\n--- PER-SUBJECT CA RATES (GEMINI CLASSIFICATION) ---\n");
  const subjectTotals = {};
  for (const year of Object.keys(allResults).sort()) {
    for (const q of allResults[year].geminiResults) {
      const subj = q.subject.toLowerCase();
      if (!subjectTotals[subj]) subjectTotals[subj] = { static: 0, ca: 0, yearPcts: {} };
      if (q.geminiIsStatic) {
        subjectTotals[subj].static++;
      } else {
        subjectTotals[subj].ca++;
      }
      if (!subjectTotals[subj].yearPcts[year]) subjectTotals[subj].yearPcts[year] = { s: 0, ca: 0 };
      if (q.geminiIsStatic) subjectTotals[subj].yearPcts[year].s++;
      else subjectTotals[subj].yearPcts[year].ca++;
    }
  }

  console.log("  Subject".padEnd(25) + "Total  Static  CA   CA%   SD");
  const sortedSubjects = Object.entries(subjectTotals)
    .sort((a, b) => {
      const aPct = a[1].ca / (a[1].static + a[1].ca);
      const bPct = b[1].ca / (b[1].static + b[1].ca);
      return aPct - bPct;
    });

  for (const [subj, data] of sortedSubjects) {
    const total = data.static + data.ca;
    const pct = total > 0 ? (data.ca / total * 100) : 0;
    const yearPctValues = Object.values(data.yearPcts).map(yp => {
      const t = yp.s + yp.ca;
      return t > 0 ? (yp.ca / t * 100) : 0;
    });
    const mean = yearPctValues.length > 0
      ? yearPctValues.reduce((a, b) => a + b, 0) / yearPctValues.length : 0;
    const variance = yearPctValues.length > 0
      ? yearPctValues.reduce((a, b) => a + (b - mean) ** 2, 0) / yearPctValues.length : 0;
    const sd = Math.sqrt(variance);

    console.log(
      `  ${subj.padEnd(23)} ${String(total).padStart(4)}   ${String(data.static).padStart(4)}  ${String(data.ca).padStart(3)}   ${pct.toFixed(1).padStart(5)}%  ${sd.toFixed(1).padStart(5)}`
    );
  }

  // Comparison with code ratios
  const CODE_RATIOS = {
    history: 0.06, geography: 0.14, art_culture: 0.19,
    science: 0.32, polity: 0.32, economy: 0.39, environment: 0.42,
  };
  const SUBJECT_MAP = {
    history: "history", geography: "geography",
    "art & culture": "art_culture", art_culture: "art_culture", culture: "art_culture",
    "science & technology": "science", science: "science",
    polity: "polity", "polity & governance": "polity",
    economy: "economy", environment: "environment",
    "environment & ecology": "environment",
  };

  console.log("\n--- GEMINI vs CODE RATIOS ---\n");
  console.log("  Subject".padEnd(25) + "Gemini-CA%  Code-CA%  Delta");
  for (const [subj, data] of sortedSubjects) {
    const mapped = SUBJECT_MAP[subj];
    const total = data.static + data.ca;
    const pct = total > 0 ? (data.ca / total * 100) : 0;
    if (mapped && CODE_RATIOS[mapped] !== undefined) {
      const codePct = CODE_RATIOS[mapped] * 100;
      const delta = pct - codePct;
      const flag = Math.abs(delta) > 10 ? " ⚠️" : Math.abs(delta) > 5 ? " ~" : " ✓";
      console.log(
        `  ${subj.padEnd(23)} ${pct.toFixed(1).padStart(8)}%  ${codePct.toFixed(1).padStart(6)}%  ${(delta >= 0 ? "+" : "") + delta.toFixed(1)}%${flag}`
      );
    }
  }

  // Disagreement examples
  console.log("\n--- TOP DISAGREEMENTS (Original=Static but Gemini=CA) ---\n");
  let count = 0;
  for (const year of Object.keys(allResults).sort()) {
    for (const q of allResults[year].geminiResults) {
      if (q.originalIsStatic && !q.geminiIsStatic && q.confidence !== "low" && count < 15) {
        console.log(`  ${year} Q${q.qNum} [${q.subject}]: ${q.snippet}...`);
        console.log(`    Gemini: ca-linked (${q.confidence}) — ${q.rationale}`);
        count++;
      }
    }
  }

  console.log("\n--- TOP DISAGREEMENTS (Original=CA but Gemini=Static) ---\n");
  count = 0;
  for (const year of Object.keys(allResults).sort()) {
    for (const q of allResults[year].geminiResults) {
      if (!q.originalIsStatic && q.geminiIsStatic && q.confidence !== "low" && count < 15) {
        console.log(`  ${year} Q${q.qNum} [${q.subject}] orig="${q.originalCategory}": ${q.snippet}...`);
        console.log(`    Gemini: static (${q.confidence}) — ${q.rationale}`);
        count++;
      }
    }
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
