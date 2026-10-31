"use client";

import type { ReactNode } from "react";
import type { Intent, Message, ToolLine } from "@/lib/repo";
import { Markdown } from "./Markdown";

const INTENT_LABEL: Record<Intent, string> = { help: "Help", explaining: "Explaining", code: "Code" };

function clock(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** The day a message was sent, in words: the transcript names the day once instead of a time on every turn. */
export function dayName(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

export function DayDivider({ at }: { at: string }) {
  return (
    <p className="day">
      <span>{dayName(at)}</span>
    </p>
  );
}

/** The waveform from the wordmark, small: the mentor's avatar. */
export function Wave({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      {[3, 8, 13, 18, 23].map((x, i) => {
        const h = [8, 16, 22, 14, 6][i];
        return <rect key={x} x={x - 1.5} y={13 - h / 2} width="3" height={h} rx="1.5" fill="currentColor" />;
      })}
    </svg>
  );
}

/** A learner turn, on the right, with the sentence the mentor accepted as evidence highlighted. The time shows on hover. */
export function LearnerMessage({ message, quotes, intent }: { message: Message; quotes: string[]; intent: Intent | null }) {
  return (
    <div className="turn you">
      <div className="bubble" title={clock(message.createdAt)}>
        <span className="sr">You said: </span>
        {intent && <span className={`intent intent-${intent}`}>{INTENT_LABEL[intent]}</span>}
        <div className="said">{highlight(message.text, quotes)}</div>
      </div>
    </div>
  );
}

/** What the mentor did before replying, folded to one line. While it works, the line shows its latest step. */
function ToolTrace({ tools, live }: { tools: ToolLine[]; live: boolean }) {
  const summary = live ? tools[tools.length - 1].label : tools.length === 1 ? tools[0].label : `${tools[0].label} + ${tools.length - 1} more`;
  return (
    <details className="trace">
      <summary>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 4l4 4-4 4" />
        </svg>
        {summary}
      </summary>
      <ul>
        {tools.map((t, i) => (
          <li key={i}>{t.label}</li>
        ))}
      </ul>
    </details>
  );
}

/** A mentor turn: its name, what it looked at, then the reply as plain reading text. Streams while it's being written. */
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
    <div className={`turn mentor ${status}`}>
      {/* Busy while streaming, so a screen reader reads the finished reply once instead of every fragment. */}
      <div aria-live={status === "pending" ? "polite" : undefined} aria-busy={status === "pending"}>
        <p className="who" title={clock(at)}>
          <span className="av">
            <Wave />
          </span>
          Mentor
        </p>
        {tools.length > 0 && <ToolTrace tools={tools} live={status === "pending"} />}
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
    </div>
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
