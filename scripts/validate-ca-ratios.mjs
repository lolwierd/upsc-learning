/**
 * Validation script for per-subject CA ratios in prompts.
 *
 * Usage:  node --experimental-specifier-resolution=node scripts/validate-ca-ratios.mjs
 *
 * Tests that getPrompt() emits the correct per-subject percentages.
 */
import { getPrompt } from "../apps/worker/dist/prompts/index.js";

const SUBJECTS = [
  "history",
  "geography",
  "art_culture",
  "science",
  "polity",
  "economy",
  "environment",
];

// Exact CA ratios (matching SUBJECT_CA_RATIOS in prompts/index.ts)
// Validated by Gemini 3 Pro classification — 2017-2025 PYQs only
const SUBJECT_CA_RATIOS = {
  history:     0.20,  // TEMP-CA-OVERRIDE: was 0.17. Revert here AND in prompts/index.ts.
  geography:   0.44,
  art_culture: 0.23,
  science:     0.80,
  polity:      0.20,  // TEMP-CA-OVERRIDE: was 0.49. Revert here AND in prompts/index.ts.
  economy:     0.71,
  environment: 0.63,
};

// Compute expected values the same way the code does
function computeExpected(subject) {
  const totalCA = SUBJECT_CA_RATIOS[subject];
  const directCA = totalCA * 0.375;
  const derivedStatic = totalCA * 0.625;
  const dcPct = Math.round(directCA * 100);
  const dsPct = Math.round(derivedStatic * 100);
  const psPct = 100 - dcPct - dsPct;
  return { dc: dcPct, ds: dsPct, ps: psPct, dcExact: directCA, dsExact: derivedStatic };
}

const EXPECTED = Object.fromEntries(
  Object.keys(SUBJECT_CA_RATIOS).map(s => [s, computeExpected(s)])
);

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

console.log("=== Per-Subject CA Ratio Validation ===\n");

// Test single-subject prompts
for (const subject of SUBJECTS) {
  const prompt = getPrompt({
    subject,
    totalCount: 10,
    enableCurrentAffairs: true,
  });

  const exp = EXPECTED[subject];
  console.log(`[${subject}] expecting DC=${exp.dc}% DS=${exp.ds}% PS=${exp.ps}%`);

  // Check CONTENT BALANCE section has the right header
  const balancePattern = new RegExp(
    `${exp.dc}% DIRECT CA \\+ ${exp.ds}% DERIVED STATIC \\+ ${exp.ps}% PURE STATIC`
  );
  assert(
    balancePattern.test(prompt),
    `${subject}: CONTENT BALANCE header should show ${exp.dc}/${exp.ds}/${exp.ps}`
  );

  // Check CRITICAL FINAL INSTRUCTION has computed counts for 10 questions
  // Use exact floating-point ratios (same as actual code), not rounded pcts
  const dcCount = Math.round(10 * exp.dcExact);
  const dsCount = Math.round(10 * exp.dsExact);
  const psCount = 10 - dcCount - dsCount;

  const dcCountPattern = new RegExp(`DIRECT CA \\(${exp.dc}% = ${dcCount} questions\\)`);
  const dsCountPattern = new RegExp(`DERIVED STATIC \\(${exp.ds}% = ${dsCount} questions\\)`);
  const psCountPattern = new RegExp(`PURE STATIC \\(${exp.ps}% = ${psCount} questions\\)`);

  assert(dcCountPattern.test(prompt), `${subject}: Final instruction DC count ${dcCount} not found`);
  assert(dsCountPattern.test(prompt), `${subject}: Final instruction DS count ${dsCount} not found`);
  assert(psCountPattern.test(prompt), `${subject}: Final instruction PS count ${psCount} not found`);

  // Sanity: prompt should NOT contain the old flat "15% / 25% / 60%" override
  assert(
    !prompt.includes("15% / 25% / 60%"),
    `${subject}: Old flat ratio "15% / 25% / 60%" still present!`
  );

  console.log(`  OK (DC=${dcCount}, DS=${dsCount}, PS=${psCount} for 10Q)\n`);
}

// Test random mode prompt
console.log("[random] testing per-subject table in random mode prompt");
const randomPrompt = getPrompt({
  subject: "random",
  totalCount: 20,
  enableCurrentAffairs: true,
});

// Random mode should have the per-subject table
// TEMP-CA-OVERRIDE: History/Polity rows asserted at 20% Total CA (was 17%/49%).
assert(
  randomPrompt.includes("| History        | 20%"),
  "random: Per-subject table should include History 20%"
);
assert(
  randomPrompt.includes("| Polity         | 20%"),
  "random: Per-subject table should include Polity 20%"
);
assert(
  randomPrompt.includes("| Environment    | 63%"),
  "random: Per-subject table should include Environment 63%"
);
assert(
  !randomPrompt.includes("EXACTLY 15% Direct CA"),
  "random: Old flat EXACTLY 15% should be gone"
);
assert(
  randomPrompt.includes("PER-SUBJECT CA ratios"),
  "random: Final instruction should mention per-subject ratios"
);
console.log("  OK\n");

// Test with 40 questions (larger quiz)
console.log("=== 40-Question Count Validation ===\n");
for (const subject of ["history", "environment"]) {
  const prompt = getPrompt({
    subject,
    totalCount: 40,
    enableCurrentAffairs: true,
  });

  const exp = EXPECTED[subject];
  const dcCount = Math.round(40 * exp.dcExact);
  const dsCount = Math.round(40 * exp.dsExact);
  const psCount = 40 - dcCount - dsCount;

  console.log(`[${subject}] 40Q → DC=${dcCount}, DS=${dsCount}, PS=${psCount}`);

  const dcCountPattern = new RegExp(`DIRECT CA \\(${exp.dc}% = ${dcCount} questions\\)`);
  const psCountPattern = new RegExp(`PURE STATIC \\(${exp.ps}% = ${psCount} questions\\)`);

  assert(dcCountPattern.test(prompt), `${subject} 40Q: DC count ${dcCount} not found`);
  assert(psCountPattern.test(prompt), `${subject} 40Q: PS count ${psCount} not found`);
  console.log("  OK\n");
}

// Summary
console.log("=== Results ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error("\nSome tests FAILED!");
  process.exit(1);
} else {
  console.log("\nAll tests passed!");
}
