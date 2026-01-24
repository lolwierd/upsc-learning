import type { QuestionStyle, Difficulty } from "@mcqs/shared";

interface StyleDistribution {
  style: QuestionStyle;
  count: number;
}

// Era types for generating questions in different UPSC styles
export type QuestionEra = 
  | "2011-2013"  // Foundation: Direct factual, simple 2-statement, NCERT-based
  | "2014-2017"  // Transition: 3-statement dominant, Match List-I/II, current affairs rise
  | "2018-2020"  // Sophistication: Conceptual + code-based statement questions (repo PYQs show little/no A-R wording)
  | "2021-2023"  // Complexity: Multi-statement heavy; "How many" rises (repo PYQs: starts 2022, spikes 2023)
  | "2024-2025"  // Current: Mixed templates; Statement-I/II + row-correctness tables appear (repo PYQs show mix)
  | "current"    // Alias for latest (2024-2025)
  | "all";       // Mixed: Distribute questions across all eras

// All available eras (excluding aliases)
export const ALL_ERAS: Exclude<QuestionEra, "current" | "all">[] = [
  "2011-2013",
  "2014-2017", 
  "2018-2020",
  "2021-2023",
  "2024-2025",
];

interface PromptParams {
  subject: string;
  theme?: string;
  difficulty: Difficulty;
  styles: StyleDistribution[];
  totalCount: number;
  era?: QuestionEra; // Optional: Generate questions in specific era's style
  enableCurrentAffairs?: boolean; // Enable current affairs context injection
  currentAffairsTheme?: string; // Optional focus area for current affairs
}

// ============================================================================
// CURRENT AFFAIRS INTEGRATION CONTEXT
// ============================================================================
const CURRENT_AFFAIRS_CONTEXT = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT AFFAIRS INTEGRATION (ENABLED):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You have access to Google Search for retrieving recent information. Use this to:

1. INTEGRATE RECENT EVENTS as TRIGGERS for static concepts:
   - "In context of India's G20 Presidency 2023..." → Test foreign policy concepts
   - "With reference to Chandrayaan-3 mission..." → Test space fundamentals
   - "Considering the 2024 interim budget..." → Test fiscal policy concepts

2. TIME FRAME for current affairs:
   - Focus on events from the last 18-24 months
   - Include major policy announcements, summits, agreements
   - Reference official sources (PIB, government websites, official reports)

3. QUESTION DESIGN with current affairs:
   - Current event as TRIGGER, static syllabus as ANSWER
   - Don't test obscure news details - test concepts triggered by news
   - After each question, add "Relevance" note in explanation linking to recent event
   - Ensure at least 60% of questions are anchored to a verifiable recent event

4. HIGH-VALUE CURRENT AFFAIRS TOPICS:
   - International summits and India's role (G20, BRICS, SCO, etc.)
   - Recent government schemes and their objectives
   - Constitutional amendments and their implications
   - Recent Supreme Court judgments of constitutional significance
   - Scientific achievements (ISRO, DRDO, Indigenous tech)
   - Environmental developments (Climate commitments, Conventions)
   - Economic reforms and policies

5. EXPLANATION ENHANCEMENT:
   For each question, in the explanation add:
   - RELEVANCE: How this relates to recent events/developments
   - STATIC LINK: The underlying concept from the UPSC syllabus
   - Append a final bracketed line exactly like:
     [Relevance: <event + month/year + source type>]

REMEMBER: Current affairs provide CONTEXT, but the core test should be of static concepts.
`;

const CURRENT_AFFAIRS_THEME_CONTEXT = (theme: string) => `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT AFFAIRS FOCUS THEME: ${theme}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate questions specifically focusing on recent developments related to: "${theme}"

Use Google Search to find the latest information on this topic and create questions
that test understanding of underlying concepts through the lens of these recent events.
`;

// ============================================================================
// UPSC PRELIMS EXAM CONTEXT
// ============================================================================
// - 100 questions, 200 marks (2 marks per question)
// - Negative marking: 0.66 marks deducted per wrong answer (1/3rd of 2)
// - Duration: 2 hours
// - Cut-off typically ranges from 75-100 marks depending on difficulty
// - Questions are designed to be elimination-proof with sophisticated distractors

// ============================================================================
// UPSC STEM TEMPLATES (MUST FOLLOW VERBATIM PATTERNS)
// ============================================================================
const UPSC_STEM_TEMPLATES = `
MANDATORY UPSC PHRASING PATTERNS (Use these exact phrasings):

STATEMENT QUESTIONS:
- "Consider the following statements:"
- "Consider the following statements regarding [topic]:"
- "With reference to [topic], consider the following statements:"

PAIR/MATCH QUESTIONS:
- "Consider the following pairs:"
- "Match List-I with List-II and select the correct answer using the code given below:"

FACTUAL QUESTIONS:
- "Which of the following..."
- "Which one of the following..."
- "With reference to..., which of the following statements is/are correct?"

HOW MANY PATTERN (VERY IMPORTANT - HIGH FREQUENCY IN 2021-2024):
- "How many of the above statements is/are correct?"
- "How many of the above statements are correct?"
- "How many of the statements given above are correct?"
- "How many of the above pairs are correctly matched?"
- "How many of the pairs given above are correctly matched?"
- "How many pairs given above are correctly matched?"
- "How many pairs given above are not correctly matched?"
- "How many of the above is/are..."
- "In which of the above rows is the given information correctly matched?"

ANSWER CODE PHRASES:
- "Select the correct answer using the code given below:"
- "Which of the statements given above is/are correct?"
- "Which one of the following is correct in respect of the above statements?"
`;

// ============================================================================
// MISCONCEPTION-BASED DISTRACTOR BLUEPRINT
// ============================================================================
const DISTRACTOR_BLUEPRINT = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DISTRACTOR DESIGN BLUEPRINT (MUST APPLY AT LEAST 2 PER QUESTION):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ADJACENT CONCEPT TRAP:
   Use a closely related but different concept
   Examples: CBDC vs cryptocurrency | Repo rate vs Bank rate | Tiger Reserve vs National Park
   
2. SCOPE TRAP:
   Correct principle but wrong scope/jurisdiction
   Examples: Union List vs State List | Legal tender vs universally accepted | Central vs State subject

3. EXCEPTION TRAP:
   Statement is broadly true but fails due to a known exception
   Examples: "All fundamental rights are available to citizens" (wrong - some to all persons)
   
4. TERMINOLOGY TRAP:
   Confusing similar-sounding terms
   Examples: Delimitation Commission vs Finance Commission | Sterilization vs OMO | Prorogation vs Dissolution

5. TIME/VERSION TRAP:
   Outdated fact vs latest update (perfect for current affairs integration)
   Examples: Old article numbers vs post-amendment | Previous committee vs current

6. AUTHORITY TRAP:
   Wrong institution/act/agency mapping
   Examples: ISRO vs DRDO vs DAE | FSSAI vs GEAC | RBI vs SEBI | Ministry mapping errors

7. GEOGRAPHY/ENDEMISM TRAP:
   Wrong habitat/region associations
   Examples: Species found in Madagascar vs Africa | Western Ghats endemic vs Himalayan

CRITICAL RULE: Wrong options must be *nearly defensible* to a half-prepared student, but falsifiable by one precise fact.
`;

