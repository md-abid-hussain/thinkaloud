import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage, type AIMessage } from "@langchain/core/messages";
import type { Ask } from "./generate";

export type CallLog = { label: string; input: number; output: number; ms: number };

/** Structured output by JSON schema (not a forced tool, which Haiku 5.5's siblings reject), validated with zod again. */
export function modelAsk(model: BaseChatModel, log: CallLog[] = []): Ask {
  return async (schema, system, user, label) => {
    const structured = model.withStructuredOutput(schema, { method: "jsonSchema", includeRaw: true });
    // An answer cut off at the token limit parses as null; one more try usually comes back whole.
    for (let attempt = 1; ; attempt++) {
      const started = Date.now();
      const result = await structured.invoke([new SystemMessage(system), new HumanMessage(user)]);
      const raw = result.raw as AIMessage;
      log.push({ label, input: raw.usage_metadata?.input_tokens ?? 0, output: raw.usage_metadata?.output_tokens ?? 0, ms: Date.now() - started });
      const parsed = schema.safeParse(result.parsed);
      if (parsed.success) return parsed.data;
      if (attempt === 2) {
        const stop = raw.response_metadata?.stop_reason;
        throw new Error(`${label}: the answer doesn't match the schema${stop ? ` (stop reason ${stop})` : ""}: ${parsed.error.message.slice(0, 500)}`);
      }
    }
  };
}
