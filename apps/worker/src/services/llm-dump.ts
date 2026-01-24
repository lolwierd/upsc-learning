import type { Env } from "../types";

export type LlmDumpKind = "generation" | "fact_check";

export interface LlmDumpPayload {
  kind: LlmDumpKind;
  callId: string;
  parentCallId?: string;
  model: string;
  provider: "gemini" | "openai";
  startedAtMs: number;
  durationMs: number;
  request: {
    system?: string;
    prompt?: string;
    maxTokens?: number;
    temperature?: number;
    metadata?: Record<string, unknown>;
  };
  response: {
    text: string;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    error?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
}

function isLocalDumpEnabled(env: Env): boolean {
  // Allow explicit enable via LLM_DUMP, or default to development-only
  if (env.LLM_DUMP === "1") return !!env.LOCAL_LLM_DUMP_URL;
  return env.ENVIRONMENT === "development" && !!env.LOCAL_LLM_DUMP_URL;
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (error && typeof error === "object") {
    try {
      return JSON.parse(JSON.stringify(error)) as Record<string, unknown>;
    } catch {
      return { message: "[unserializable error object]" };
    }
  }

  return { message: String(error) };
}

export async function dumpLlmCall(env: Env, payload: LlmDumpPayload): Promise<void> {
  if (!isLocalDumpEnabled(env)) return;

  try {
    const res = await globalThis.fetch(env.LOCAL_LLM_DUMP_URL as string, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (env.LLM_DEBUG === "1") {
      if (!res.ok) {
        console.warn(`[llm-dump] failed (${res.status}) for ${payload.kind} ${payload.callId}`);
      } else {
        console.log(`[llm-dump] saved ${payload.kind} ${payload.callId}`);
      }
    }
  } catch (error) {
    if (env.LLM_DEBUG === "1") {
      console.warn("[llm-dump] error:", error);
    }
  }
}
