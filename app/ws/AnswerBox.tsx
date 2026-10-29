"use client";
// The Wispr-ready answer box. A large ordinary textarea: typing works for everything, and Wispr Flow (or any
// dictation tool) types into it. A burst of text in one input event that isn't a paste shows "Dictated" for a
// moment and adds to the dictated seconds. Ctrl/Cmd+Enter submits.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useWisprKeys, words } from "./hooks";

/** Submit on its own a few seconds after dictation stops. Undecided, so it stays off. Typed answers never auto-check. */
export const AUTO_CHECK_AFTER_DICTATION = false;
const BURST_CHARS = 25;
const AUTO_CHECK_IDLE_MS = 4000;
const AUTO_CHECK_COUNT = 4;
const WORDS_PER_SECOND = 2.5; // about 150 words a minute, for the "spoke for" estimate

export function Keys() {
  const keys = useWisprKeys();
  if (!keys) return <span className="keys" />;
  return (
    <span className="keys">
      {keys.map((k, i) => <span key={k}>{i > 0 && " + "}<span className="kc">{k}</span></span>)}
    </span>
  );
}

export function Wave({ heights = [6, 12, 14, 8, 11] }: { heights?: number[] }) {
  return <span className="wave" aria-hidden="true">{heights.map((h, i) => <i key={i} style={{ height: h }} />)}</span>;
}

export interface AnswerBoxProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  variant?: "answer" | "ask";
  actions?: ReactNode;
  busy?: boolean;
  /** Called with the running total of estimated dictated seconds. */
  onDictated?: (seconds: number) => void;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export default function AnswerBox({ id, label, value, onChange, onSubmit, placeholder, autoFocus, variant = "answer", actions, busy, onDictated, inputRef }: AnswerBoxProps) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? own;
  const pasted = useRef(false);
  const seconds = useRef(0);
  const [dictated, setDictated] = useState(false);
  const [burstAt, setBurstAt] = useState<number | null>(null); // last change was a burst, at this time
  const [count, setCount] = useState<number | null>(null);
  const submit = useRef(onSubmit);
  submit.current = onSubmit;

  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus, ref]);

  // "Dictated" shows for a moment after each burst.
  useEffect(() => {
    if (!dictated) return;
    const t = setTimeout(() => setDictated(false), 2400);
    return () => clearTimeout(t);
  }, [dictated, burstAt]);

  // Auto-check: after a burst and 4 s with no change, count down from 4, then submit. Any change cancels it.
  useEffect(() => {
    if (!AUTO_CHECK_AFTER_DICTATION || burstAt === null) return;
    const t = setTimeout(() => setCount(AUTO_CHECK_COUNT), AUTO_CHECK_IDLE_MS);
    return () => clearTimeout(t);
  }, [burstAt]);
  useEffect(() => {
    if (count === null) return;
    if (count === 0) { setCount(null); setBurstAt(null); submit.current(); return; }
    const t = setTimeout(() => setCount((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [count]);

  const change = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    const type = (e.nativeEvent as InputEvent).inputType ?? "";
    const added = next.length - value.length;
    const isPaste = pasted.current || type === "insertFromPaste" || type === "insertFromDrop" || type === "insertFromPasteAsQuotation";
    pasted.current = false;
    setCount(null);
    if (added > BURST_CHARS && !isPaste) {
      seconds.current += Math.max(1, Math.round(words(next.slice(e.target.selectionStart - added, e.target.selectionStart)) / WORDS_PER_SECOND));
      onDictated?.(seconds.current);
      setDictated(true);
      setBurstAt(Date.now());
    } else {
      setBurstAt(null);
    }
    onChange(next);
  };

  const key = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setCount(null);
      onSubmit();
    }
  };

  const n = words(value);
  const status = (
    <>
      {dictated && <span className="dict" role="status"><Wave heights={[5, 10, 13, 7, 10]} />Dictated</span>}
      {count !== null && (
        <span className="auto" role="status">Checking in {count}s · <button type="button" className="linkbtn" onClick={() => { setCount(null); setBurstAt(null); }}>Cancel</button></span>
      )}
    </>
  );

  return (
    <>
      <label className="sr" htmlFor={id}>{label}</label>
      <textarea
        ref={ref}
        id={id}
        className={variant === "answer" ? "answer" : undefined}
        value={value}
        placeholder={placeholder}
        onChange={change}
        onPaste={() => { pasted.current = true; }}
        onKeyDown={key}
        aria-busy={busy || undefined}
        spellCheck
      />
      <div className="ans-bar">
        {variant === "answer" ? (
          <p className="cue">
            Hold <Keys /> <span>to dictate with <a href="https://wisprflow.ai/r?MD13753" rel="sponsored noopener">Wispr Flow</a>, or type · {n} {n === 1 ? "word" : "words"}</span>
            {status}
          </p>
        ) : (
          <p className="cue">Hold <Keys /> <span>to speak</span>{status}</p>
        )}
        {actions && <div className="acts">{actions}</div>}
      </div>
    </>
  );
}
