import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, HumanMessage, RemoveMessage, type BaseMessage, type SystemMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { Annotation, END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { Intent } from "../repo";

/**
 * One mentor turn as a LangGraph graph:
 *
 *   START → classify → mentor ⇄ tools
 *                        ↓
 *                      guard → END   (or back to mentor once, if it wrote code it wasn't allowed to)
 *
 * The intent check runs first so the code rule is decided by the app, not by the mentor's own reply.
 *
 * The conversation sent to the model is append-only within a turn: Opus 5.5 binds each thinking block
 * to the exact prompt it was made with, so the system message is built once per turn and never changed.
 * Tools report fresh progress in their results instead.
 */
export const MAX_MODEL_CALLS = 4;

export const REWRITE_NOTE =
  "(Note from the app: your draft contained code, and code isn't allowed this turn because the learner didn't ask for it. Write the reply again in words only. Name classes and functions in backticks if you need to.)";

export const TurnState = Annotation.Root({
  ...MessagesAnnotation.spec,
  intent: Annotation<Intent>({ reducer: (_old, next) => next, default: () => "help" }),
  modelCalls: Annotation<number>({ reducer: (total, add) => total + add, default: () => 0 }),
  rewrite: Annotation<boolean>({ reducer: (_old, next) => next, default: () => false }),
  rewritten: Annotation<boolean>({ reducer: (_old, next) => next, default: () => false }),
});

export type TurnStateType = typeof TurnState.State;

export type TurnGraphDeps = {
  classify(): Promise<Intent>;
  mentor: BaseChatModel;
  tools: StructuredToolInterface[];
  /** Builds the system message. Called once per turn, after the intent check. */
  system(intent: Intent): Promise<SystemMessage>;
  maxModelCalls?: number;
};

/** A fenced code block, or a line that reads like code. Inline `names` are allowed. */
export function containsCode(text: string): boolean {
  return /```/.test(text) || /^\s{0,8}(public |private |def |function |class |import |#include|const |let |var )\S/m.test(text);
}

export function textOf(message: BaseMessage | undefined): string {
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") return content;
  return content
    .map((block) => (typeof block === "object" && block !== null && "type" in block && block.type === "text" ? String((block as { text: string }).text) : ""))
    .join("");
}

function lastAI(messages: BaseMessage[]): AIMessage | undefined {
  const last = messages.at(-1);
  return last && AIMessage.isInstance(last) ? last : undefined;
}

export function buildTurnGraph(deps: TurnGraphDeps) {
  const maxCalls = deps.maxModelCalls ?? MAX_MODEL_CALLS;

  const classify = async () => ({ intent: await deps.classify() });

  let system: SystemMessage | null = null;
  const mentor = async (state: TurnStateType) => {
    system ??= await deps.system(state.intent);
    const finalCall = state.modelCalls + 1 >= maxCalls;
    const model = deps.mentor.bindTools!(deps.tools, finalCall ? { tool_choice: "none" } : {});
    const reply = await model.invoke([system, ...state.messages]);
    return { messages: [reply], modelCalls: 1, rewrite: false };
  };

  const afterMentor = (state: TurnStateType) => {
    const ai = lastAI(state.messages);
    return ai?.tool_calls?.length && state.modelCalls < maxCalls ? "tools" : "guard";
  };

  // A draft with code it wasn't allowed to write is removed and the model is asked again, once.
  // Removing the last reply and appending a note keeps the rest of the conversation unchanged.
  const guard = (state: TurnStateType) => {
    const draft = lastAI(state.messages);
    if (draft?.id && state.intent !== "code" && !state.rewritten && containsCode(textOf(draft))) {
      return { messages: [new RemoveMessage({ id: draft.id }), new HumanMessage(REWRITE_NOTE)], rewrite: true, rewritten: true };
    }
    return {};
  };

  return new StateGraph(TurnState)
    .addNode("classify", classify)
    .addNode("mentor", mentor)
    .addNode("tools", new ToolNode(deps.tools))
    .addNode("guard", guard)
    .addEdge(START, "classify")
    .addEdge("classify", "mentor")
    .addConditionalEdges("mentor", afterMentor, ["tools", "guard"])
    .addEdge("tools", "mentor")
    .addConditionalEdges("guard", (s: TurnStateType) => (s.rewrite ? "mentor" : END), ["mentor", END])
    .compile();
}
