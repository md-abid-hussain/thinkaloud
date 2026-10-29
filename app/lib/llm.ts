// The Claude client and model choices. Only the server holds the key (ANTHROPIC_API_KEY).
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MENTOR_MODEL = "claude-opus-5-5";
export const GRADER_MODEL = "claude-sonnet-5-5";
// Server-side fallback when a safety classifier declines a request (routed by category).
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;
export function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new ModelUnavailable("Checking needs the server's API key, which isn't set yet.", "config");
  client ??= new Anthropic();
  return client;
}

/** A model call that cannot run right now (no key, cap reached, API down). The run is paused, not failed. */
export class ModelUnavailable extends Error {
  constructor(message: string, readonly reason: "cap" | "guest_cap" | "config" | "api" = "config") {
    super(message);
  }
}