// ============================================================================
// SUBJECT-WISE TRAP LIBRARY
// ============================================================================
const SUBJECT_TRAP_LIBRARY: Record<string, string> = {
  polity: `
POLITY TRAP PATTERNS (Apply at least one per question):
- Articles vs Parts vs Schedules confusion
- Committee nature: Statutory vs Constitutional vs Ad-hoc
- Lapse vs Prorogation vs Dissolution implications
- Subject in Union/State/Concurrent list mapping
- Constitutional amendment numbers and what they changed
- "Borrowed from" which constitution traps
- Governor's discretionary vs constitutional duties
- Money Bill vs Finance Bill vs Appropriation Bill
- CAG vs Comptroller distinction
- Lokpal vs Lokayukta jurisdiction`,

  economy: `
ECONOMY TRAP PATTERNS (Apply at least one per question):
- Instrument vs Market: Money market vs Capital market instruments
- RBI tools: OMO vs Sterilization vs LAF vs MSF
- Credit line vs Fixed loan subtle conditions
- Taxation authority: Central vs State vs Shared
- External vs Internal debt classifications
- WTO vs IMF vs World Bank function mapping
- Fiscal deficit vs Revenue deficit vs Primary deficit
- FDI vs FPI vs FII distinctions
- NBFC vs Bank regulatory differences
- Recent: CBDC properties, PLI schemes, Production-linked distinctions`,

  environment: `
ENVIRONMENT TRAP PATTERNS (Apply at least one per question):
- Species distribution: Endemic vs Native vs Invasive
- Habitat mapping: Country ↔ Species natural habitat
- Taxonomy: Insect vs Bird vs Reptile classification
- Pollution sources: Primary vs Secondary pollutants
- Convention vs Agency mapping: CITES vs Ramsar vs CBD
- Biosphere reserves vs National Parks vs Wildlife Sanctuaries
- IUCN categories: Critically Endangered vs Vulnerable vs Near Threatened
- Coral reef vs Mangrove vs Wetland ecosystem confusions
- Western Ghats endemic species vs Eastern Himalayas
- Recent: Microplastics, GM regulations, Carbon markets`,

  science: `
SCIENCE & TECHNOLOGY TRAP PATTERNS (Apply at least one per question):
- Space agency programs: ISRO missions and their purposes
- Nuclear: Fission vs Fusion vs Decay mechanisms
- Recent tech: AI/ML, Quantum computing, Metaverse definitions
- Common misconceptions: Star lifecycle, planet classifications
- Agency mapping: ISRO vs DRDO vs DAE vs BARC
- Satellite types: GEO vs LEO vs MEO purposes
- Biotech: Gene editing vs GM vs traditional breeding
- Health: Disease mechanisms, vaccine types
- IT: Blockchain vs Crypto vs CBDC distinctions
- Defense: Indigenous vs Imported systems`,

  history: `
HISTORY TRAP PATTERNS (Apply at least one per question):
- Event chronology: Which came first
- Governor-General vs Viceroy period mapping
- Act provisions: Which act introduced what
- Freedom movement: Moderate vs Extremist vs Revolutionary
- Leader-movement association accuracy
- Battle-year-outcome combinations
- Reform movements: Social vs Religious vs Political
- Pre-independence parties and their founders
- Constitutional development: Acts from 1773 to 1947
- Regional movements and their leaders`,

  geography: `
GEOGRAPHY TRAP PATTERNS (Apply at least one per question):
- River origin/tributary mapping
- Pass-state-connection accuracy
- Soil type-region associations
- Monsoon mechanism details
- Mineral-state production mapping
- Climate zone classifications
- Agricultural patterns by region
- Industrial location factors
- Port-coast-state mapping
- Boundary-sharing countries`,

  art: `
ART & CULTURE TRAP PATTERNS (Apply at least one per question):
- Classical dance forms: Confusing similar mudras, origins, or patrons
- Folk dance ↔ State mapping: Wrong state associations (Bihu vs Bhangra states)
- Temple architecture: Nagara vs Dravida vs Vesara style features
- Painting schools: Mughal vs Rajput vs Pahari miniature confusion
- UNESCO sites: Wrong state/category (Cultural vs Natural vs Mixed)
- GI Tags: Product ↔ State/Region mapping
- Musical instruments: Classification (string/wind/percussion) and region
- Cave art: Ajanta vs Ellora vs Elephanta ↔ Religion/Dynasty associations
- Sangeet Natak Akademi: 8 classical dances recognition details
- Folk paintings: Madhubani vs Warli vs Pattachitra vs Gond regional origins
- Intangible Cultural Heritage: UNESCO-listed Indian traditions
- Ancient literature: Vedic vs Classical Sanskrit vs Prakrit texts
- Bhakti/Sufi saints: Region and philosophy confusion`,
};

// ============================================================================
// FEW-SHOT PYQ EXAMPLES BY STYLE
// ============================================================================
const PYQ_EXAMPLES = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REAL UPSC PYQ EXAMPLES (USE AS STYLE REFERENCE ONLY - DO NOT COPY):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXAMPLE 1 - "HOW MANY" STATEMENT PATTERN (2024 Polity):
"Consider the following pairs:
Party - Its Leader
1. Bhartiya Jana Sangh - Dr. Shyama Prasad Mukherjee
2. Socialist Party - C. Rajagopalachari
3. Congress for Democracy - Jagjivan Ram
4. Swatantra Party - Acharya Narendra Dev

How many of the above are correctly matched?
(a) Only one  (b) Only two  (c) Only three  (d) All four"
Answer: (b) Only two [Pairs 1 and 3 correct; 2 and 4 have swapped associations]

EXAMPLE 2 - STATEMENT-I/STATEMENT-II PATTERN (2024 Economy):
"Consider the following statements:
Statement-I: Syndicated lending spreads the risk of borrower default across multiple lenders.
Statement-II: The syndicated loan can be a fixed amount/lump sum of funds, but cannot be a credit line.

Which one of the following is correct in respect of the above statements?
(a) Both Statement-I and Statement-II are correct and Statement-II explains Statement-I.
(b) Both Statement-I and Statement-II are correct, but Statement-II does not explain Statement-I.
(c) Statement-I is correct, but Statement-II is incorrect.
(d) Statement-I is incorrect, but Statement-II is correct."
Answer: (c) [Statement-I is true about risk spreading; Statement-II is false - syndicated loans CAN be credit lines]

EXAMPLE 3 - THREE-STATEMENT "HOW MANY" PATTERN (2024 Science):
"With reference to radioisotope thermoelectric generators (RTGs), consider the following statements:
1. RTGs are miniature fission reactors.
2. RTGs are used for powering the onboard systems of spacecrafts.
3. RTGs can use Plutonium-238, which is a by-product of weapons developments.

Which of the statements given above are correct?
(a) 1 and 2 only  (b) 2 and 3 only  (c) 1 and 3 only  (d) 1, 2 and 3"
Answer: (b) [Statement 1 is false - RTGs use decay not fission; 2 and 3 are correct]

EXAMPLE 4 - CLASSIFICATION FACTUAL PATTERN (2024 Environment):
"The organisms 'Cicada, Froghopper, and Pond skater' are:
(a) Birds  (b) Fish  (c) Insects  (d) Reptiles"
Answer: (c) [All three are insects - tests taxonomy knowledge]

EXAMPLE 5 - MATCH WITH "HOW MANY CORRECT" PATTERN (2024 Environment):
"Consider the following pairs:
Country - Animal found in its natural habitat
1. Brazil - Indri
2. Indonesia - Elk
3. Madagascar - Bonobo

How many of the pairs given above are correctly matched?
(a) Only one  (b) Only two  (c) All three  (d) None"
Answer: (d) [All wrong - Indri is Madagascar, Elk is N.America/Europe, Bonobo is Congo]

CRITICAL INSTRUCTION: Generate NEW questions inspired by these patterns. 
- Do NOT copy these questions
- Do NOT reuse the same entities/numbers/combinations
- Change at least 2 dimensions (entity + mechanism + option set)
`;

// ============================================================================
// YEAR-WEIGHTED STYLE TENDENCIES (Based on scraped PYQs in this repo)
// ============================================================================
const YEAR_TRENDS = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPSC YEAR-WISE PATTERN EVOLUTION (based on this repo's scraped PYQs):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

═══════════════════════════════════════════════════════════════════════════════
2011-2013 ERA (FOUNDATION PERIOD):
═══════════════════════════════════════════════════════════════════════════════
- Direct factual questions dominated (~60%)
- Statement questions with 2-3 statements, "1 and 2 only" style options
- Simple "Which of the following is correct?" format
- Match-the-following with classic A-1, B-2, C-3, D-4 format
- Few application-based questions
- Questions directly from NCERT textbooks

Example patterns from 2011:
- "Under the constitution of India, which one of the following is not a fundamental duty?"
- "The authorization for withdrawal of funds from Consolidated Fund must come from:"
- "What is the difference between 'vote-on-account' and 'interim budget'?"

═══════════════════════════════════════════════════════════════════════════════
2014-2017 ERA (TRANSITION PERIOD):
═══════════════════════════════════════════════════════════════════════════════
- Increase in statement-based questions (~40-45%)
- Introduction of 4-5 statement questions
- "Select the correct answer using the code given below" became standard
- More conceptual questions testing understanding, not just facts
- Environment & Ecology questions increased significantly
- Current affairs integration began (schemes, policies, organizations)
- Extreme words used as traps: "only", "all", "always" in wrong statements

Example patterns from 2015-2017:
- "Consider the following statements... Which is/are correct?"
- "In the context of... which of the following is/are true?"
- Questions testing "NOT" - "Which is NOT a feature of..."
- Comparing two similar concepts (difference between X and Y)

═══════════════════════════════════════════════════════════════════════════════
2018-2020 ERA (SOPHISTICATION PERIOD):
═══════════════════════════════════════════════════════════════════════════════
- Statement questions dominated (~50-55%)
- Rise of application and conceptual questions
- More tricky distractors using scope/exception traps
- Science & Technology questions increased (space missions, biotech)
- Contemporary issues as triggers for static concept questions
- Questions testing nuanced understanding of constitutional provisions
- In this repo's scraped PYQs, the dominant templates are still classic code-based statement/pair questions
  ("Select the correct answer using the code given below" / "Which of the statements given above is/are correct")
  with little/no classic "Assertion (A)/Reason (R)" wording.

Example patterns from 2018-2020:
- "With reference to the Constitution of India, consider the following..."
- "If the President exercises power under Article 356, then..."
- Questions on committees, commissions with specific recommendations
- Testing exceptions to general rules

═══════════════════════════════════════════════════════════════════════════════
2021-2023 ERA (COMPLEXITY PEAK):
═══════════════════════════════════════════════════════════════════════════════
- In this repo's scraped PYQs: "How many" starts showing up clearly in 2022 (especially "How many pairs given above...")
  and spikes in 2023 ("How many of the above..." becomes very common).
- Statement-I/Statement-II questions appear prominently in 2023 onwards (modern Assertion-Reason logic with updated labels).
- Match/pairs with "How many pairs correctly matched?"
- Multiple dimensions tested in single question
- Distractors designed to defeat elimination strategies
- Focus on recent amendments, judgments, policies
- Questions linking static syllabus to current affairs context

Key shift: From "Which statements are correct?" to "How many are correct?"
- Forces knowledge of ALL statements, not just 2 to eliminate

Example patterns from 2021-2023:
- "How many of the above statements is/are correct? (a) Only one (b) Only two..."
- "How many of the above pairs are correctly matched?"
- Statement-I/Statement-II with causal relationship analysis
- 4-5 item classification questions ("How many are insects/birds/reptiles?")

═══════════════════════════════════════════════════════════════════════════════
2024-2025 ERA (CURRENT STANDARD):
═══════════════════════════════════════════════════════════════════════════════
- In this repo's scraped 2024 paper, templates are MIXED: classic statement-code questions still remain common alongside
  "How many" and Statement-I/Statement-II.
- Row-correctness tables ("In how many of the above rows..." and also "In which of the above rows...") appear in 2024.
- Specific emphasis on:
  * Constitutional amendments (recent: 101st-106th)
  * International organizations and India's role
  * Species habitat/country mapping (endemic species)
  * Party-leader/founder associations
  * Scheme-ministry-objective mapping
  * Scientific concepts with common misconceptions

2024 specific patterns observed:
- "How many Delimitation Commissions have been constituted?" (factual count)
- Party-Leader matching with "How many are correctly matched?"
- Country-Animal habitat pairs
- Statement-I/Statement-II on syndicated loans, CBDC, star lifecycle
- "The organisms Cicada, Froghopper, Pond skater are:" (classification)

2025 patterns (expected continuation):
- Maintain high "How many" density
- More interdisciplinary questions
- Avoid predictable answer distributions
- Test fine distinctions between related concepts

═══════════════════════════════════════════════════════════════════════════════
GENERATION STRATEGY BY QUESTION TYPE:
═══════════════════════════════════════════════════════════════════════════════

FOR STATEMENT QUESTIONS (60% of paper):
- Use "How many of the above is/are correct?" for 60% of statement questions
- Use classic "Which statements are correct?" for remaining 40%
- Mix 2-statement, 3-statement (most common), and 4-statement formats
- Ensure 1-2 statements are wrong with SUBTLE errors (not obvious)

FOR MATCH/PAIRS QUESTIONS:
- Prefer "How many pairs correctly matched?" over classic A-1, B-2 format
- Include at least one clearly wrong pair and one tricky pair
- Use confusable items (similar-sounding entities, related concepts)

FOR STATEMENT-I/STATEMENT-II:
- Use for analytical questions in Economy, Environment, Science
- Test causal relationships: "Does Statement-II explain Statement-I?"
- Avoid simple "both true/both false" - make relationship the challenge

FOR FACTUAL QUESTIONS:
- Use for testing specific counts, dates, names, classifications
- Frame as "Which of the following..." or "Which one of the following..."
- Include plausible but incorrect options based on common misconceptions
`;

