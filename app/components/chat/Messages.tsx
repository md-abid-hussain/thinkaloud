"use client";

import type { ReactNode } from "react";
import type { Intent, Message, ToolLine } from "@/lib/repo";
import { Markdown } from "./Markdown";

const INTENT_LABEL: Record<Intent, string> = { help: "Help", explaining: "Explaining", code: "Code" };

function clock(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** One transcript row: a time column, then the turn. Cards use it too, with no speaker label. */
export function Row({ at, children, kind, id }: { at: string | null; children: ReactNode; kind: string; id?: string }) {
  return (
    <div className={`tx-row tx-${kind}`} id={id}>
      <time className="tx-t" dateTime={at ?? undefined}>
        {clock(at)}
      </time>
      <div className="tx-body">{children}</div>
    </div>
  );
}

/** A learner turn, with the sentence the mentor accepted as evidence highlighted. */
export function LearnerMessage({ message, quotes, intent }: { message: Message; quotes: string[]; intent: Intent | null }) {
  return (
    <Row at={message.createdAt} kind="learner">
      <p className="who">
        <span className="label">You</span>
        {intent && <span className={`intent intent-${intent}`}>{INTENT_LABEL[intent]}</span>}
      </p>
      <div className="said">{highlight(message.text, quotes)}</div>
    </Row>
  );
}

/** A mentor turn: the tool lines (what it did), then the reply. Streams while it's being written. */
export function MentorMessage({
  at,
  text,
  tools,
  status,
  onRetry,
}: {
  at: string | null;
  text: string;
  tools: ToolLine[];
  status: "pending" | "done" | "failed";
  onRetry?: () => void;
}) {
  return (
    <Row at={at} kind={`mentor ${status}`}>
      {/* Busy while streaming, so a screen reader reads the finished reply once instead of every fragment. */}
      <div aria-live={status === "pending" ? "polite" : undefined} aria-busy={status === "pending"}>
        <p className="who">
          <span className="label">Mentor</span>
        </p>
        {tools.length > 0 && (
          <ul className="trace">
            {tools.map((t, i) => (
              <li key={i}>{t.label}</li>
            ))}
          </ul>
        )}
        {text ? (
          <div className="reply">
            <Markdown text={text} />
          </div>
        ) : status === "pending" ? (
          <p className="thinking">
            <span />
            <span />
            <span />
            <span className="sr">The mentor is thinking</span>
          </p>
        ) : null}
        {status === "failed" && onRetry && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={onRetry}>
            Send again
          </button>
        )}
      </div>
    </Row>
  );
}

function highlight(text: string, quotes: string[]): ReactNode {
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const quote of quotes) {
    const at = lower.indexOf(quote.toLowerCase().trim());
    if (at >= 0) ranges.push([at, at + quote.trim().length]);
  }
  if (!ranges.length) return text;
  ranges.sort((a, b) => a[0] - b[0]);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor) continue;
    parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={start} className="ev" title="Accepted as your answer">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  parts.push(text.slice(cursor));
  return parts;
}
