import type { Intent, ToolLine } from "../repo";

/** What a mentor turn reports while it runs. The stream route forwards these to the browser as server-sent events. */
export type TurnEvent =
  | { type: "intent"; intent: Intent }
  | { type: "tool"; line: ToolLine }
  | { type: "delta"; text: string }
  | { type: "reset" }
  | { type: "done"; status: "done" | "failed" };

type Listener = (event: TurnEvent) => void;

/**
 * Events of one running turn, kept in memory so a browser that connects late, or reconnects,
 * replays everything so far. The reply itself is saved to the database when the turn ends.
 */
class TurnStream {
  readonly events: TurnEvent[] = [];
  private listeners = new Set<Listener>();
  closed = false;

  publish(event: TurnEvent) {
    if (this.closed) return;
    this.events.push(event);
    for (const listener of this.listeners) listener(event);
    if (event.type === "done") this.closed = true;
  }

  subscribe(listener: Listener): () => void {
    for (const event of this.events) listener(event);
    if (this.closed) return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const store = globalThis as unknown as { __thinkaloudTurns?: Map<number, TurnStream> };
const turns = (store.__thinkaloudTurns ??= new Map());

const KEEP_AFTER_DONE_MS = 2 * 60 * 1000;

export function openTurnStream(messageId: number): TurnStream {
  const stream = new TurnStream();
  turns.set(messageId, stream);
  stream.subscribe((event) => {
    if (event.type === "done") setTimeout(() => turns.delete(messageId), KEEP_AFTER_DONE_MS).unref?.();
  });
  return stream;
}

export function getTurnStream(messageId: number): TurnStream | undefined {
  return turns.get(messageId);
}