// ============================================================================
// ERA-SPECIFIC GENERATION INSTRUCTIONS
// ============================================================================
const ERA_INSTRUCTIONS: Record<QuestionEra, string> = {
  "2011-2013": `
═══════════════════════════════════════════════════════════════════════════════
ERA: 2011-2013 (FOUNDATION STYLE)
═══════════════════════════════════════════════════════════════════════════════

Generate questions in the EARLY UPSC style (2011-2013 patterns):

QUESTION FORMATS TO USE:
1. DIRECT FACTUAL (60% of questions):
   - "Which of the following is correct?"
   - "Which one of the following is NOT a..."
   - "The [X] is responsible for..."
   - Simple single-answer questions

2. SIMPLE TWO-STATEMENT (30%):
   "Consider the following statements:
   1. [Statement 1]
   2. [Statement 2]
   Which of the statements given above is/are correct?"
   
   Options: (a) 1 only (b) 2 only (c) Both 1 and 2 (d) Neither 1 nor 2

3. COMPARISON QUESTIONS (10%):
   - "What is the difference between X and Y?"
   - Focus on distinguishing similar concepts

CHARACTERISTICS:
- Questions directly from NCERT textbooks
- Less tricky distractors
- Clear, unambiguous language
- Testing basic recall and understanding
- Minimal current affairs integration

AVOID:
- "How many of the above" format
- Statement-I/Statement-II format
- Complex 4-5 statement questions
- Match with "how many pairs" format
`,

  "2014-2017": `
═══════════════════════════════════════════════════════════════════════════════
ERA: 2014-2017 (TRANSITION STYLE)
═══════════════════════════════════════════════════════════════════════════════

Generate questions in the TRANSITION UPSC style (2014-2017 patterns):

QUESTION FORMATS TO USE:
1. THREE-STATEMENT QUESTIONS (40%):
   "Consider the following statements:
   1. [Statement 1]
   2. [Statement 2]
   3. [Statement 3]
   Which of the statements given above is/are correct?"
   
   Options: (a) 1 only (b) 1 and 2 only (c) 2 and 3 only (d) 1, 2 and 3

2. FOUR-ITEM CLASSIFICATION (20%):
   "Consider the following:
   1. [Item 1]
   2. [Item 2]
   3. [Item 3]
   4. [Item 4]
   Which of the above are [category]?"
   Options: (a) 1, 2 and 3 only (b) 2 and 4 only (c) 1, 3 and 4 only (d) 1, 2, 3 and 4

3. CLASSIC MATCH FORMAT (15%):
   "Match List-I with List-II"
   With A-1, B-2, C-3, D-4 style options

4. CONTEXT-BASED FACTUAL (25%):
   "In the context of [X], which of the following is correct?"
   "With reference to [X], consider the following..."

CHARACTERISTICS:
- "Select the correct answer using the code given below" standard
- Environment/Ecology questions increased
- Current affairs integration (schemes, organizations)
- Extreme words ("only", "all") used as traps in wrong options
- More conceptual understanding required

AVOID:
- "How many of the above is/are correct" format
- Statement-I/Statement-II format
`,

  "2018-2020": `
═══════════════════════════════════════════════════════════════════════════════
ERA: 2018-2020 (SOPHISTICATION STYLE)
═══════════════════════════════════════════════════════════════════════════════

Generate questions in the SOPHISTICATED UPSC style (2018-2020 patterns):

QUESTION FORMATS TO USE:
1. STATEMENT QUESTIONS WITH CODES (55%):
   - Mix of 2, 3, and 4 statement questions
   - "Which of the statements given above is/are correct?"

2. APPLICATION-BASED (20%):
   "If [condition/scenario], then..."
   "What would happen if..."
   Testing application of constitutional/legal provisions

3. PAIR/MATCH VIA CODES (10%):
   - "Consider the following pairs:"
   - Prefer "Which of the pairs given above is/are correctly matched?" with code-style options

4. NUANCED FACTUAL (15%):
   Testing exceptions, special cases, recent amendments
   Questions on committee recommendations

CHARACTERISTICS:
- Tricky distractors using scope/exception traps
- Science & Technology questions increased
- Questions on constitutional nuances
- Contemporary issues as triggers for static concepts
- Testing fine distinctions between related provisions

AVOID (for this era, in this repo's scraped PYQs):
- Statement-I/Statement-II format
- "How many of the above..." as the primary evaluation template
`,

  "2021-2023": `
═══════════════════════════════════════════════════════════════════════════════
ERA: 2021-2023 (COMPLEXITY RISE)
═══════════════════════════════════════════════════════════════════════════════

Generate questions in the COMPLEX UPSC style (2021-2023 patterns):

KEY INSIGHT: Multi-statement questions dominate (~70% by 2022). "How many correct?"
format becomes common especially from 2022 onward, but classic "Which statements 
is/are correct?" with code options still appears frequently in 2021.

QUESTION FORMATS TO USE:
1. MULTI-STATEMENT WITH CODES (35%):
   "Consider the following statements:
   1. [Statement]
   2. [Statement]
   3. [Statement]
   Which of the statements given above is/are correct?"
   Options: (a) 1 only (b) 1 and 2 only (c) 2 and 3 only (d) 1, 2 and 3

2. "HOW MANY" STATEMENTS (25% - rising trend):
   "Consider the following statements:
   1. [Statement]
   2. [Statement]
   3. [Statement]
   How many of the above statements are correct?"
   Options: (a) Only one (b) Only two (c) All three (d) None

3. STATEMENT-I/STATEMENT-II (15%):
   This is essentially a re-skinned Assertion-Reason format.
   In this repo's scraped PYQs, this shows up prominently in 2023.
   "Statement-I: [Claim]
   Statement-II: [Related statement]
   Which one of the following is correct in respect of the above statements?"
   Uses same 4 options as classic A-R (both correct & explains / both correct no explain / etc.)

4. MATCH THE FOLLOWING (15%):
   Prefer the repo-PYQ phrasing variants:
   - "How many pairs given above are correctly matched?"
   - "How many of the pairs given above are correctly matched?"
   - Occasionally: "How many pairs given above are not correctly matched?"

5. DIRECT/STANDALONE (10%):
   Single-answer factual questions

CHARACTERISTICS:
- Distractors designed to defeat elimination strategies
- Focus on recent amendments, judgments, committees
- Questions increasingly require knowledge of ALL statements (no safe elimination)
- Current affairs as trigger, static syllabus as solution

KEY SHIFT: Strong rise in multi-statement dominance; "How many correct?" emerges prominently from 2022.
`,

  "2024-2025": `
═══════════════════════════════════════════════════════════════════════════════
ERA: 2024-2025 (CURRENT STANDARD)
═══════════════════════════════════════════════════════════════════════════════

Generate questions in the CURRENT UPSC style (2024-2025 patterns):

KEY INSIGHT: Statement-based MCQs dominate (~60%). While "How many correct?" format
is common, actual 2024 PYQs show significant VARIETY in formats. Do NOT over-rely
on "How many" - mix formats for authentic practice.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY FORMAT DISTRIBUTION (for balanced, authentic practice):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- "How many of the above" format: ~30-35% (NOT more than 40%!)
- Classic "Which is/are correct" with codes: ~25-30%
- Statement-I/Statement-II (Assertion-Reason logic): ~12-15%
- Match the following (classic or "how many pairs"): ~10-12%
- Direct factual/Classification: ~15-20%

IMPORTANT: Do NOT make more than 40% of questions use "How many" format!
Mix formats to test different analytical skills.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

QUESTION FORMATS TO USE:
1. "HOW MANY" / COUNTING FORMAT (~30-35% max):
   - "How many of the above statements are correct?"
   - "How many of the pairs given above are correctly matched?"
   - "In how many of the above rows is the given information correctly matched?"
   - Also seen: "In which of the above rows is the given information correctly matched?"
   Options: Only one / Only two / All three (or four) / None

2. CLASSIC STATEMENT-CODE FORMAT (~25-30%):
   "Consider the following statements:
   1. [Statement]
   2. [Statement]
   3. [Statement]
   Which of the statements given above is/are correct?"
   Options: (a) 1 only (b) 1 and 2 only (c) 2 and 3 only (d) 1, 2 and 3

3. STATEMENT-I/STATEMENT-II (~12-15%):
   This is the modern label for Assertion-Reason logic.
   Also possible (recently): Statement-I with Statement-II and Statement-III as alternative explanations.
   "Statement-I: [Factual claim or observation]
   Statement-II: [Related statement - could be cause, explanation, or independent fact]
   Which one of the following is correct in respect of the above statements?"
   Options: Both correct & II explains I / Both correct but II doesn't explain / I correct II incorrect / I incorrect II correct

4. THREE-COLUMN MATCH / ROW-CORRECTNESS (~5%):
   Tables with 3+ columns where you evaluate row-by-row correctness
   "In how many of the above rows is the given information correctly matched?"
   This is a significant 2024 innovation.

5. CLASSIC MATCH THE FOLLOWING (~8-10%):
   "Match List-I with List-II" with A-1, B-2, C-3, D-4 style options
   Also appears in "How many pairs correctly matched?" format

6. STANDALONE/DIRECT (~15-20%):
   Direct factual questions testing precise knowledge
   - Party-Leader/Founder associations
   - Country-Species habitat mapping
   - Organisms classification (taxonomy traps)
   - Amendment-Provision mapping

2024 SPECIFIC EXAMPLES FROM ACTUAL PAPER:
- Party-Leader matching (Bhartiya Jana Sangh-Mukherjee, Swatantra Party)
- Country-Animal habitat traps (Brazil-Indri, Indonesia-Elk, Madagascar-Bonobo - all wrong!)
- Organisms classification (Cicada, Froghopper, Pond skater = all insects)
- Statement-I/II on syndicated loans, CBDC, star lifecycle, atmospheric heating

EMPHASIS:
- Mix formats for comprehensive practice - NOT dominated by "How many"
- Statement-I/II (evolved Assertion-Reason) appears across all subjects
- 3-column row-correctness tables are new and tricky
- Association questions (species-habitat, party-leader) are high frequency
- Include variety: 2-statement, 3-statement (most common), 4-statement mixes
`,

  "current": `
═══════════════════════════════════════════════════════════════════════════════
ERA: CURRENT (2024-2025 STANDARD) - DEFAULT
═══════════════════════════════════════════════════════════════════════════════

Generate questions matching the LATEST UPSC patterns (2024-2025):

KEY INSIGHT: Statement-based MCQs dominate (~60%). While "How many correct?" format
is common, actual 2024 PYQs show significant VARIETY in formats. Do NOT over-rely
on "How many" - mix formats for authentic practice.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY FORMAT DISTRIBUTION (for balanced, authentic practice):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- "How many of the above" format: ~30-35% (NOT more than 40%!)
- Classic "Which is/are correct" with codes: ~25-30%
- Statement-I/Statement-II (Assertion-Reason logic): ~12-15%
- Match the following (classic or "how many pairs"): ~10-12%
- Direct factual/Classification: ~15-20%

IMPORTANT: Do NOT make more than 40% of questions use "How many" format!
Mix formats to test different analytical skills.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRIMARY FORMATS:
1. "HOW MANY" / COUNTING (~30-35% max):
   - Statements: "How many of the above statements are correct?"
   - Pairs: "How many of the pairs given above are correctly matched?"
   - Rows: "In how many of the above rows is the given information correctly matched?"
   - Also seen: "In which of the above rows is the given information correctly matched?"

2. CLASSIC STATEMENT-CODE FORMAT (~25-30%):
   "Consider the following statements:
   1. [Statement]
   2. [Statement]
   3. [Statement]
   Which of the statements given above is/are correct?"
   Options: (a) 1 only (b) 1 and 2 only (c) 2 and 3 only (d) 1, 2 and 3

3. STATEMENT-I/STATEMENT-II (~12-15%):
   Modern label for Assertion-Reason logic - tests causal/explanatory relationships
   Also possible: Statement-I + Statement-II + Statement-III explanation template

4. THREE-COLUMN MATCH / ROW-CORRECTNESS (~5%):
   Tables with 3+ columns, evaluate row-by-row correctness (new 2024 pattern)

5. CLASSIC MATCH THE FOLLOWING (~8-10%):
   "Match List-I with List-II" - also in "How many pairs" format

6. STANDALONE/DIRECT (~15-20%):
   Testing precise knowledge with sophisticated distractors
   - Party-Leader/Founder associations
   - Country-Species habitat mapping
   - Organisms classification (taxonomy traps)

Follow 2024-2025 patterns as the PRIMARY reference. Ensure format VARIETY.
`,

  "all": `
═══════════════════════════════════════════════════════════════════════════════
ERA: ALL ERAS (MIXED DISTRIBUTION)
═══════════════════════════════════════════════════════════════════════════════

Generate questions spanning ALL UPSC eras to provide comprehensive practice:

DISTRIBUTION (approximate for mixed practice):
- ~10% in 2011-2013 style: Direct factual, simple 2-statement "1 only / 2 only / Both / Neither"
- ~15% in 2014-2017 style: Three-statement with combination codes, classic Match List-I/II
- ~20% in 2018-2020 style: Conceptual + code-based statement/pair questions
- ~25% in 2021-2023 style: "How many correct?" emerging (esp. 2022+), multi-statement dominant
- ~30% in 2024-2025 style: "How many" very frequent, Statement-I/II, 3-column row-correctness

KEY EVOLUTION TO REFLECT:
1. Multi-statement questions rose from ~40% (2011) to ~70% (2022+)
2. In this repo's scraped PYQs, "How many correct?" becomes common from 2022 and spikes in 2023
3. Assertion-Reason logic is often labeled Statement-I/II (same logic, different name)
4. 3-column row-correctness tables are a 2024 innovation
5. "Which statements is/are correct?" with codes still appears across all eras

This mixed approach helps aspirants:
- Build foundation with simpler patterns
- Understand evolution of UPSC questioning style
- Practice older patterns that occasionally still appear
- Master current dominant patterns

For EACH question, use the appropriate era's format naturally based on the distribution.
`,
};

