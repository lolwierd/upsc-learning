import { VertexAI, type GenerateContentResult } from "@google-cloud/vertexai";
import { JSON_RESPONSE_MIME_TYPE } from "./structured-output.js";

export interface VertexStructuredResult {
  text: string;
  rawResponse?: unknown;
  groundingMetadata?: {
    groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    groundingSupports?: unknown[];
    webSearchQueries?: string[];
  };
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

interface VertexStructuredParams {
  serviceAccount: { project_id: string; client_email: string; private_key: string };
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
  responseSchema: unknown;
  location?: string;
  enableGrounding?: boolean;
  thinkingLevel?: "low" | "medium" | "high";
  temperature?: number;
}

export async function generateVertexStructuredContent(
  params: VertexStructuredParams
): Promise<VertexStructuredResult> {
  const {
    serviceAccount,
    model,
    systemPrompt,
    userPrompt,
    maxOutputTokens,
    responseSchema,
    location = "global",
    enableGrounding = false,
    thinkingLevel,
    temperature,
  } = params;

  const vertexAI = new VertexAI({
    project: serviceAccount.project_id,
    location,
    apiEndpoint: location === "global" ? "aiplatform.googleapis.com" : undefined,
    googleAuthOptions: {
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key,
      },
    },
  });

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens,
    responseMimeType: JSON_RESPONSE_MIME_TYPE,
    responseSchema: responseSchema as Record<string, unknown>,
  };
  if (typeof temperature === "number") {
    generationConfig.temperature = temperature;
  }
  if (thinkingLevel) {
    generationConfig.thinkingConfig = { thinkingLevel };
  }

  const generativeModel = vertexAI.preview.getGenerativeModel({
    model,
    generationConfig,
  });

  const request: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
  };
  if (enableGrounding) {
    request.tools = [{ googleSearch: {} }];
  }

  const result: GenerateContentResult = await generativeModel.generateContent(
    request as any
  );
  const response = result.response;

  const text = response.candidates?.[0]?.content?.parts
    ?.map((part: any) => part.text || "")
    .join("") || "";

  const groundingMetadata = response.candidates?.[0]?.groundingMetadata as any;
  const usageMetadata = response.usageMetadata;

  return {
    text,
    rawResponse: response,
    groundingMetadata,
    usage: usageMetadata
      ? {
        promptTokens: usageMetadata.promptTokenCount,
        completionTokens: usageMetadata.candidatesTokenCount,
        totalTokens: usageMetadata.totalTokenCount,
      }
      : undefined,
  };
}
