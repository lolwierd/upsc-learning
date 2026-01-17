import type { QuestionStyle, Difficulty } from "@mcqs/shared";

interface StyleDistribution {
  style: QuestionStyle;
  count: number;
}

interface PromptParams {
  subject: string;
  theme?: string;
  difficulty: Difficulty;
  styles: StyleDistribution[];
  totalCount: number;
}

const DIFFICULTY_INSTRUCTIONS: Record<Difficulty, string> = {
  easy: `
- Use straightforward, direct questions
- Focus on basic facts and fundamental concepts
- Avoid tricky wording or complex scenarios
- Options should be clearly distinguishable`,
  medium: `
- Include application-based questions
- Test understanding beyond mere recall
- Some questions may require connecting multiple concepts
- Options should include plausible distractors`,
  hard: `
- Questions should require deep analytical thinking
- Include multi-concept integration
- Use nuanced language similar to actual UPSC prelims
- Options should include sophisticated distractors that test fine distinctions`,
};

const STYLE_INSTRUCTIONS: Record<QuestionStyle, string> = {
  factual: `
FACTUAL STYLE:
- Test specific knowledge or facts
- Have one clearly correct answer
- Include four options (A, B, C, D)
- questionType should be "standard"`,
  conceptual: `
CONCEPTUAL STYLE:
- Test understanding of principles and concepts
- May involve application of concepts to scenarios
- Have one clearly correct answer based on conceptual understanding
- questionType should be "standard"`,
  statement: `
STATEMENT I & II STYLE:
- Present two related statements
- Ask which statement(s) are correct
- Options should be:
  A) Both statements are correct
  B) Only Statement I is correct
  C) Only Statement II is correct
  D) Neither statement is correct
- Format with "Statement I:" and "Statement II:" prefixes
- questionType should be "statement"`,
  match: `
MATCH THE FOLLOWING STYLE:
- Have Column A (items) and Column B (descriptions/matches)
- Present 4 items to match
- Options should be different matching combinations like:
  A) A-1, B-2, C-3, D-4
  B) A-2, B-1, C-4, D-3
  etc.
- questionType should be "match"`,
  assertion: `
ASSERTION-REASON STYLE:
- Have an Assertion (A) and a Reason (R)
- Both should be related but the relationship varies
- Options should be:
  A) Both A and R are true, and R is the correct explanation of A
  B) Both A and R are true, but R is not the correct explanation of A
  C) A is true but R is false
  D) A is false but R is true
- Format with "Assertion (A):" and "Reason (R):" prefixes
- questionType should be "assertion"`,
};

export function getPrompt(params: PromptParams): string {
  const { subject, theme, difficulty, styles, totalCount } = params;

  const themeContext = theme
    ? `Focus specifically on the theme: "${theme}"`
    : "Cover a diverse range of topics within the subject";

  // Build style distribution instructions
  const styleInstructions = styles
    .map(({ style, count }) => {
      return `Generate ${count} question(s) in this style:
${STYLE_INSTRUCTIONS[style]}`;
    })
    .join("\n\n");

  return `Generate ${totalCount} UPSC-style MCQ questions for the subject: ${subject}

${themeContext}

DIFFICULTY LEVEL: ${difficulty.toUpperCase()}
${DIFFICULTY_INSTRUCTIONS[difficulty]}

QUESTION STYLES DISTRIBUTION:
${styleInstructions}

QUALITY REQUIREMENTS:
1. Questions must be factually accurate
2. No ambiguous or controversial questions
3. Explanations must be educational and cite reasoning
4. Language should match UPSC exam standards
5. Avoid questions that can be answered by elimination alone

SELF-VERIFICATION:
Before finalizing each question, verify that:
- The correct answer actually matches the explanation
- All distractors are plausible but definitively incorrect
- The question has exactly one correct answer

OUTPUT FORMAT:
Return a JSON array with ${totalCount} question objects. Each object must have:
{
  "questionText": "The question text",
  "questionType": "standard" | "statement" | "match" | "assertion",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctOption": 0-3 (index of correct answer),
  "explanation": "Detailed explanation"
}

Generate the questions now:`;
}