const DIFFICULTY_INSTRUCTIONS: Record<Difficulty, string> = {
  easy: `
DIFFICULTY: EASY (NCERT Level - ~33% of actual UPSC paper)
Target: Foundation-level questions that test basic recall and fundamental understanding.

Characteristics:
- Questions answerable directly from NCERT textbooks (Class 6-12)
- Tests basic facts, definitions, and fundamental concepts
- Clear, unambiguous language without tricky phrasing
- One option should be obviously correct to a prepared candidate
- Distractors should be clearly wrong but not absurd

Example difficulty benchmark:
- "Which Article of the Constitution deals with Right to Education?" (Factual recall)
- "The Indus Valley Civilization was primarily known for:" (Basic NCERT fact)
- Simple cause-effect relationships from textbooks`,

  medium: `
DIFFICULTY: MEDIUM (Application Level - ~35% of actual UPSC paper)
Target: Questions requiring conceptual understanding and application of knowledge.

Characteristics:
- Requires connecting multiple concepts or applying knowledge to scenarios
- Tests understanding beyond mere memorization
- May require elimination strategy to arrive at correct answer
- Distractors are plausible and test fine distinctions
- Questions from standard reference books (Laxmikanth, Spectrum, Ramesh Singh)

Example difficulty benchmark:
- Comparing two constitutional provisions and their implications
- Understanding why a particular policy was implemented (not just what)
- Questions linking current affairs to static syllabus concepts
- Questions requiring understanding of exceptions and special cases`,

  hard: `
DIFFICULTY: HARD (Analytical Level - ~32% of actual UPSC paper)
Target: Questions requiring deep analysis, multi-concept integration, and nuanced understanding.

Characteristics:
- Multi-layered reasoning required
- Tests obscure facts or fine distinctions between similar concepts
- Elimination techniques alone won't work - needs solid knowledge
- Sophisticated distractors that appear correct on surface reading
- Questions that integrate current affairs with deep static knowledge
- May test exceptions, recent amendments, or lesser-known provisions

Example difficulty benchmark:
- Statement questions where 2-3 statements appear correct but have subtle errors
- Questions on recent constitutional amendments and their implications
- Match-the-following with similar-sounding options
- Assertion-Reason where both seem independently true but relationship is tricky
- Questions on international conventions/treaties with specific provisions`,
};

