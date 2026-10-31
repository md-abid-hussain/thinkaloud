import { ChatAnthropic } from "@langchain/anthropic";
import { env } from "../env";

/**
 * Model choices (docs/architecture.md). Notes for these models:
 * - Opus 5.5 always thinks; effort is the control, and its default is medium, so it is set explicitly.
 * - temperature is never set: every model rejects it since 2026-10-21.
 * - Forced tool choice is rejected on Opus 5.5, so structured output uses JSON schema, not a forced tool.
 * - Refusals fall back server-side to the model Anthropic recommends for the category (Opus only; Haiku 5.5 has no
 *   server-side fallback).
 */
export const MODELS = {
  // Haiku 5.5 for the chat, chosen by Abid on 30 Oct: fast and cheap enough for every turn. Override with MENTOR_MODEL.
  mentor: process.env.MENTOR_MODEL || "claude-haiku-5-5",
  research: "claude-opus-5-5",
  intent: "claude-haiku-5-5",
  // Content generators and the relevance judge (everything runs on Haiku 5.5). Run once per project.
  generate: "claude-haiku-5-5",
};

type Effort = "low" | "medium" | "high";
const MENTOR_EFFORT: Effort = (["low", "medium", "high"] as const).find((e) => e === process.env.MENTOR_EFFORT) ?? "low";

const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  invocationKwargs: { fallbacks: "default" },
};

export function mentorModel(): ChatAnthropic {
  return new ChatAnthropic({
    model: MODELS.mentor,
    apiKey: env.anthropicKey,
    maxTokens: 16000,
    streaming: true,
    outputConfig: { effort: MENTOR_EFFORT },
    ...(MODELS.mentor.includes("opus") ? FALLBACK : {}),
  });
}

export function researchModel(): ChatAnthropic {
  return new ChatAnthropic({
    model: MODELS.research,
    apiKey: env.anthropicKey,
    maxTokens: 32000,
    streaming: true,
    outputConfig: { effort: "medium" },
    ...FALLBACK,
  });
}

/**
 * Haiku 5.5 at high effort: generation runs once per project, so quality matters more than speed. Checks for a binary
 * protocol (hex replies) plus thinking can pass 32K output tokens; Haiku 5.5 allows 128K.
 */
export function generateModel(): ChatAnthropic {
  return new ChatAnthropic({
    model: MODELS.generate,
    apiKey: env.anthropicKey,
    maxTokens: 64000,
    streaming: true,
    outputConfig: { effort: "high" },
  });
}

export function intentModel(): ChatAnthropic {
  return new ChatAnthropic({
    model: MODELS.intent,
    apiKey: env.anthropicKey,
    maxTokens: 1024,
    outputConfig: { effort: "low" },
  });
}
