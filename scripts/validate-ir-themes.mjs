/**
 * IR Themes Extraction & Validation (2-phase)
 *
 * Phase 1: Send each PYQ paper (MD) to Gemini 3.1 Pro Preview.
 *          Extract ALL IR questions, their themes, sub-topics, and CA/static classification.
 *          No codebase themes are sent — Gemini classifies from scratch.
 *
 * Phase 2: After all years are processed, compare extracted themes against
 *          our codebase IR_THEMES / IR_ANALYSIS / IR_STRATEGIC_TRAPS.
 *
 * Usage:
 *   node scripts/validate-ir-themes.mjs
 *   node scripts/validate-ir-themes.mjs --year 2024
 *   node scripts/validate-ir-themes.mjs --phase2-only   # skip extraction, just compare
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { VertexAI } from "../apps/worker/node_modules/@google-cloud/vertexai/build/src/index.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PYQ_DIR = "/Users/lolwierd/Projects/personal/pyqs/GS/parsed";
const OUTPUT_FILE = "scripts/ir-extraction-results.json";
const VALIDATION_FILE = "scripts/ir-validation-report.json";
const MODEL = "gemini-3.1-pro-preview";
const LOCATION = "global";
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const yearFilter = args.includes("--year")
  ? args[args.indexOf("--year") + 1]
  : null;
const phase2Only = args.includes("--phase2-only");

// ---------------------------------------------------------------------------
// Load service account
// ---------------------------------------------------------------------------
function loadServiceAccount() {
  return JSON.parse(readFileSync("geminikey.json", "utf8"));
}

// ---------------------------------------------------------------------------
// Gemini client
// ---------------------------------------------------------------------------
function createClient(sa) {
  const vertexAI = new VertexAI({
    project: sa.project_id,
    location: LOCATION,
    apiEndpoint: "aiplatform.googleapis.com",
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
        type: "OBJECT",
        properties: {
          totalQuestionsInPaper: {
            type: "INTEGER",
            description: "Total number of questions in this paper",
          },
          irQuestions: {
            type: "ARRAY",
            description: "All IR-related questions extracted from this paper",
            items: {
              type: "OBJECT",
              properties: {
                qNum: { type: "STRING", description: "Question number" },
                snippet: {
                  type: "STRING",
                  description: "First ~120 chars of question text",
                },
                primaryTheme: {
                  type: "STRING",
                  description:
                    "Primary IR theme (e.g., 'International Organizations', 'Bilateral Relations', 'Global Trade', 'Defense & Security', 'UN System', 'Geopolitics & Conflicts', 'India Foreign Policy', etc.)",
                },
                subTopics: {
                  type: "ARRAY",
                  description:
                    "Specific sub-topics (e.g., 'G20', 'NATO', 'WTO Agreement on Agriculture', 'UNCLOS')",
                  items: { type: "STRING" },
                },
                questionStyle: {
                  type: "STRING",
                  enum: [
                    "factual-recall",
                    "match-the-following",
                    "conceptual",
                    "institutional-mandate",
                    "membership-based",
                    "statement-analysis",
                    "other",
                  ],
                  description: "Style/format of the question",
                },
                classification: {
                  type: "STRING",
                  enum: ["static", "ca-linked"],
                  description:
                    "Static = timeless textbook knowledge. CA-linked = topic likely chosen because of current events around that year.",
                },
                caContext: {
                  type: "STRING",
                  description:
                    "If ca-linked, what news event likely triggered this question. Empty if static.",
                },
                difficulty: {
                  type: "STRING",
                  enum: ["easy", "moderate", "hard"],
                  description: "Difficulty level for a serious UPSC aspirant",
                },
              },
              required: [
                "qNum",
                "snippet",
                "primaryTheme",
                "subTopics",
                "questionStyle",
                "classification",
                "caContext",
                "difficulty",
              ],
            },
          },
          yearSummary: {
            type: "OBJECT",
            description: "Summary observations about IR in this year's paper",
            properties: {
              dominantThemes: {
                type: "ARRAY",
                description: "Top 2-3 IR themes this year",
                items: { type: "STRING" },
              },
              dominantStyle: {
                type: "STRING",
                description: "Most common question style for IR this year",
              },
              notablePatterns: {
                type: "STRING",
                description:
                  "Any notable patterns, surprises, or shifts observed in IR questions this year",
              },
            },
            required: ["dominantThemes", "dominantStyle", "notablePatterns"],
          },
        },
        required: ["totalQuestionsInPaper", "irQuestions", "yearSummary"],
      },
      temperature: 0.1,
    },
  });
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

    const text =
      result.response.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || "")
        .join("") || "";

    const usage = result.response.usageMetadata;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (jsonErr) {
      // Try to repair truncated JSON
      let fixed = text;
      // Close any open strings
      const lastQuote = fixed.lastIndexOf('"');
      if (lastQuote > 0) {
        const afterQuote = fixed.slice(lastQuote + 1).trim();
        if (!afterQuote.startsWith(":") && !afterQuote.startsWith(",") &&
            !afterQuote.startsWith("}") && !afterQuote.startsWith("]")) {
          fixed = fixed.slice(0, lastQuote + 1);
        }
      }
      // Try adding closing brackets
      const opens = (fixed.match(/[\[{]/g) || []).length;
      const closes = (fixed.match(/[\]}]/g) || []).length;
      for (let i = 0; i < opens - closes; i++) {
        // Determine if we need ] or }
        const stack = [];
        for (const ch of fixed) {
          if (ch === '[' || ch === '{') stack.push(ch);
          else if (ch === ']' || ch === '}') stack.pop();
        }
        if (stack.length > 0) {
          const last = stack[stack.length - 1];
          fixed += last === '[' ? ']' : '}';
          stack.pop();
        }
      }
      try {
        parsed = JSON.parse(fixed);
        console.error(`  (repaired truncated JSON)`);
      } catch {
        throw jsonErr; // re-throw original error
      }
    }
    return { data: parsed, usage };
  } catch (err) {
    const is429 = err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED");
    const maxR = is429 ? 6 : MAX_RETRIES;
    if (retries < maxR) {
      const delay = is429
        ? Math.min(60000, 10000 * (retries + 1))  // 10s, 20s, 30s... up to 60s for 429
        : RETRY_DELAY * (retries + 1);
      console.error(
        `  Retry ${retries + 1}/${maxR} after ${(delay / 1000).toFixed(0)}s: ${err.message?.slice(0, 100)}`,
      );
      await new Promise((r) => setTimeout(r, delay));
      return callGemini(model, systemPrompt, userPrompt, retries + 1);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Phase 1: Extract IR questions from each paper
// ---------------------------------------------------------------------------
async function phase1(model) {
  const files = readdirSync(PYQ_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  console.log(`\n${"=".repeat(80)}`);
  console.log("PHASE 1: EXTRACTING IR QUESTIONS FROM PYQ PAPERS");
  console.log(`${"=".repeat(80)}`);
  console.log(`Papers: ${files.length} | Model: ${MODEL}\n`);

  // Load existing results for resume support
  let allResults = {};
  if (existsSync(OUTPUT_FILE)) {
    try {
      allResults = JSON.parse(readFileSync(OUTPUT_FILE, "utf8"));
      console.log(
        `Resuming: loaded ${Object.keys(allResults).length} existing years from ${OUTPUT_FILE}\n`,
      );
    } catch {
      /* start fresh */
    }
  }

  const systemPrompt = `You are a UPSC Civil Services Preliminary Examination expert.

Your task: Given a full GS Paper I, identify and extract ALL questions that fall under "International Relations" (IR).

WHAT COUNTS AS IR:
- International organizations & multilateral forums (UN, WTO, IMF, World Bank, G20, BRICS, ASEAN, SCO, NATO, etc.)
- Bilateral/multilateral treaties, agreements, FTAs
- Geopolitics, conflicts, disputed territories, places in news with geopolitical significance
- Global governance, international law (UNCLOS, refugee law, ICJ)
- Nuclear treaties, arms control, defense exercises, strategic partnerships
- International trade rules and disputes (WTO boxes, anti-dumping)
- India's foreign policy, neighborhood policy, Act East, etc.
- International funds/institutions with global governance role (GEF, GCF, AIIB)
- Global health/environment governance when the IR/institutional angle is primary

WHAT DOES NOT COUNT:
- Purely domestic economy (RBI policy, Indian banking) without international angle
- Pure physical geography (rivers, climate) without geopolitical context
- Pure environment/ecology (species, biomes) without international governance angle
- Purely domestic polity (Indian Constitution, Parliament procedures)
- Pure science & technology without international cooperation angle

CLASSIFICATION GUIDANCE (static vs ca-linked):
- "static": Timeless textbook knowledge — would be equally valid 10 years ago or 10 years from now
- "ca-linked": The topic was LIKELY chosen because of current events 1-3 years before the exam. This includes "derived static" — where UPSC picks a static topic BECAUSE it was in the news, even if the question itself reads like a textbook question. Ask yourself: "Would UPSC have asked THIS specific question in THIS specific year if the topic hadn't been in the news?"

Be thorough but precise. If zero IR questions exist in a paper, return an empty array.`;

  for (const file of files) {
    const yearMatch = file.match(/(\d{4})/);
    if (!yearMatch) continue;
    const year = yearMatch[1];

    if (yearFilter && year !== yearFilter) continue;

    // Skip already processed (resume)
    if (allResults[year] && !yearFilter) {
      console.log(
        `[${year}] Already extracted (${allResults[year].irQuestions?.length || 0} IR Qs), skipping.`,
      );
      continue;
    }

    const paperMd = readFileSync(`${PYQ_DIR}/${file}`, "utf8");
    process.stdout.write(`[${year}] Sending ${file} (${paperMd.length} chars)...`);

    const { data, usage } = await callGemini(
      model,
      systemPrompt,
      `Analyze this UPSC ${year} GS Paper I and extract all International Relations questions:\n\n${paperMd}`,
    );

    const irCount = data.irQuestions?.length || 0;
    const caCount =
      data.irQuestions?.filter((q) => q.classification === "ca-linked").length ||
      0;
    const staticCount = irCount - caCount;

    console.log(
      ` ${irCount} IR Qs (${staticCount} static, ${caCount} CA) | ${usage?.promptTokenCount || "?"}+${usage?.candidatesTokenCount || "?"} tokens`,
    );

    allResults[year] = data;
    writeFileSync(OUTPUT_FILE, JSON.stringify(allResults, null, 2));

    // Rate limit — 8s between papers to avoid 429
    await new Promise((r) => setTimeout(r, 8000));
  }

  return allResults;
}