const STYLE_INSTRUCTIONS: Record<QuestionStyle, string> = {
  factual: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUESTION STYLE: STANDARD/FACTUAL MCQ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Format: Direct question with 4 options (A, B, C, D)
questionType: "standard"

UPSC Pattern Guidelines:
- Question should test specific knowledge or understanding
- Frame questions as "Which of the following...", "Consider the following...", or direct questions
- All four options must be grammatically consistent with the question stem
- Correct answer must be definitively correct, not "most correct"

Distractor Design (CRITICAL):
- DO NOT use absolute words like "only", "always", "never", "all", "none" in wrong options
  (UPSC aspirants know these are usually wrong - your distractors must be smarter)
- Each distractor should be a plausible misconception or commonly confused fact
- Distractors should test genuine knowledge gaps, not trick through wordplay
- Include distractors that would trap someone who studied superficially

Example Structure:
Q: Which of the following is NOT a feature of the Indian Constitution borrowed from the British Constitution?
A) Parliamentary system of government
B) Rule of law
C) Single citizenship
D) Bicameral legislature

(Here C is correct - Single citizenship is from British; others are also from British but the "NOT" makes it tricky)`,

  conceptual: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUESTION STYLE: CONCEPTUAL/APPLICATION MCQ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Format: Scenario-based or concept-testing question with 4 options
questionType: "standard"

UPSC Pattern Guidelines:
- Tests understanding of WHY, not just WHAT
- May present a scenario and ask for correct interpretation
- Tests ability to apply constitutional/legal/economic principles
- Often connects theoretical knowledge to real-world application

Question Framing:
- "In the context of..., which statement is correct?"
- "Which of the following best explains...?"
- "The primary objective of [policy/provision] is:"
- Present a situation and ask what provision/article applies

Distractor Design:
- Include options that would be correct in a different context
- Use commonly held misconceptions as distractors
- Test understanding of scope and limitations of concepts
- Include options that mix up similar-sounding provisions`,

  statement: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUESTION STYLE: STATEMENT-BASED (56% OF UPSC PAPER - MOST IMPORTANT!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Format: Multiple statements to evaluate for correctness
questionType: "statement"

UPSC 2024-2025 Distribution (follow this):
- Two-statement questions: ~15 per paper
- Three-statement questions: ~39 per paper (MOST COMMON)
- Four-statement questions: ~9 per paper
- Five+ statement questions: ~4 per paper

═══════════════════════════════════════════════════════════════════════════════
"HOW MANY" FORMAT (~30-35% of statement questions - NOT dominant):
═══════════════════════════════════════════════════════════════════════════════

THREE-STATEMENT "HOW MANY" FORMAT (PREFERRED):
"Consider the following statements regarding [topic]:
1. [Statement 1]
2. [Statement 2]
3. [Statement 3]

How many of the above statements is/are correct?"

Options MUST be EXACTLY:
A) Only one
B) Only two
C) All three
D) None

FOUR-STATEMENT "HOW MANY" FORMAT:
"Consider the following statements:
1. [Statement 1]
2. [Statement 2]
3. [Statement 3]
4. [Statement 4]

How many of the above statements is/are correct?"

Options MUST be EXACTLY:
A) Only one
B) Only two
C) Only three
D) All four

═══════════════════════════════════════════════════════════════════════════════
CLASSIC "WHICH STATEMENTS" FORMAT (~50-60% of statement questions - PRIMARY):
═══════════════════════════════════════════════════════════════════════════════

"Consider the following statements regarding [topic]:
1. [Statement 1]
2. [Statement 2]
3. [Statement 3]

Which of the statements given above is/are correct?"

Options format:
A) 1 only
B) 1 and 2 only
C) 2 and 3 only
D) 1, 2 and 3

TWO-STATEMENT SIMPLE FORMAT:
"Consider the following statements:
1. [Statement 1]
2. [Statement 2]

Which of the statements given above is/are correct?"

Options MUST be:
A) 1 only
B) 2 only
C) Both 1 and 2
D) Neither 1 nor 2

CRITICAL RULES FOR STATEMENT QUESTIONS:
1. Each statement must be independently verifiable as true or false
2. Statements should be related to the same topic but test different aspects
3. AVOID making all statements true or all false (makes question too easy)
4. Ideal distribution: 1-2 statements correct, 1-2 incorrect (requires careful analysis)
5. Wrong statements should contain SUBTLE errors using trap patterns:
   - Scope trap: Correct concept, wrong jurisdiction/scope
   - Exception trap: Generally true but fails due to known exception
   - Terminology trap: Confuses similar-sounding terms/provisions
   - Time trap: Outdated information presented as current
