"use client";

// The Start dialog, the Start buttons and the choice line beside them. Ported from design/overview.html.
// Submitting creates the enrollment through POST /api/start and opens the project home.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Level = "guided" | "standard" | "independent";
const LEVELS: { v: Level; t: string; d: string }[] = [
  { v: "guided", t: "Guided", d: "Primer first, hints offered sooner, explaining back in parts." },
  { v: "standard", t: "Standard", d: "A hint is offered when a step runs long." },
  { v: "independent", t: "Independent", d: "Hints only when you ask." },
];
const LANGS: { v: string; t: string }[] = [
  { v: "", t: "Ideas only" }, { v: "Java", t: "Java" }, { v: "Python", t: "Python" }, { v: "JavaScript", t: "JavaScript" }, { v: "Go", t: "Go" }, { v: "other", t: "Another" },
];
const levelName = (l: Level) => LEVELS.find((x) => x.v === l)!.t;

export interface Enrolled { supportLevel: Level; language: string | null }

interface Ctx {
  slug: string; short: string; enrolled: Enrolled | null;
  level: Level; lang: string; other: string;
  open: (e: React.MouseEvent<HTMLElement>) => void;
}
const StartCtx = createContext<Ctx | null>(null);
const useStart = () => useContext(StartCtx)!;

function initialLang(language: string | null): { lang: string; other: string } {
  if (!language) return { lang: "", other: "" };
  const hit = LANGS.find((l) => l.v && l.v !== "other" && l.v.toLowerCase() === language.toLowerCase());
  return hit ? { lang: hit.v, other: "" } : { lang: "other", other: language[0].toUpperCase() + language.slice(1) };
}

export function StartProvider({ slug, short, enrolled, known, ideas, children }: {
  slug: string; short: string; enrolled: Enrolled | null; known: number; ideas: number; children: React.ReactNode;
}) {
  const router = useRouter();
  const init = initialLang(enrolled?.language ?? null);
  const [level, setLevel] = useState<Level>(enrolled?.supportLevel ?? "standard");
  const [lang, setLang] = useState(init.lang);
  const [other, setOther] = useState(init.other);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isOpen, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const otherRef = useRef<HTMLInputElement>(null);

  const open = useCallback((e: React.MouseEvent<HTMLElement>) => { opener.current = e.currentTarget; setError(null); setOpen(true); }, []);
  const close = useCallback((back: boolean) => { setOpen(false); if (back) opener.current?.focus(); }, []);

  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add("locked");
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const box = formRef.current;
      if (!box) return;
      if (e.key === "Escape") { close(true); return; }
      if (e.key === "Tab") {
        const f = Array.from(box.querySelectorAll<HTMLElement>("a[href], button, input, summary")).filter((x) => x.offsetParent !== null && !x.closest("[hidden]"));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("locked"); document.removeEventListener("keydown", onKey); };
  }, [isOpen, close]);

  const pickLang = (v: string) => {
    setLang(v);
    if (v === "other") setTimeout(() => otherRef.current?.focus(), 0);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    const language = lang === "other" ? other.trim() || null : lang || null;
    try {
      const res = await fetch("/api/start", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, supportLevel: level, language, framework: null, name: name.trim(), email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.next) { setError(data.error || "Could not start the project. Please try again."); setBusy(false); return; }
      router.push(data.next);
    } catch {
      setError("Could not reach ThinkAloud. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <StartCtx.Provider value={{ slug, short, enrolled, level, lang, other, open }}>
      {children}
      <div className={isOpen ? "dlg opening" : "dlg"} hidden={!isOpen}>
        <div className="scrim" onClick={() => close(true)} />
        <form className="start" ref={formRef} role="dialog" aria-modal="true" aria-labelledby="start-h" onSubmit={submit}>
          <div className="start-head">
            <h2 id="start-h">{enrolled ? `Continue ${short}` : `Start ${short}`}</h2>
            <button type="button" className="icon-btn" ref={closeRef} aria-label="Close" onClick={() => close(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>Close
            </button>
          </div>
          <div className="start-body">
            <fieldset className="field">
              <legend className="label">How much support</legend>
              <div className="levels">
                {LEVELS.map((l) => (
                  <label className="opt" key={l.v}>
                    <input type="radio" name="level" value={l.v} checked={level === l.v} onChange={() => setLevel(l.v)} />
                    <b>{l.t}</b><span>{l.d}</span>
                  </label>
                ))}
              </div>
              <p className="fine note">Change it any time. Done means the same at every level.</p>
            </fieldset>
            <fieldset className="field">
              <legend className="label">Language <span>(optional)</span></legend>
              <div className="langs">
                {LANGS.map((l) => (
                  <label key={l.v || "none"}>
                    <input type="radio" name="lang" value={l.v} checked={lang === l.v} onChange={() => pickLang(l.v)} /><span>{l.t}</span>
                  </label>
                ))}
              </div>
              <input className="text-in" type="text" ref={otherRef} placeholder="Rust" aria-label="Your language" hidden={lang !== "other"} value={other} onChange={(e) => setOther(e.target.value)} />
              <p className="fine note">{lang ? "Adds a build task to each step and an optional repo check. Steps still finish on your explanations." : "Explain every idea without writing code. You can add a language later."}</p>
            </fieldset>
            <div className="field">
              <details className="save">
                <summary>Save your progress <span className="fine">optional</span></summary>
                <label htmlFor="nm">Name<input className="text-in" type="text" id="nm" autoComplete="name" placeholder="Asha" value={name} onChange={(e) => setName(e.target.value)} /></label>
                <label htmlFor="em">Email<input className="text-in" type="email" id="em" autoComplete="email" placeholder="asha@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                <p className="fine note">Leave both empty to start as a guest. Your progress stays in this browser.</p>
              </details>
            </div>
          </div>
          <div className="start-foot">
            {known > 0 && <p className="fine known"><span className="sq" />{known} of its {ideas} ideas already explained</p>}
            {error && <p className="fine err" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Starting…" : enrolled ? "Save and continue" : `Start ${short}`}</button>
          </div>
        </form>
      </div>
    </StartCtx.Provider>
  );
}

/** The primary button: Start opens the dialog; an enrolled learner gets Continue to the project home. */
export function StartButton() {
  const { slug, short, enrolled, open } = useStart();
  if (enrolled) return <Link className="btn btn-primary" href={`/projects/${slug}/home`}>Continue</Link>;
  return <button type="button" className="btn btn-primary" onClick={open}>Start {short}</button>;
}

/** "Ideas only · Standard support · Change", from the dialog's current choices. */
export function ChoiceLine() {
  const { level, lang, other, open } = useStart();
  const lg = lang === "other" ? other.trim() || "Another language" : lang || "Ideas only";
  return (
    <p className="choice"><b>{lg}</b> · <b>{levelName(level)}</b> support · <button type="button" className="linkbtn" onClick={open}>Change</button></p>
  );
}
