import process from "node:process";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

const model = process.argv[2] || "gemini-3-pro-preview";
const apiKey = process.env.GOOGLE_API_KEY;

if (!apiKey) {
  console.error("Missing GOOGLE_API_KEY in environment.");
  process.exit(1);
}

async function main() {
  const google = createGoogleGenerativeAI({ apiKey });
  const startedAt = Date.now();

  try {
    const res = await generateText({
      model: google(model),
      system: "Reply with ONLY valid JSON: {\"ok\":true,\"model\":\"...\"}",
      prompt: "ping",
      maxTokens: 64,
    });

    const durationMs = Date.now() - startedAt;
    console.log(
      JSON.stringify(
        {
          ok: true,
          model,
          durationMs,
          responseText: res.text,
          usage: res.usage ?? null,
        },
        null,
        2
      )
    );
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error(
      JSON.stringify(
        {
          ok: false,
          model,
          durationMs,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message, stack: error.stack }
              : String(error),
        },
        null,
        2
      )
    );
    process.exit(2);
  }
}

main();
