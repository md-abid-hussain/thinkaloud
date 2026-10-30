import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage, type AIMessage } from "@langchain/core/messages";
import type { Ask } from "./generate";

export type CallLog = { label: string; input: number; output: number; ms: number };

/** Structured output by JSON schema (not a forced tool, which Haiku 5.5's siblings reject), validated with zod again. */
export function modelAsk(model: BaseChatModel, log: CallLog[] = []): Ask {
  return async (schema, system, user, label) => {
    const started = Date.now();
    const structured = model.withStructuredOutput(schema, { method: "jsonSchema", includeRaw: true });
    const result = await structured.invoke([new SystemMessage(system), new HumanMessage(user)]);
    const usage = (result.raw as AIMessage).usage_metadata;
    log.push({ label, input: usage?.input_tokens ?? 0, output: usage?.output_tokens ?? 0, ms: Date.now() - started });
    const parsed = schema.safeParse(result.parsed);
    if (!parsed.success) throw new Error(`${label}: the answer doesn't match the schema: ${parsed.error.message.slice(0, 500)}`);
    return parsed.data;
  };
}
