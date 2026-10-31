import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage, type AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { Intent } from "../repo";

const IntentSchema = z.object({
  intent: z.enum(["help", "explaining", "code"]),
});

const SYSTEM = `You label one message from a learner in a coding mentor chat. Reply with exactly one intent.
- code: the learner explicitly asks to be shown code, a snippet or an implementation ("show me the code", "write it for me", "give me the snippet").
- explaining: the learner is explaining a concept in their own words: answering the mentor's question, or offering an explanation to be checked.
- help: everything else: questions, being stuck, asking for a hint or example in words, saying a step is done, pasting output or code to review, choosing a language, small talk.
Asking how something works, or which class to use, is help, not code.`;

export type IntentContext = { text: string; openQuestion: string | null; lastMentorText: string | null };

export type IntentResult = { intent: Intent; raw: AIMessage | null };

/** One small structured call. A failure falls back to help, which is always safe (code stays locked). */
export async function classifyIntent(model: BaseChatModel, ctx: IntentContext): Promise<IntentResult> {
  const context = [
    ctx.openQuestion ? `The mentor's open question asks the learner to explain: ${ctx.openQuestion}.` : "No question is open.",
    ctx.lastMentorText ? `The mentor's last message: """${ctx.lastMentorText.slice(0, 1200)}"""` : "",
    `The learner's message: """${ctx.text.slice(0, 4000)}"""`,
  ]
    .filter(Boolean)
    .join("\n\n");
  try {
    const structured = model.withStructuredOutput(IntentSchema, { method: "jsonSchema", includeRaw: true });
    const result = await structured.invoke([new SystemMessage(SYSTEM), new HumanMessage(context)]);
    const parsed = IntentSchema.safeParse(result.parsed);
    return { intent: parsed.success ? parsed.data.intent : "help", raw: result.raw as AIMessage };
  } catch {
    return { intent: "help", raw: null };
  }
}
