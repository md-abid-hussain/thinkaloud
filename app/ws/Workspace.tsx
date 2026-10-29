"use client";
// The workspace frame: three panes from 1200px (steps rail, the step, the mentor), tabs below that.
// Shares a little state between the step and the mentor: the tab, the ask draft, "Show me code" unlocked for the
// next mentor message, whether grading is paused, and a toast.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type Tab = "step" | "mentor" | "steps";
const TABS: { id: Tab; t: string; panel: string }[] = [
  { id: "step", t: "Step", panel: "p-step" },
  { id: "mentor", t: "Mentor", panel: "p-mentor" },
  { id: "steps", t: "Steps", panel: "p-steps" },
];

interface WsCtx {
  tab: Tab;
  showTab: (t: Tab) => void;
  narrow: () => boolean;
  askDraft: string;
  setAskDraft: (s: string) => void;
  focusAsk: () => void;
  codeUnlocked: boolean;
  setCodeUnlocked: (b: boolean) => void;
  gradingPaused: boolean;
  setGradingPaused: (b: boolean) => void;
  mentorNew: () => void;
  toast: (m: string) => void;
}
const Ctx = createContext<WsCtx | null>(null);
export const useWs = () => useContext(Ctx)!;

export default function Workspace({ rail, main, mentor, railLabel }: { rail: ReactNode; main: ReactNode; mentor: ReactNode; railLabel: string }) {
  const [tab, setTab] = useState<Tab>("step");
  const [askDraft, setAskDraft] = useState("");
  const [codeUnlocked, setCodeUnlocked] = useState(false);
  const [gradingPaused, setGradingPaused] = useState(false);
  const [dot, setDot] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const narrow = useCallback(() => typeof window !== "undefined" && window.innerWidth < 1200, []);
  const showTab = useCallback((t: Tab) => { setTab(t); if (t === "mentor") setDot(false); }, []);
  const focusAsk = useCallback(() => {
    if (narrow()) showTab("mentor");
    setTimeout(() => document.getElementById("ask-in")?.focus(), 0);
  }, [narrow, showTab]);
  const toast = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3200);
  }, []);
  const mentorNew = useCallback(() => { if (narrow() && tab !== "mentor") setDot(true); }, [narrow, tab]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const n = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    showTab(n.id);
    tabRefs.current[n.id]?.focus();
  };

  const value = useMemo<WsCtx>(() => ({
    tab, showTab, narrow, askDraft, setAskDraft, focusAsk, codeUnlocked, setCodeUnlocked, gradingPaused, setGradingPaused, mentorNew, toast,
  }), [tab, showTab, narrow, askDraft, focusAsk, codeUnlocked, gradingPaused, mentorNew, toast]);

  return (
    <Ctx.Provider value={value}>
      <div className="wrap" id="top">
        <div className="tabs" role="tablist" aria-label="Workspace">
          {TABS.map((t, i) => (
            <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-controls={t.panel} aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1}
              ref={(el) => { tabRefs.current[t.id] = el; }} onClick={() => showTab(t.id)} onKeyDown={(e) => onKey(e, i)}>
              {t.t}{t.id === "mentor" && dot && <span className="new" aria-label="new reply" />}
            </button>
          ))}
        </div>
        <div className="ws">
          <nav className={`pane rail${tab === "steps" ? " on" : ""}`} id="p-steps" role="tabpanel" aria-labelledby="tab-steps" aria-label={railLabel}>{rail}</nav>
          <main className={`pane step${tab === "step" ? " on" : ""}`} id="p-step" role="tabpanel" aria-labelledby="tab-step">{main}</main>
          <aside className={`pane mentor${tab === "mentor" ? " on" : ""}`} id="p-mentor" role="tabpanel" aria-labelledby="tab-mentor">{mentor}</aside>
        </div>
      </div>
      {msg && <div className="toast" role="status">{msg}</div>}
    </Ctx.Provider>
  );
}
