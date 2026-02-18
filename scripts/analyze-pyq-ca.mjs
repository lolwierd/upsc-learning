/**
 * Analyze PYQ CA classifications across all years and subjects.
 * Produces a summary of how questions are currently classified.
 *
 * Usage: node scripts/analyze-pyq-ca.mjs
 */
import { readFileSync, readdirSync } from "fs";

const PYQ_DIR = "apps/worker/pyqs/GS/parsed";
const files = readdirSync(PYQ_DIR).filter(f => f.endsWith(".json")).sort();

// Collect all unique categories to understand the taxonomy
const allCategories = new Set();

// Per-subject, per-year tallies
const subjectYearData = {}; // { subject: { year: { static: N, ca: N } } }
const yearTotals = {};       // { year: { static: N, ca: N, total: N } }

// Track all distinct category values
const categoryExamples = {};  // { category: [{ year, qNum, subject, snippet }] }

for (const file of files) {
  const data = JSON.parse(readFileSync(`${PYQ_DIR}/${file}`, "utf8"));
  const year = data.year;
  if (!yearTotals[year]) yearTotals[year] = { static: 0, ca: 0, total: 0 };

  for (const q of data.questions) {
    const cat = (q.metadata?.category || "unknown").toLowerCase().trim();
    const subj = (q.metadata?.subject || "unknown").toLowerCase().trim();
    allCategories.add(cat);

    // Binary classification: is this "static" or "CA-linked"?
    const isStatic = cat === "pure-static" || cat === "static" || cat === "static-theory";

    if (!subjectYearData[subj]) subjectYearData[subj] = {};
    if (!subjectYearData[subj][year]) subjectYearData[subj][year] = { static: 0, ca: 0 };

    if (isStatic) {
      subjectYearData[subj][year].static++;
      yearTotals[year].static++;
    } else {
      subjectYearData[subj][year].ca++;
      yearTotals[year].ca++;
    }
    yearTotals[year].total++;

    // Track examples for each category
    if (!categoryExamples[cat]) categoryExamples[cat] = [];
    if (categoryExamples[cat].length < 2) {
      categoryExamples[cat].push({
        year,
        qNum: q.sequenceNumber,
        subject: subj,
        snippet: q.questionText.slice(0, 80),
      });
    }
  }
}

// === Output ===

console.log("=".repeat(80));
console.log("PYQ CURRENT AFFAIRS CLASSIFICATION ANALYSIS");
console.log("=".repeat(80));

// 1. All unique categories
console.log("\n--- ALL UNIQUE metadata.category VALUES ---\n");
const catCounts = {};
for (const file of files) {
  const data = JSON.parse(readFileSync(`${PYQ_DIR}/${file}`, "utf8"));
  for (const q of data.questions) {
    const cat = (q.metadata?.category || "unknown").toLowerCase().trim();
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  }
}
const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
for (const [cat, count] of sortedCats) {
  const isStatic = cat === "pure-static" || cat === "static" || cat === "static-theory";
  console.log(`  ${cat.padEnd(35)} ${String(count).padStart(4)}  [${isStatic ? "STATIC" : "CA"}]`);
}
console.log(`  ${"TOTAL".padEnd(35)} ${String(Object.values(catCounts).reduce((a,b)=>a+b,0)).padStart(4)}`);

// 2. Year-by-year CA rate
console.log("\n--- YEAR-BY-YEAR CA RATE ---\n");
console.log("  Year  Total  Static  CA   CA%");
for (const year of Object.keys(yearTotals).sort()) {
  const { static: s, ca, total } = yearTotals[year];
  const pct = total > 0 ? Math.round(ca / total * 100) : 0;
  console.log(`  ${year}   ${String(total).padStart(4)}   ${String(s).padStart(4)}  ${String(ca).padStart(3)}   ${String(pct).padStart(3)}%`);
}

// 3. Per-subject CA rate (across all years)
console.log("\n--- PER-SUBJECT CA RATE (ALL YEARS COMBINED) ---\n");
console.log("  Subject".padEnd(25) + "Total  Static  CA   CA%   SD");