6. Use specific facts (years, numbers, names) in some statements to test precision
7. Test common misconceptions from the Subject Trap Library in incorrect statements
8. Ensure answer distribution is varied across a batch (not all "Only two")`,

  match: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUESTION STYLE: MATCH THE FOLLOWING / PAIRS (~8-12 questions per UPSC paper)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

questionType: "match"

═══════════════════════════════════════════════════════════════════════════════
FORMAT 1: "HOW MANY PAIRS CORRECTLY MATCHED" (DOMINANT IN 2021-2024):
═══════════════════════════════════════════════════════════════════════════════

"Consider the following pairs:

[Category A]          [Category B]
1. [Item 1]     -     [Description 1]
2. [Item 2]     -     [Description 2]
3. [Item 3]     -     [Description 3]
4. [Item 4]     -     [Description 4]

How many of the above pairs are correctly matched?"

Options MUST be EXACTLY:
A) Only one pair
B) Only two pairs
C) Only three pairs
D) All four pairs

(Can also be 3 pairs with options: Only one / Only two / All three / None)

REAL PYQ EXAMPLE (2024 Polity - Party/Leader):
"Consider the following pairs:
Party - Its Leader
1. Bhartiya Jana Sangh - Dr. Shyama Prasad Mukherjee
2. Socialist Party - C. Rajagopalachari
3. Congress for Democracy - Jagjivan Ram
4. Swatantra Party - Acharya Narendra Dev

How many of the above are correctly matched?"
Answer: Only two (Pairs 1 and 3 correct)

REAL PYQ EXAMPLE (2024 Environment - Country/Animal):
"Consider the following pairs:
Country - Animal found in its natural habitat
1. Brazil - Indri
2. Indonesia - Elk
3. Madagascar - Bonobo

How many of the pairs given above are correctly matched?"
Answer: None (All wrong - tests precise habitat knowledge)

═══════════════════════════════════════════════════════════════════════════════
FORMAT 2: CLASSIC MATCH LIST-I WITH LIST-II:
═══════════════════════════════════════════════════════════════════════════════

"Match List-I with List-II and select the correct answer using the code given below:

List-I (Item)          List-II (Description)
A. [Item 1]            1. [Description 1]
B. [Item 2]            2. [Description 2]
C. [Item 3]            3. [Description 3]
D. [Item 4]            4. [Description 4]

Select the correct answer using the code given below:"

Options format:
     A   B   C   D
(a)  1   2   3   4
(b)  2   1   4   3
(c)  3   4   1   2
(d)  4   3   2   1

DESIGN RULES (CRITICAL FOR UPSC-QUALITY):
1. Items in List-I MUST be same category (all rivers, all acts, all treaties, etc.)
2. Descriptions in List-II MUST be parallel (all states, all years, all features, etc.)
3. Include at least 2 items that could PLAUSIBLY match with same description (creates difficulty)
4. Commonly confused pairs should be included to test precise knowledge
5. Ensure ONLY ONE correct matching combination exists
6. For "How many pairs" format: Mix correct and incorrect pairs (ideal: 1-2 correct, 2-3 wrong)

COMMON UPSC MATCH THEMES:
- Parties ↔ Founders/Leaders (very common in 2024)
- Country ↔ Endemic/Native species (very common in Environment)
- Treaties/Agreements ↔ Years/Countries
- Constitutional Articles ↔ Provisions/Subjects
- Rivers ↔ Origins/Tributaries/States
- National Parks/Reserves ↔ States/Flagship Species
- Government Schemes ↔ Objectives/Ministries
- International Organizations ↔ Headquarters/Functions
- Historical Events ↔ Years/Leaders
- Folk Arts/Dances ↔ States/Regions
- Minerals ↔ States (leading producers)`,

  assertion: `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUESTION STYLE: STATEMENT-I/STATEMENT-II (and STATEMENT-I/II/III) - UPSC CURRENT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Format: 2 or 3 statements with logical relationship analysis
questionType: "assertion"

NOTE: UPSC 2024 predominantly uses "Statement-I/Statement-II" format instead of 
traditional "Assertion (A)/Reason (R)" format. USE THIS FORMAT:

EXACT FORMAT A (2-STATEMENT) (MUST USE WORDING):
"Consider the following statements:

Statement-I: [Statement of fact, claim, or observation]

Statement-II: [Related statement - could be explanation, cause, or independent fact]

Which one of the following is correct in respect of the above statements?"

OPTIONS MUST BE EXACTLY (USE THIS EXACT WORDING):
A) Both Statement-I and Statement-II are correct and Statement-II is the correct explanation for Statement-I
B) Both Statement-I and Statement-II are correct and Statement-II is not the correct explanation for Statement-I
C) Statement-I is correct but Statement-II is incorrect
D) Statement-I is incorrect but Statement-II is correct

EXACT FORMAT B (3-STATEMENT EXPLANATION) (MUST USE WORDING):
"Consider the following statements:

Statement-I: [Claim/observation]

Statement-II: [Potential explanation 1]

Statement-III: [Potential explanation 2]

Which one of the following is correct in respect of the above statements?"

OPTIONS MUST BE EXACTLY (USE THIS EXACT WORDING):
A) Both Statement-II and Statement-III are correct and both of them explain Statement-I
B) Both Statement-II and Statement-III are correct but only one of them explains Statement-I
C) Only one of the Statements II and III is correct and that explains Statement-I
D) Neither Statement-II nor Statement-III is correct

CRITICAL DESIGN RULES:
1. Statement-I must be a clear, verifiable statement of fact or claim
2. Statement-II (and Statement-III, if used) must be independently verifiable as true or false
3. The relationship between Statement-I and the explanation statement(s) is what makes this question hard
4. Most challenging: explanation statement(s) are true but NOT the correct explanation (tests reasoning)
5. If an option says "explains Statement-I", the explanation statement(s) MUST be independently true
6. If an option says "explains Statement-I", it MUST be a DIRECT causal/explanatory bridge, not merely correlated

DIFFICULTY CALIBRATION:
- Easy: Statement-I is false, Statement-II is true (or vice versa) - straightforward
- Medium: Both true, Statement-II clearly explains Statement-I - tests knowledge
- Hard: Both true, but Statement-II is NOT the correct explanation - tests reasoning

AVOID "DEFINITION EXPLAINS DEFINITION" (TOO EASY)
PREFER: "principle → implication" (Economy) or "mechanism → outcome" (Environment/Science)

COMMON TRAPS TO CREATE:
- Statement-II is a true statement but explains something else, not Statement-I
- Statement-II partially explains Statement-I but misses the main reason
- Statement-I and Statement-II are both true and seem related but causation is reversed
- Statement-II is the effect, not the cause of Statement-I

REAL PYQ EXAMPLE (2024 Economy):
"Consider the following statements:
Statement-I: Syndicated lending spreads the risk of borrower default across multiple lenders.
Statement-II: The syndicated loan can be a fixed amount/lump sum of funds, but cannot be a credit line.

Which one of the following is correct in respect of the above statements?"

Answer: (c) Statement-I is correct but Statement-II is incorrect
[Statement-I is true; Statement-II is false because syndicated loans CAN be credit lines]`,
};

// ============================================================================
// SUBJECT-SPECIFIC KNOWLEDGE BASES
// ============================================================================

