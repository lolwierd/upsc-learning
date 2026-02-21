
import { getSubjectThemes, getSubjectStrategicTraps } from "../src/prompts/themes/index.js";
import { getSubjectAnalysis } from "../src/prompts/subject-analysis.js";

const subject = "international relations";

console.log(`Validating integration for subject: "${subject}"...`);

// 1. Check Themes
const themes = getSubjectThemes(subject);
if (themes && themes.includes("INTERNATIONAL RELATIONS & GLOBAL ISSUES")) {
    console.log("✅ Themes loaded correctly.");
} else {
    console.error("❌ Themes NOT loaded or content mismatch.");
    console.log("Content preview:", themes ? themes.slice(0, 100) : "null");
}

// 2. Check Traps
const traps = getSubjectStrategicTraps(subject);
if (traps && traps.includes("INTERNATIONAL RELATIONS TRAP PATTERNS")) {
    console.log("✅ Strategic Traps loaded correctly.");
} else {
    console.error("❌ Strategic Traps NOT loaded.");
    console.log("Content preview:", traps ? traps.slice(0, 100) : "null");
}

// 3. Check Analysis
const analysis = getSubjectAnalysis(subject);
if (analysis && analysis.includes("INTERNATIONAL RELATIONS - UPSC PATTERN ANALYSIS")) {
    console.log("✅ Subject Analysis loaded correctly.");
} else {
    console.error("❌ Subject Analysis NOT loaded.");
    console.log("Content preview:", analysis ? analysis.slice(0, 100) : "null");
}

console.log("\nValidation complete.");