// ---------------------------------------------------------------------------
// Phase 2: Compare extracted themes against codebase
// ---------------------------------------------------------------------------
function phase2(allResults) {
  console.log(`\n${"=".repeat(80)}`);
  console.log("PHASE 2: VALIDATING AGAINST CODEBASE IR THEMES & ANALYSIS");
  console.log(`${"=".repeat(80)}\n`);

  // Load codebase themes
  const irThemesFile = readFileSync(
    "apps/worker/src/prompts/themes/international-relations.ts",
    "utf8",
  );
  const irAnalysisFile = readFileSync(
    "apps/worker/src/prompts/subject-analysis.ts",
    "utf8",
  );

  function extractExport(content, name) {
    const re = new RegExp(`export const ${name} = \`([\\s\\S]*?)\`;`, "m");
    const m = content.match(re);
    return m ? m[1].trim() : "";
  }

  const themesText = extractExport(irThemesFile, "IR_THEMES");
  const trapsText = extractExport(irThemesFile, "IR_STRATEGIC_TRAPS");
  const analysisText = extractExport(irAnalysisFile, "IR_ANALYSIS");

  // Extract theme categories from codebase
  const themeCategories = [];
  const themeLines = themesText.split("\n");
  let currentCategory = null;
  const allCodebaseSubTopics = new Set();

  for (const line of themeLines) {
    const catMatch = line.match(/^\d+\.\s+(.+?):/);
    if (catMatch) {
      currentCategory = catMatch[1].trim();
      themeCategories.push({ name: currentCategory, subTopics: [] });
    }
    const subMatch = line.match(/^-\s+(.+)/);
    if (subMatch && currentCategory) {
      const sub = subMatch[1].trim();
      themeCategories[themeCategories.length - 1].subTopics.push(sub);
      // Extract key terms
      const terms = sub.match(
        /\b[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\b/g,
      );
      if (terms) terms.forEach((t) => allCodebaseSubTopics.add(t.toLowerCase()));
    }
  }

  // Aggregate all extracted data
  const yearlyStats = [];
  const allExtractedThemes = new Map(); // theme -> [years]
  const allSubTopics = new Map(); // sub-topic -> [years]
  let grandTotalIR = 0;
  let grandTotalCA = 0;
  let grandTotalStatic = 0;
  let grandTotal = 0;
  const styleDistribution = {};
  const difficultyDistribution = {};

  for (const year of Object.keys(allResults).sort()) {
    const r = allResults[year];
    const qs = r.irQuestions || [];
    const total = r.totalQuestionsInPaper || 100;
    const ca = qs.filter((q) => q.classification === "ca-linked").length;
    const stat = qs.length - ca;

    grandTotalIR += qs.length;
    grandTotalCA += ca;
    grandTotalStatic += stat;
    grandTotal += total;

    yearlyStats.push({
      year,
      total,
      irCount: qs.length,
      irPct: ((qs.length / total) * 100).toFixed(1),
      static: stat,
      ca,
      caPct: qs.length > 0 ? ((ca / qs.length) * 100).toFixed(1) : "0.0",
      dominantThemes: r.yearSummary?.dominantThemes || [],
      dominantStyle: r.yearSummary?.dominantStyle || "",
      patterns: r.yearSummary?.notablePatterns || "",
    });

    for (const q of qs) {
      // Themes
      if (!allExtractedThemes.has(q.primaryTheme))
        allExtractedThemes.set(q.primaryTheme, []);
      allExtractedThemes.get(q.primaryTheme).push(year);

      // Sub-topics
      for (const st of q.subTopics || []) {
        if (!allSubTopics.has(st)) allSubTopics.set(st, []);
        allSubTopics.get(st).push(year);
      }

      // Style
      styleDistribution[q.questionStyle] =
        (styleDistribution[q.questionStyle] || 0) + 1;

      // Difficulty
      difficultyDistribution[q.difficulty] =
        (difficultyDistribution[q.difficulty] || 0) + 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Print results
  // ---------------------------------------------------------------------------

  // 1. Year-by-year table
  console.log("--- YEAR-BY-YEAR IR STATS ---\n");
  console.log(
    "Year  Total  IR-Qs  IR%    Static  CA  CA%    Dominant Themes",
  );
  for (const s of yearlyStats) {
    console.log(
      `${s.year}   ${String(s.total).padStart(3)}    ${String(s.irCount).padStart(3)}   ${s.irPct.padStart(5)}%    ${String(s.static).padStart(3)}    ${String(s.ca).padStart(2)}  ${s.caPct.padStart(5)}%   ${s.dominantThemes.join(", ")}`,
    );
  }
  console.log(
    `\nTotals: ${grandTotalIR} IR questions across ${grandTotal} total (${((grandTotalIR / grandTotal) * 100).toFixed(1)}%)`,
  );
  console.log(
    `Overall: ${grandTotalStatic} static (${((grandTotalStatic / grandTotalIR) * 100).toFixed(1)}%) + ${grandTotalCA} CA-linked (${((grandTotalCA / grandTotalIR) * 100).toFixed(1)}%)`,
  );

  // 2. Trend evolution validation
  console.log("\n--- TREND EVOLUTION VALIDATION ---\n");
  console.log("The IR_ANALYSIS claims these eras:");
  console.log("  2013-2017: Basic Facts ('Who is a member of X?', 'Where is HQ?')");
  console.log("  2018-2021: Places in News (match-the-following for conflict zones)");
  console.log("  2022-2025: Deep Institutional (mandates, voting shares, origins)");
  console.log("");

  const eras = [
    { label: "2013-2017", years: ["2013", "2014", "2015", "2016", "2017"] },
    { label: "2018-2021", years: ["2018", "2019", "2020", "2021"] },
    { label: "2022-2025", years: ["2022", "2023", "2024", "2025"] },
  ];

  for (const era of eras) {
    const eraStyles = {};
    let eraCA = 0;
    let eraTotal = 0;
    const eraPatterns = [];
    for (const y of era.years) {
      if (!allResults[y]) continue;
      for (const q of allResults[y].irQuestions || []) {
        eraStyles[q.questionStyle] = (eraStyles[q.questionStyle] || 0) + 1;
        eraTotal++;
        if (q.classification === "ca-linked") eraCA++;
      }
      if (allResults[y].yearSummary?.notablePatterns) {
        eraPatterns.push(`  ${y}: ${allResults[y].yearSummary.notablePatterns}`);
      }
    }
    const topStyle = Object.entries(eraStyles)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([s, c]) => `${s}(${c})`)
      .join(", ");
    console.log(
      `[${era.label}] ${eraTotal} IR Qs | CA: ${eraCA}/${eraTotal} (${eraTotal ? ((eraCA / eraTotal) * 100).toFixed(0) : 0}%) | Styles: ${topStyle}`,
    );
    eraPatterns.forEach((p) => console.log(p));
    console.log("");
  }

  // 3. Sub-topic coverage analysis
  console.log("--- SUB-TOPIC COVERAGE (Extracted vs Codebase) ---\n");
  const sortedSubTopics = [...allSubTopics.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );

  console.log("Top extracted sub-topics (by frequency across years):");
  for (const [topic, years] of sortedSubTopics.slice(0, 30)) {
    const inCodebase = allCodebaseSubTopics.has(topic.toLowerCase()) ? "✅" : "❌";
    console.log(
      `  ${inCodebase} ${topic} (${years.length}x: ${[...new Set(years)].join(",")})`,
    );
  }

  // 4. Missing from codebase
  console.log("\n--- THEMES IN PYQs BUT POTENTIALLY MISSING FROM CODEBASE ---\n");
  const missingTopics = sortedSubTopics.filter(
    ([topic]) => !allCodebaseSubTopics.has(topic.toLowerCase()),
  );
  if (missingTopics.length === 0) {
    console.log("  All extracted sub-topics are covered! 🎉");
  } else {
    for (const [topic, years] of missingTopics.slice(0, 25)) {
      console.log(
        `  ❌ ${topic} (${years.length}x: ${[...new Set(years)].join(",")})`,
      );
    }
  }

  // 5. Question style distribution
  console.log("\n--- QUESTION STYLE DISTRIBUTION ---\n");
  const sortedStyles = Object.entries(styleDistribution).sort(
    (a, b) => b[1] - a[1],
  );
  for (const [style, count] of sortedStyles) {
    const pct = ((count / grandTotalIR) * 100).toFixed(1);
    console.log(`  ${style.padEnd(25)} ${String(count).padStart(3)} (${pct}%)`);
  }

  // 6. Difficulty distribution
  console.log("\n--- DIFFICULTY DISTRIBUTION ---\n");
  for (const [diff, count] of Object.entries(difficultyDistribution).sort()) {
    const pct = ((count / grandTotalIR) * 100).toFixed(1);
    console.log(`  ${diff.padEnd(15)} ${String(count).padStart(3)} (${pct}%)`);
  }

  // 7. CA% trend over time
  console.log("\n--- CA% TREND OVER TIME ---\n");
  for (const s of yearlyStats) {
    const bar = "█".repeat(Math.round(parseFloat(s.caPct) / 5));
    console.log(`  ${s.year}  ${s.caPct.padStart(5)}%  ${bar}`);
  }

  // Save validation report
  const report = {
    summary: {
      totalIRQuestions: grandTotalIR,
      totalPaperQuestions: grandTotal,
      irPercentage: ((grandTotalIR / grandTotal) * 100).toFixed(1),
      staticCount: grandTotalStatic,
      caCount: grandTotalCA,
      staticPct: ((grandTotalStatic / grandTotalIR) * 100).toFixed(1),
      caPct: ((grandTotalCA / grandTotalIR) * 100).toFixed(1),
    },
    yearlyStats,
    extractedThemes: Object.fromEntries(allExtractedThemes),
    topSubTopics: sortedSubTopics.slice(0, 50).map(([t, y]) => ({
      topic: t,
      count: y.length,
      years: [...new Set(y)],
    })),
    missingFromCodebase: missingTopics.slice(0, 25).map(([t, y]) => ({
      topic: t,
      count: y.length,
      years: [...new Set(y)],
    })),
    styleDistribution,
    difficultyDistribution,
  };

  writeFileSync(VALIDATION_FILE, JSON.stringify(report, null, 2));
  console.log(`\nValidation report saved to ${VALIDATION_FILE}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  let allResults;

  if (phase2Only) {
    if (!existsSync(OUTPUT_FILE)) {
      console.error(`No extraction results found at ${OUTPUT_FILE}. Run phase 1 first.`);
      process.exit(1);
    }
    allResults = JSON.parse(readFileSync(OUTPUT_FILE, "utf8"));
    console.log(`Loaded ${Object.keys(allResults).length} years from ${OUTPUT_FILE}`);
  } else {
    const sa = loadServiceAccount();
    const model = createClient(sa);
    allResults = await phase1(model);
  }

  phase2(allResults);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