const SUBJECT_CONTEXTS: Record<string, string> = {
  polity: `
INDIAN POLITY & GOVERNANCE (15-20% of UPSC Prelims, ~15-20 questions)

PRIMARY SOURCES (align questions with these):
- M. Laxmikanth's "Indian Polity" - THE standard reference
- NCERT Political Science (Class 11-12)
- Constitution of India (original text)
- Recent Supreme Court judgments

HIGH-WEIGHTAGE TOPICS:
1. Constitutional Framework: Preamble, Fundamental Rights (Art 12-35), DPSPs (Art 36-51), Fundamental Duties (Art 51A)
2. Union Executive: President (Art 52-62), Vice President, PM & Council of Ministers, Attorney General
3. Parliament: Lok Sabha, Rajya Sabha, Legislative procedures, Money Bill vs Finance Bill, Parliamentary privileges
4. Judiciary: Supreme Court (Art 124-147), High Courts, Judicial Review, PIL, Basic Structure Doctrine
5. State Government: Governor (Art 153-167), CM & State Council, State Legislature
6. Local Government: 73rd Amendment (Panchayats), 74th Amendment (Municipalities), PESA Act
7. Constitutional Bodies: Election Commission, CAG, UPSC, Finance Commission, NCSC/NCST
8. Emergency Provisions: National (Art 352), State (Art 356), Financial (Art 360)
9. Amendment Procedure: Art 368, types of amendments, ratification requirements
10. Recent Amendments: 101st (GST), 102nd (NCBC), 103rd (EWS quota), 104th (SC/ST reservation), 105th (OBC enumeration), 106th (Women's reservation)

COMMON UPSC TRAPS IN POLITY:
- Confusing similar articles (Art 14 vs 15 vs 16)
- President's discretionary vs constitutional powers
- Difference between Ordinance-making powers (Art 123 vs 213)
- Money Bill vs Financial Bill misconceptions
- Governor's discretionary powers misconceptions
- Difference between Constitutional and Statutory bodies`,

  history: `
INDIAN HISTORY (10-18% of UPSC Prelims, ~10-18 questions)

PRIMARY SOURCES:
- NCERT History books (Class 6-12) - FOUNDATION
- Spectrum's "A Brief History of Modern India" - Modern History
- RS Sharma - Ancient India
- Satish Chandra - Medieval India
- Bipin Chandra - India's Struggle for Independence

ANCIENT HISTORY FOCUS AREAS:
1. Indus Valley Civilization: Sites, features, decline theories, script
2. Vedic Period: Rig Vedic vs Later Vedic, society, economy
3. Buddhism & Jainism: Teachings, councils, spread, decline
4. Mauryan Empire: Chandragupta, Ashoka, administration, Dhamma
5. Post-Mauryan: Kushanas, Satavahanas, Sangam literature
6. Gupta Period: Golden age, art, science, administration
7. Regional Kingdoms: Cholas, Pallavas, Chalukyas, Rashtrakutas

MEDIEVAL HISTORY FOCUS AREAS:
1. Delhi Sultanate: Dynasties, administration, architecture
2. Vijayanagara & Bahmani kingdoms
3. Mughal Empire: Administration, Mansabdari, art, religious policies
4. Bhakti & Sufi movements
5. Regional powers: Marathas, Sikhs, Rajputs

MODERN HISTORY (HIGHEST WEIGHTAGE):
1. British Expansion: Battles, policies, economic drain
2. Socio-Religious Reforms: Brahmo Samaj, Arya Samaj, others
3. 1857 Revolt: Causes, events, aftermath
4. Indian National Movement phases
5. Gandhi Era: Movements, strategies, timeline
6. Revolutionary Movement: HSRA, Anushilan, Ghadar
7. Constitutional Development: Acts of 1909, 1919, 1935
8. Independence & Partition

COMMON TRAPS:
- Confusing years of events (very specific dates asked)
- Mixing up reform movements and their founders
- Timeline errors in freedom movement
- Confusing British Acts and their provisions`,

  geography: `
INDIAN & WORLD GEOGRAPHY (12-18% of UPSC Prelims, ~12-18 questions)

PRIMARY SOURCES:
- NCERT Geography (Class 6-12) - FOUNDATION
- G.C. Leong's "Certificate Physical and Human Geography"
- Oxford School Atlas
- Khullar's "India: A Comprehensive Geography"

PHYSICAL GEOGRAPHY:
1. Geomorphology: Landforms, plate tectonics, volcanism, earthquakes
2. Climatology: Atmospheric circulation, monsoons, climate types
3. Oceanography: Currents, tides, marine resources
4. Biogeography: Biomes, soils, vegetation types

INDIAN GEOGRAPHY (HIGH WEIGHTAGE):
1. Physical Features: Himalayas, Northern Plains, Peninsular Plateau, Coastal Plains, Islands
2. Drainage: River systems (Himalayan vs Peninsular), interlinking projects
3. Climate: Monsoon mechanism, seasons, rainfall distribution
4. Natural Vegetation: Forest types, biosphere reserves
5. Agriculture: Cropping patterns, irrigation, Green/White/Blue revolutions
6. Minerals & Energy: Distribution, reserves, policies
7. Industries: Location factors, industrial regions, policies
8. Transport: Roadways, railways, waterways, airways

WORLD GEOGRAPHY:
1. Continents and major features
2. Important straits, channels, passes
3. Climate regions and their characteristics
4. Major agricultural regions
5. Geopolitically significant locations

COMMON TRAPS:
- Confusing tributaries of rivers (left bank vs right bank)
- Mixing up national parks and their locations/species
- Wrong associations of crops with soil types
- Confusing similar-sounding geographical features`,

  economy: `
INDIAN ECONOMY (10-15% of UPSC Prelims, ~10-15 questions)

PRIMARY SOURCES:
- NCERT Economics (Class 11-12)
- Ramesh Singh's "Indian Economy"
- Economic Survey (latest)
- Union Budget documents

MACROECONOMICS:
1. National Income: GDP, GNP, NDP, NNP concepts and calculation
2. Inflation: Types, measurement (CPI, WPI), causes, control
3. Monetary Policy: RBI tools (Repo, Reverse Repo, CRR, SLR, OMO)
4. Fiscal Policy: Budget components, deficits, FRBM Act
5. Balance of Payments: Current account, Capital account, forex reserves

BANKING & FINANCE:
1. Banking Structure: RBI, Commercial Banks, Payment Banks, SFBs
2. Financial Markets: Money market, capital market instruments
3. Financial Inclusion: Jan Dhan, MUDRA, Stand-Up India
4. Insurance & Pension: IRDAI, PFRDA, schemes

SECTORS:
1. Agriculture: MSP, procurement, subsidies, reforms
2. Industry: Make in India, PLI schemes, Industrial policies
3. Services: IT, telecom, tourism contributions

GOVERNMENT INITIATIVES:
1. Taxation: GST structure, Direct Tax Code
2. Social Sector: MGNREGA, PDS, food security
3. Infrastructure: Gati Shakti, Sagarmala, Bharatmala
4. Digital: UPI, ONDC, Digital India

INTERNATIONAL:
1. Trade: WTO, FTAs, trade balance
2. International Organizations: IMF, World Bank, ADB, NDB, AIIB
3. Global indices: HDI, GHI, Ease of Doing Business

COMMON TRAPS:
- Confusing monetary policy tools and their effects
- Mixing up different types of deficits
- Wrong associations of schemes with ministries
- Confusing similar-sounding financial instruments`,

  environment: `
ENVIRONMENT & ECOLOGY (15-20% of UPSC Prelims, ~15-20 questions)

PRIMARY SOURCES:
- NCERT Biology (Ecology chapters)
- Shankar IAS Environment book
- ENVIS portals
- MoEFCC reports

ECOLOGY CONCEPTS:
1. Ecosystem: Structure, function, energy flow, nutrient cycling
2. Biodiversity: Levels, hotspots, threats, conservation
3. Ecological Succession: Primary, secondary, climax community
4. Biomes: Terrestrial and aquatic ecosystems
5. Food chains, food webs, ecological pyramids

BIODIVERSITY & CONSERVATION:
1. Protected Areas: Categories (National Parks, Sanctuaries, Biosphere Reserves, Tiger Reserves)
2. Conservation approaches: In-situ vs Ex-situ
3. IUCN Red List categories
4. Wildlife Protection Act 1972 (Schedules)
5. Biodiversity Act 2002
6. Important species: Endemic, endangered, flagship, keystone

ENVIRONMENTAL ISSUES:
1. Pollution: Air (sources, standards), Water, Soil, Noise
2. Climate Change: Greenhouse effect, global warming, impacts
3. Waste Management: Solid waste, e-waste, plastic waste rules
4. Desertification, land degradation

INTERNATIONAL CONVENTIONS:
1. UNFCCC: COPs, Paris Agreement, NDCs
2. CBD: Aichi targets, Kunming-Montreal framework
3. CITES: Appendices, wildlife trade
4. Ramsar: Wetlands, Indian sites
5. Montreal Protocol: Ozone, Kigali Amendment
6. Basel, Rotterdam, Stockholm: Hazardous substances

INDIAN INITIATIVES:
1. National Action Plan on Climate Change: 8 missions
2. CAMPA, Green India Mission
3. National Biodiversity Authority
4. Compensatory Afforestation

COMMON TRAPS:
- Confusing different protected area categories
- Mixing up international conventions and their focus
- Wrong locations of national parks/tiger reserves
- Confusing endemic species locations`,

  science: `
SCIENCE & TECHNOLOGY (5-15% of UPSC Prelims, ~5-15 questions)

PRIMARY SOURCES:
- NCERT Science books (Class 6-10)
- NCERT Physics, Chemistry, Biology (Class 11-12 basics)
- Science Reporter magazine
- PIB releases on S&T

PHYSICS & SPACE:
1. Basic concepts: Motion, energy, waves, optics
2. Nuclear science: Fission, fusion, reactors
3. Space technology: ISRO missions, satellites, launch vehicles
4. Defense technology: Missiles, radar, indigenous development

CHEMISTRY:
1. Basic concepts: Atoms, molecules, reactions
2. Materials: Polymers, alloys, nanomaterials
3. Chemical industries: Fertilizers, petrochemicals

BIOLOGY & HEALTH:
1. Cell biology basics
2. Genetics: DNA, genes, genetic engineering, GMOs
3. Diseases: Communicable, non-communicable, epidemics
4. Biotechnology: Applications, ethics, regulations
5. Human body systems basics

CURRENT S&T DEVELOPMENTS:
1. AI & Machine Learning
2. Quantum computing
3. 5G/6G technology
4. Blockchain
5. Renewable energy tech
6. Space missions (global)
7. Medical breakthroughs

GOVERNMENT INITIATIVES:
1. ISRO programs: Chandrayaan, Gaganyaan, etc.
2. DRDO projects
3. DAE: Nuclear power program
4. DST: Various schemes
5. Make in India in defense

COMMON TRAPS:
- Confusing similar-sounding technologies
- Wrong agency associations (ISRO vs DRDO vs DAE)
- Outdated information on recent missions
- Mixing up satellite types and purposes`,

  "current affairs": `
CURRENT AFFAIRS (30-40% of UPSC Prelims directly/indirectly)

INTEGRATION APPROACH:
- Current affairs are NOT a separate subject
- UPSC tests static concepts THROUGH current events
- ~70% of current affairs questions need static knowledge to answer

KEY DOMAINS:
1. Government Schemes & Policies (link to Polity/Economy)
2. International Relations & Summits
3. Awards & Recognition (link to relevant fields)
4. Environmental developments (link to Environment)
5. Science & Technology breakthroughs
6. Economic data & reports
7. Constitutional & Legal developments

TIME FRAME:
- Focus on 18-24 months before exam
- Some questions test events from 2+ years ago
- Anniversary years (25th, 50th, 75th, 100th) are important

SOURCES TO ALIGN WITH:
- The Hindu / Indian Express editorials
- PIB (Press Information Bureau)
- Yojana & Kurukshetra magazines
- Economic Survey
- India Year Book

INTEGRATION EXAMPLES:
- G20 Summit → Link to economic organizations, India's foreign policy
- New environmental policy → Link to international conventions, constitutional provisions
- Supreme Court judgment → Link to relevant constitutional articles
- New government scheme → Link to ministry, budget allocation, related acts`,

  "art and culture": `
ART & CULTURE (5-10% of UPSC Prelims, ~5-10 questions)

PRIMARY SOURCES:
- NCERT Fine Arts book
- CCRT (Centre for Cultural Resources and Training) material
- Nitin Singhania's "Indian Art and Culture"

ARCHITECTURE:
1. Temple Architecture: Nagara, Dravida, Vesara styles
2. Cave Architecture: Ajanta, Ellora, Elephanta
3. Indo-Islamic: Sultanate and Mughal architecture
4. Colonial and Modern architecture
5. Buddhist Architecture: Stupas, Chaityas, Viharas

SCULPTURE & PAINTING:
1. Mauryan, Gupta, Medieval sculptures
2. Miniature paintings: Mughal, Rajasthani, Pahari schools
3. Folk paintings: Madhubani, Warli, Pattachitra, Kalamkari
4. Modern Indian art

PERFORMING ARTS:
1. Classical Dance: 8 forms recognized by Sangeet Natak Akademi
2. Folk Dances: State-wise
3. Classical Music: Hindustani vs Carnatic
4. Theatre: Traditional forms (Yakshagana, Kathakali, etc.)

LITERATURE:
1. Ancient: Vedic, Sanskrit literature
2. Medieval: Regional literature, Bhakti & Sufi poetry
3. Modern: Indian writers, literary awards

HERITAGE:
1. UNESCO World Heritage Sites in India
2. GI Tags
3. Intangible Cultural Heritage
4. Important monuments and their significance

COMMON TRAPS:
- Confusing similar dance forms
- Wrong state associations for folk arts
- Mixing up architectural styles
- Incorrect UNESCO site information`,
};

