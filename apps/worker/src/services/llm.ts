import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import type { Env } from "../types";
import type { GeneratedQuestion, QuestionStyle, Difficulty } from "@mcqs/shared";
import { getPrompt } from "../prompts";

interface GenerateQuizParams {
  subject: string;
  theme?: string;
  difficulty: Difficulty;
  styles: QuestionStyle[];
  count: number;
  apiKey?: string;
}

export async function generateQuiz(
  env: Env,
  params: GenerateQuizParams
): Promise<GeneratedQuestion[]> {
  const { subject, theme, difficulty, styles, count, apiKey } = params;

  // Get API key from params or environment
  const geminiApiKey = apiKey || env.GOOGLE_API_KEY;

  if (!geminiApiKey) {
    throw new Error("Gemini API key is required. Please add it in Settings.");
  }

  // Distribute questions across styles
  const questionsPerStyle = Math.floor(count / styles.length);
  const remainderQuestions = count % styles.length;

  // Create distribution: each style gets base count, first styles get the remainder
  const styleDistribution: { style: QuestionStyle; count: number }[] = styles.map(
    (style, index) => ({
      style,
      count: questionsPerStyle + (index < remainderQuestions ? 1 : 0),
    })
  );

  const prompt = getPrompt({
    subject,
    theme,
    difficulty,
    styles: styleDistribution,
    totalCount: count,
  });

  const systemPrompt = `You are an expert UPSC exam question generator. Generate exactly ${count} high-quality MCQ questions.

CRITICAL: You must respond with ONLY valid JSON, no other text. The response must be a JSON array of question objects.

Each question object must have:
- questionText: string (the question)
- questionType: string (one of: "standard", "statement", "match", "assertion")
- options: string[] (exactly 4 options labeled A, B, C, D)
- correctOption: number (0-3, index of correct answer)
- explanation: string (detailed explanation of why the answer is correct)

For statement questions, format the question with "Statement I:" and "Statement II:" prefixes.
For match questions, include columns in the question text and options like "A-1, B-2, C-3, D-4".
For assertion-reason, format with "Assertion (A):" and "Reason (R):" prefixes.`;

  // Use Gemini
  const google = createGoogleGenerativeAI({
    apiKey: geminiApiKey,
  });

  const { text } = await generateText({
    model: google("gemini-3-flash-preview"),
    system: systemPrompt,
    prompt: prompt,
    maxTokens: Math.min(4000 + count * 200, 16000), // Scale tokens with question count
  });

  // Parse the response
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("No JSON array found in response");
    }

    const questions: GeneratedQuestion[] = JSON.parse(jsonMatch[0]);

    // Validate and normalize questions
    return questions.slice(0, count).map((q, i) => ({
      questionText: q.questionText || `Question ${i + 1}`,
      questionType: q.questionType || "standard",
      options: Array.isArray(q.options) && q.options.length === 4
        ? q.options
        : ["Option A", "Option B", "Option C", "Option D"],
      correctOption: typeof q.correctOption === "number" && q.correctOption >= 0 && q.correctOption <= 3
        ? q.correctOption
        : 0,
      explanation: q.explanation || "No explanation provided.",
      metadata: q.metadata,
    }));
  } catch (error) {
    console.error("Failed to parse LLM response:", error);
    console.error("Raw response:", text);
    throw new Error("Failed to generate valid questions. Please try again.");
  }
}