const subjectSummaries = {};
for (const [subj, years] of Object.entries(subjectYearData)) {
  let totalStatic = 0;
  let totalCA = 0;
  const yearPcts = [];
  for (const [year, counts] of Object.entries(years)) {
    totalStatic += counts.static;
    totalCA += counts.ca;
    const t = counts.static + counts.ca;
    if (t > 0) yearPcts.push(counts.ca / t * 100);
  }
  const total = totalStatic + totalCA;
  const avgPct = total > 0 ? totalCA / total * 100 : 0;
  const mean = yearPcts.length > 0 ? yearPcts.reduce((a, b) => a + b, 0) / yearPcts.length : 0;
  const variance = yearPcts.length > 0
    ? yearPcts.reduce((a, b) => a + (b - mean) ** 2, 0) / yearPcts.length
    : 0;
  const sd = Math.sqrt(variance);
  subjectSummaries[subj] = { total, static: totalStatic, ca: totalCA, avgPct, sd };

  console.log(
    `  ${subj.padEnd(23)} ${String(total).padStart(4)}   ${String(totalStatic).padStart(4)}  ${String(totalCA).padStart(3)}   ${avgPct.toFixed(1).padStart(5)}%  ${sd.toFixed(1).padStart(5)}`
  );
}

// 4. Per-subject, per-year detail
console.log("\n--- PER-SUBJECT CA% BY YEAR ---\n");
const subjects = Object.keys(subjectYearData).sort();
const years = Object.keys(yearTotals).sort();

// Header
process.stdout.write("  " + "Subject".padEnd(20));
for (const y of years) process.stdout.write(y.slice(2).padStart(5));
process.stdout.write("   AVG\n");

for (const subj of subjects) {
  process.stdout.write("  " + subj.padEnd(20));
  const pcts = [];
  for (const y of years) {
    const d = subjectYearData[subj]?.[y];
    if (d) {
      const t = d.static + d.ca;
      const pct = t > 0 ? Math.round(d.ca / t * 100) : 0;
      pcts.push(pct);
      process.stdout.write(String(pct + "%").padStart(5));
    } else {
      process.stdout.write("   - ".padStart(5));
    }
  }
  const avg = pcts.length > 0 ? (pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(0) : "-";
  process.stdout.write(`  ${String(avg + "%").padStart(5)}\n`);
}

// 5. Compare with SUBJECT_CA_RATIOS from code
console.log("\n--- COMPARISON: DATA vs CODE ---\n");
const CODE_RATIOS = {
  history:     0.17,
  geography:   0.44,
  art_culture: 0.23,
  science:     0.80,
  polity:      0.49,
  economy:     0.71,
  environment: 0.63,
};

// Map subject names (PYQ data may use different naming)
const SUBJECT_MAP = {
  history: "history",
  geography: "geography",
  "art & culture": "art_culture",
  "art_culture": "art_culture",
  culture: "art_culture",
  "science & technology": "science",
  "science": "science",
  polity: "polity",
  "polity & governance": "polity",
  economy: "economy",
  environment: "environment",
  "environment & ecology": "environment",
};

console.log("  Subject".padEnd(25) + "Data CA%  Code CA%  Delta");
for (const [pyqSubj, summary] of Object.entries(subjectSummaries)) {
  const mapped = SUBJECT_MAP[pyqSubj];
  if (mapped && CODE_RATIOS[mapped] !== undefined) {
    const codeCA = CODE_RATIOS[mapped] * 100;
    const delta = summary.avgPct - codeCA;
    const flag = Math.abs(delta) > 5 ? " ⚠️" : " ✓";
    console.log(
      `  ${pyqSubj.padEnd(23)} ${summary.avgPct.toFixed(1).padStart(6)}%  ${codeCA.toFixed(1).padStart(6)}%  ${(delta >= 0 ? "+" : "") + delta.toFixed(1).padStart(5)}%${flag}`
    );
  } else {
    console.log(`  ${pyqSubj.padEnd(23)} ${summary.avgPct.toFixed(1).padStart(6)}%  (no code mapping)`);
  }
}

// 6. Non-static category examples for spot-checking
console.log("\n--- SAMPLE CA-CLASSIFIED QUESTIONS (for spot-check) ---\n");
const caCats = sortedCats.filter(([cat]) => {
  return cat !== "pure-static" && cat !== "static" && cat !== "static-theory";
});
for (const [cat] of caCats.slice(0, 8)) {
  console.log(`[${cat}]`);
  for (const ex of categoryExamples[cat] || []) {
    console.log(`  ${ex.year} Q${ex.qNum} (${ex.subject}): ${ex.snippet}...`);
  }
}