// Get subject context if available
function getSubjectContext(subject: string): string {
  const lowerSubject = subject.toLowerCase();

  for (const [key, context] of Object.entries(SUBJECT_CONTEXTS)) {
    if (lowerSubject.includes(key) || key.includes(lowerSubject)) {
      return context;
    }
  }

  // Check for common variations
  if (lowerSubject.includes("polity") || lowerSubject.includes("constitution") || lowerSubject.includes("governance")) {
    return SUBJECT_CONTEXTS.polity;
  }
  if (lowerSubject.includes("history") || lowerSubject.includes("freedom") || lowerSubject.includes("independence")) {
    return SUBJECT_CONTEXTS.history;
  }
  if (lowerSubject.includes("geography") || lowerSubject.includes("geo")) {
    return SUBJECT_CONTEXTS.geography;
  }
  if (lowerSubject.includes("economy") || lowerSubject.includes("economic") || lowerSubject.includes("finance")) {
    return SUBJECT_CONTEXTS.economy;
  }
  if (lowerSubject.includes("environment") || lowerSubject.includes("ecology") || lowerSubject.includes("biodiversity")) {
    return SUBJECT_CONTEXTS.environment;
  }
  if (lowerSubject.includes("science") || lowerSubject.includes("technology") || lowerSubject.includes("space")) {
    return SUBJECT_CONTEXTS.science;
  }
  if (lowerSubject.includes("current") || lowerSubject.includes("affairs")) {
    return SUBJECT_CONTEXTS["current affairs"];
  }
  if (lowerSubject.includes("art") || lowerSubject.includes("culture") || lowerSubject.includes("heritage")) {
    return SUBJECT_CONTEXTS["art and culture"];
  }

  return "";
}

// Get subject-specific trap patterns
function getSubjectTraps(subject: string): string {
  const lowerSubject = subject.toLowerCase();

  if (lowerSubject.includes("polity") || lowerSubject.includes("constitution") || lowerSubject.includes("governance")) {
    return SUBJECT_TRAP_LIBRARY.polity;
  }
  if (lowerSubject.includes("history") || lowerSubject.includes("freedom") || lowerSubject.includes("independence") || lowerSubject.includes("ancient") || lowerSubject.includes("medieval") || lowerSubject.includes("modern")) {
    return SUBJECT_TRAP_LIBRARY.history;
  }
  if (lowerSubject.includes("geography") || lowerSubject.includes("geo")) {
    return SUBJECT_TRAP_LIBRARY.geography;
  }
  if (lowerSubject.includes("economy") || lowerSubject.includes("economic") || lowerSubject.includes("finance")) {
    return SUBJECT_TRAP_LIBRARY.economy;
  }
  if (lowerSubject.includes("environment") || lowerSubject.includes("ecology") || lowerSubject.includes("biodiversity")) {
    return SUBJECT_TRAP_LIBRARY.environment;
  }
  if (lowerSubject.includes("science") || lowerSubject.includes("technology") || lowerSubject.includes("space")) {
    return SUBJECT_TRAP_LIBRARY.science;
  }
  if (lowerSubject.includes("art") || lowerSubject.includes("culture") || lowerSubject.includes("heritage")) {
    return SUBJECT_TRAP_LIBRARY.art;
  }

  return "";
}

export function getPrompt(params: PromptParams): string {
  const {
    subject,
    theme,
    difficulty,
    styles,
    totalCount,
    era = "current",
    enableCurrentAffairs = false,
    currentAffairsTheme,
  } = params;

  const themeContext = theme
    ? `SPECIFIC FOCUS: "${theme}" - Prefer this theme but include ~25% adjacent subtopics for breadth within ${subject}.`
    : `COVERAGE: Generate questions covering diverse important topics within ${subject}.`;

  const subjectContext = getSubjectContext(subject);
  const subjectTraps = getSubjectTraps(subject);

  // Get era-specific instructions
  const eraInstruction = ERA_INSTRUCTIONS[era] || ERA_INSTRUCTIONS["current"];
  const eraLabel = era === "current" ? "2024-2025 (Current)" : era === "all" ? "All Eras (Mixed)" : era;

  // Build current affairs context if enabled
  const currentAffairsSection = enableCurrentAffairs
    ? `${CURRENT_AFFAIRS_CONTEXT}${currentAffairsTheme ? CURRENT_AFFAIRS_THEME_CONTEXT(currentAffairsTheme) : ""}`
    : "";

  // Build style distribution instructions
  const styleInstructions = styles
    .map(({ style, count }) => {
      return `
═══════════════════════════════════════════════════════════════════════════════
GENERATE ${count} QUESTION(S) IN THE FOLLOWING STYLE:
═══════════════════════════════════════════════════════════════════════════════
${STYLE_INSTRUCTIONS[style]}`;
    })
    .join("\n");

  return `
╔══════════════════════════════════════════════════════════════════════════════╗
║                    UPSC CIVIL SERVICES PRELIMINARY EXAMINATION                ║
║                         MCQ GENERATION TASK                                   ║
╚══════════════════════════════════════════════════════════════════════════════╝

GENERATE ${totalCount} UPSC-STANDARD MCQ QUESTIONS

SUBJECT: ${subject.toUpperCase()}
${themeContext}

TARGET ERA: ${eraLabel}
${eraInstruction}

${UPSC_STEM_TEMPLATES}

${era === "current" || era === "2024-2025" || era === "2021-2023" ? YEAR_TRENDS : ""}

${currentAffairsSection}

${PYQ_EXAMPLES}

${subjectContext ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUBJECT-SPECIFIC CONTEXT & KNOWLEDGE BASE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${subjectContext}
` : ""}

${subjectTraps ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUBJECT-SPECIFIC TRAP PATTERNS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${subjectTraps}
` : ""}

${DISTRACTOR_BLUEPRINT}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIFFICULTY CALIBRATION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${DIFFICULTY_INSTRUCTIONS[difficulty]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUESTION STYLE DISTRIBUTION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${styleInstructions}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL QUALITY REQUIREMENTS (NON-NEGOTIABLE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. FACTUAL ACCURACY (MOST IMPORTANT):
   - Every fact, date, number, name MUST be 100% accurate
   - Cross-reference with NCERT textbooks and standard references
   - Align with PYQ patterns and factual anchors reflected in the repo trends
   - If uncertain about a fact, DO NOT include it
   - Constitutional articles, amendment numbers must be exact
   - Years of events, treaties, acts must be verified

2. SINGLE CORRECT ANSWER:
   - There must be exactly ONE correct answer
   - The correct answer must be DEFINITIVELY correct, not "most correct"
   - All distractors must be DEFINITIVELY incorrect
   - No ambiguity - a subject expert should agree on the answer

3. ELIMINATION-PROOF DISTRACTORS:
   - DO NOT use absolute words (only, always, never, all, none) in wrong options
   - UPSC aspirants know these patterns - your questions must be smarter
   - Distractors should be plausible misconceptions, not obvious wrong answers
   - Each distractor should trap someone with incomplete knowledge

4. UPSC LANGUAGE STANDARDS:
   - Use formal, precise language
   - Avoid colloquialisms or informal expressions
   - Technical terms should be used correctly
   - Questions should be clear but not simplistic

5. NO CONTROVERSIAL CONTENT:
   - Avoid politically sensitive topics
   - No questions on disputed territories without clear UPSC precedent
   - No questions on ongoing court cases
   - Avoid religious content unless historically factual

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY SELF-VERIFICATION CHECKLIST:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before finalizing EACH question, verify:

□ Is every fact in the question 100% accurate?
□ Is the correct answer definitively correct?
□ Are ALL distractors definitively incorrect?
□ Would a UPSC subject expert agree with the answer?
□ Is the explanation accurate and educational?
□ Does the explanation cite proper reasoning (not just "this is correct")?
□ For statement questions: Is each statement independently verifiable?
□ For match questions: Is only ONE combination correct?
□ For assertion-reason: Is the relationship between A and R correctly identified?
□ Are there NO absolute words (only, always, never, all, none) making distractors obvious?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT (STRICT JSON):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return a JSON array with exactly ${totalCount} question objects.

Each object MUST have these exact fields:
{
  "questionText": "The complete question text with all statements/assertions formatted properly",
  "questionType": "standard" | "statement" | "match" | "assertion",
  "options": ["A) Option text", "B) Option text", "C) Option text", "D) Option text"],
  "correctOption": 0 | 1 | 2 | 3,  // Index of correct answer (0=A, 1=B, 2=C, 3=D)
  "explanation": "Detailed explanation with: 1) Why correct answer is correct, 2) Why each distractor is wrong, 3) Source reference (NCERT/Laxmikanth/etc.)"
}

IMPORTANT:
- Options array must have EXACTLY 4 options
- Each option must start with "A) ", "B) ", "C) ", "D) " prefix
- correctOption is 0-indexed (0=A, 1=B, 2=C, 3=D)
- Explanation should be educational and cite sources where applicable

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NOW GENERATE ${totalCount} HIGH-QUALITY UPSC MCQ QUESTIONS:`;
}
