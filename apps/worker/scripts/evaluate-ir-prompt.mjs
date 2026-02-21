import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { VertexAI } from "../node_modules/@google-cloud/vertexai/build/src/index.js";

// ============================================================================
// CONFIGURATION
// ============================================================================
const MODEL = "gemini-3.1-pro-preview";
const LOCATION = "global";
const PYQ_DIR = "../pyqs/GS/parsed"; // Relative to this script

// ----------------------------------------------------------------------------
// CANDIDATE PROMPT (FROM polity.ts)
// ----------------------------------------------------------------------------
const CANDIDATE_PROMPT = `
INTERNATIONAL RELATIONS & REGIONAL GROUPINGS:
- BRICS summit facts (Kazan chairship/expansion)
- Regional cooperation: BIMSTEC members, origin
- NATO membership
- UN system: International Years themes
- UNCLOS basics: territorial sea, EEZ
`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function loadServiceAccount() {
  try {
    // Try loading from ../.env (apps/worker/.env)
    const envPath = join(process.cwd(), "../.env");
    let envFile;
    try {
      envFile = readFileSync(envPath, "utf8");
    } catch (e) {
      try {
        envFile = readFileSync(".env", "utf8");
      } catch (e2) {
        throw new Error("Could not find .env file");
      }
    }
    
    const line = envFile.split("\n").find(l => l.startsWith("GCP_SERVICE_ACCOUNT="));
    if (!line) throw new Error("GCP_SERVICE_ACCOUNT not found in .env");
    
    const jsonStr = line.split("=").slice(1).join("=");
    // Handle potential quotes
    const cleanJson = jsonStr.trim().replace(/^'|'$/g, "").replace(/^"|"$/g, "");
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Error loading service account:", error.message);
    process.exit(1);
  }
}

function createClient(sa) {
  console.log(`Creating Vertex AI client for project: ${sa.project_id} (Location: ${LOCATION})`);
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
      maxOutputTokens: 65536, // Increased for long report
      temperature: 0.2,
    },
  });
}

function loadIRQuestions() {
  const dir = join(process.cwd(), PYQ_DIR);
  const files = readdirSync(dir).filter(f => f.endsWith(".json")).sort();
  let irQuestions = [];

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(dir, file), "utf8"));
      const year = data.year;
      const questions = data.questions || [];
      
      const ir = questions.filter(q => {
        const subj = (q.metadata?.subject || "").toLowerCase();
        // Check metadata subject
        if (subj === "international relations" || subj.includes("international") || subj === "ir") return true;
        
        // Also check if category was misclassified but it's clearly IR based on text/explanation
        // (Simple heuristic keywords)
        const text = (q.questionText + " " + q.explanation).toLowerCase();
        const keywords = ["united nations", "wto", "g20", "asean", "brics", "treaty", "convention", "bilateral", "summit", "protocol"];
        const matchesKeyword = keywords.some(k => text.includes(k));
        
        // If subject is "polity" or "economy" or "current affairs" but has strong IR keywords, include it for evaluation
        if ((subj === "polity" || subj === "economy" || subj === "current affairs") && matchesKeyword) return true;

        return false;
      });

      irQuestions.push(...ir.map(q => ({
        year,
        id: q.sequenceNumber,
        text: q.questionText,
        options: q.options,
        explanation: q.explanation,
        metadata: q.metadata
      })));
    } catch (e) {
      console.warn(`Failed to read ${file}:`, e.message);
    }
  }
  return irQuestions;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("Loading service account...");
  const sa = loadServiceAccount();
  const model = createClient(sa);

  console.log("Loading parsed PYQs...");
  const irQuestions = loadIRQuestions();
  console.log(`Found ${irQuestions.length} International Relations related questions across all years.`);

  if (irQuestions.length === 0) {
    console.log("No IR questions found. Exiting.");
    return;
  }

  // Format ALL questions by year
  const questionsText = irQuestions.map(q => 
    `[${q.year} Q${q.id}]
Question: ${q.text}
Explanation: ${q.explanation}
`
  ).join("\n---\n\n");

  const prompt = `
You are an expert UPSC Civil Services content evaluator.
I have a candidate prompt designed to generate 'International Relations' questions for the UPSC Prelims 2026.
I need to know if this prompt is SUFFICIENT to generate high-quality, authentic questions that match the depth, style, and topic diversity of actual past UPSC questions (2013-2025).

HERE IS THE CANDIDATE PROMPT (The "Theme List"):
"""
${CANDIDATE_PROMPT}
"""

HERE ARE ACTUAL UPSC INTERNATIONAL RELATIONS QUESTIONS FROM 2013-2025:
"""
${questionsText}
"""

TASK:
1. **Analyze the PYQs**: Briefly summarize the evolution of IR questions. What topics are recurring? What is the ratio of "Organizations/Summits" vs "Bilateral Relations" vs "Concepts"? How has the difficulty changed?
2. **Evaluate the Candidate Prompt**: Does the provided theme list cover the breadth of the PYQs? 
   - Is it too narrow?
   - Does it miss major recurring areas (e.g., Middle East, Africa, Specific Treaties)?
3. **Identify Gaps**: List SPECIFIC topics, regions, or types of questions found in the PYQs that are MISSING from the candidate prompt.
4. **Rewrite the Prompt**: Provide a **REVISED & EXPANDED** version of the candidate prompt that includes the missing themes. The new prompt should be comprehensive enough to capture the full range of UPSC IR questions.

OUTPUT FORMAT:
# 1. PYQ Analysis (Trends & Patterns)
...

# 2. Prompt Evaluation (Sufficiency Check)
...

# 3. Missing Themes & Gaps
...

# 4. RECOMMENDED NEW PROMPT
(Provide the full, improved list of themes here)
`;

  console.log("Sending all questions to Gemini 3.1 Pro Preview...");
  const result = await model.generateContent(prompt);
  const response = result.response.candidates[0].content.parts[0].text;

  console.log("\n" + "=".repeat(80));
  console.log("EVALUATION REPORT");
  console.log("=".repeat(80) + "\n");
  console.log(response);
}

main().catch(console.error);
