/**
 * Analyze Gemini CA validation results for specific year ranges.
 * Usage: node scripts/analyze-gemini-results.mjs [startYear]
 * Default: 2017 (papers after 2016)
 */
import { readFileSync } from "fs";

const startYear = parseInt(process.argv[2] || "2017", 10);
const data = JSON.parse(readFileSync("scripts/ca-validation-results.json", "utf8"));

// Subject name normalization
const SUBJECT_MAP = {
  "history": "history",
  "culture": "art_culture",
  "geography": "geography",
  "polity": "polity",
  "environment": "environment",
  "economy": "economy",
  "science": "science",
  "international-relations": null, // skip — not a main GS subject
  "current-affairs": null,
  "science & technology": "science",
  "international relations": null,
  "security & defence": null,
};

const subjectStats = {}; // { subject: { years: { [year]: { static, ca } }, totalStatic, totalCA } }
const yearStats = {};

for (const [yearStr, yearData] of Object.entries(data)) {
  const year = parseInt(yearStr, 10);
  if (year < startYear) continue;

  yearStats[year] = { static: 0, ca: 0, total: 0 };

  for (const q of yearData.geminiResults) {
    const rawSubj = (q.subject || "unknown").toLowerCase().trim();
    const mapped = SUBJECT_MAP[rawSubj];
    if (mapped === null) continue; // skip non-main subjects
    if (mapped === undefined) {
      console.warn(`  Unknown subject: "${rawSubj}" (${year} Q${q.qNum})`);
      continue;
    }

    if (!subjectStats[mapped]) {
      subjectStats[mapped] = { totalStatic: 0, totalCA: 0, years: {} };
    }
    if (!subjectStats[mapped].years[year]) {
      subjectStats[mapped].years[year] = { static: 0, ca: 0 };
    }

    const isCA = !q.geminiIsStatic;
    if (isCA) {
      subjectStats[mapped].totalCA++;
      subjectStats[mapped].years[year].ca++;
      yearStats[year].ca++;
    } else {
      subjectStats[mapped].totalStatic++;
      subjectStats[mapped].years[year].static++;
      yearStats[year].static++;
    }
    yearStats[year].total++;
  }
}

console.log("=".repeat(80));
console.log(`GEMINI CA ANALYSIS: ${startYear}-2025 ONLY`);
console.log("=".repeat(80));

// Year-by-year
console.log("\n--- YEAR-BY-YEAR ---\n");
console.log("  Year  Total  Static  CA   CA%");
for (const year of Object.keys(yearStats).sort()) {
  const { static: s, ca, total } = yearStats[year];
  const pct = total > 0 ? (ca / total * 100).toFixed(1) : "0.0";
  console.log(`  ${year}   ${String(total).padStart(4)}   ${String(s).padStart(4)}  ${String(ca).padStart(3)}  ${pct.padStart(5)}%`);
}

// Per-subject
console.log("\n--- PER-SUBJECT CA RATES ---\n");
console.log("  Subject".padEnd(20) + "Total  Static   CA   CA%     SD");

const sorted = Object.entries(subjectStats).sort((a, b) => {
  const aPct = a[1].totalCA / (a[1].totalCA + a[1].totalStatic);
  const bPct = b[1].totalCA / (b[1].totalCA + b[1].totalStatic);
  return aPct - bPct;
});

const newRatios = {};

for (const [subj, stats] of sorted) {
  const total = stats.totalStatic + stats.totalCA;
  const caPct = total > 0 ? stats.totalCA / total * 100 : 0;

  // Compute SD across years
  const yearPcts = [];
  for (const [, counts] of Object.entries(stats.years)) {
    const t = counts.static + counts.ca;
    if (t > 0) yearPcts.push(counts.ca / t * 100);
  }
  const mean = yearPcts.length > 0 ? yearPcts.reduce((a, b) => a + b, 0) / yearPcts.length : 0;
  const variance = yearPcts.length > 0
    ? yearPcts.reduce((a, b) => a + (b - mean) ** 2, 0) / yearPcts.length
    : 0;
  const sd = Math.sqrt(variance);

  newRatios[subj] = Math.round(caPct) / 100;

  console.log(
    `  ${subj.padEnd(18)} ${String(total).padStart(4)}   ${String(stats.totalStatic).padStart(4)}  ${String(stats.totalCA).padStart(4)}  ${caPct.toFixed(1).padStart(5)}%  ${sd.toFixed(1).padStart(6)}`
  );
}

// Per-subject per-year detail
console.log("\n--- PER-SUBJECT CA% BY YEAR ---\n");
const subjects = sorted.map(([s]) => s);
const years = Object.keys(yearStats).sort();

process.stdout.write("  " + "Subject".padEnd(16));
for (const y of years) process.stdout.write(y.slice(2).padStart(5));
process.stdout.write("   AVG\n");

for (const subj of subjects) {
  process.stdout.write("  " + subj.padEnd(16));
  const pcts = [];
  for (const y of years) {
    const d = subjectStats[subj]?.years[parseInt(y, 10)];
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

// Current code ratios comparison
const CODE_RATIOS = {
  history:     0.13,
  geography:   0.39,
  art_culture: 0.21,
  science:     0.71,
  polity:      0.44,
  economy:     0.67,
  environment: 0.60,
};

console.log("\n--- COMPARISON: 2017+ RATIOS vs CURRENT CODE ---\n");
console.log("  Subject".padEnd(20) + "2017+ CA%  Code CA%  Delta   Suggested");
for (const [subj, ratio] of sorted) {
  const total = subjectStats[subj].totalStatic + subjectStats[subj].totalCA;
  const caPct = total > 0 ? subjectStats[subj].totalCA / total * 100 : 0;
  const codeRatio = CODE_RATIOS[subj];
  if (codeRatio !== undefined) {
    const codePct = codeRatio * 100;
    const delta = caPct - codePct;
    const suggested = (Math.round(caPct) / 100).toFixed(2);
    const flag = Math.abs(delta) > 5 ? " ⚠️" : " ✓";
    console.log(
      `  ${subj.padEnd(18)} ${caPct.toFixed(1).padStart(6)}%  ${codePct.toFixed(1).padStart(6)}%  ${(delta >= 0 ? "+" : "") + delta.toFixed(1).padStart(5)}%${flag}  ${suggested}`
    );
  }
}

// Output suggested code block
console.log("\n--- SUGGESTED SUBJECT_CA_RATIOS ---\n");
console.log("const SUBJECT_CA_RATIOS: Record<string, number> = {");
const order = ["history", "art_culture", "geography", "polity", "environment", "economy", "science"];
for (const subj of order) {
  const stats = subjectStats[subj];
  if (!stats) continue;
  const total = stats.totalStatic + stats.totalCA;
  const ratio = total > 0 ? stats.totalCA / total : 0;
  const rounded = (Math.round(ratio * 100) / 100).toFixed(2);
  console.log(`  ${(subj + ":").padEnd(16)} ${rounded},  // ${Math.round(ratio * 100)}% CA (${startYear}-2025, n=${total})`);
}
console.log("};");
