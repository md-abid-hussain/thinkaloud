"use client";

// "How it works": four chapters beside a sticky screen. The active chapter is the last one whose top
// has passed a fixed line: the header height + 28px + a quarter of the viewport. Ported from design/landing.html.
import { useEffect, useRef, useState } from "react";

const SCREENS: { head: [string, string]; body: React.ReactNode }[] = [
  { head: ["wc", "primer"], body: (<>
    <div><p className="mini-h">What it is</p><p className="mini">A tool that counts the lines, words, bytes and characters in a file, or in text piped from another program.</p></div>
    <div><p className="mini-h">A tiny example</p><p className="mini">&quot;hi there&quot; plus a newline is 1 line, 2 words and 9 bytes.</p></div>
    <div><p className="mini-h">Words you&apos;ll meet</p><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}><span className="pill plain">byte</span><span className="pill plain">character</span><span className="pill plain">stream</span><span className="pill plain">stdin</span></div></div>
  </>) },
  { head: ["wc · step 2", "explain"], body: (<>
    <p className="mini">Your wc reads standard input. It might be 2 KB or 20 GB. How will you process it?</p>
    <div className="ansbox">In a loop: <mark className="ev">read a fixed-size chunk into one buffer</mark>, count it, and read again <mark className="ev">until a read returns nothing</mark>. Memory stays the same for any size.</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}><span className="pill ok">2 of 2 points</span><span className="fine">your words quoted as evidence</span></div>
  </>) },
  { head: ["wc · milestone 1", "explain it back"], body: (<>
    <div className="ansbox">One buffer is <mark className="ev">reused for every chunk</mark>, so <mark className="ev">memory stays the same</mark> for any file, and <mark className="ev">stdin is just another stream</mark>.</div>
    <div className="rows"><div className="rowx"><span className="pill ok">Covered</span>Streaming in constant memory</div><div className="rowx"><span className="pill ok">Covered</span>Stdin vs file</div><div className="rowx"><span className="pill soft">Not yet</span>End of file</div></div>
  </>) },
  { head: ["Your learning", "7 ideas explained"], body: (<>
    <div className="rows">
      <div className="rowx"><span className="dot" style={{ background: "var(--ok)" }} />Streaming in constant memory<span className="fine" style={{ marginLeft: "auto" }}>wc</span></div>
      <div className="rowx"><span className="dot" style={{ background: "var(--ok)" }} />Explicit charsets<span className="fine" style={{ marginLeft: "auto" }}>wc</span></div>
      <div className="rowx"><span className="dot" style={{ background: "var(--ok)" }} />Token bucket<span className="fine" style={{ marginLeft: "auto" }}>Rate Limiter</span></div>
      <div className="rowx"><span className="dot" style={{ background: "var(--muted)" }} />Path safety<span className="fine" style={{ marginLeft: "auto" }}>Web Server</span></div>
    </div>
    <p className="mini" style={{ fontStyle: "italic" }}>&quot;One buffer is reused for every chunk, so memory stays the same.&quot;</p>
    <div><span className="pill plain">Export learning log</span></div>
  </>) },
];

const CHAPTERS = [
  { label: "about 2 minutes", h: "Read the problem in plain words", p: "Every project opens with a short primer: what you're building, why it exists, a tiny worked example, and the terms you'll meet." },
  { label: "10 to 20 minutes a step", h: "Answer each step", p: "Each step asks how you'd approach a piece of the problem, or what a bit of code will do. It's done when your reasoning is right, not when your code compiles." },
  { label: "once per milestone", h: "Explain it back, out loud", p: "Talk the milestone through. Each idea you cover lights up, and your own words are kept as proof you understood it." },
  { label: "always yours", h: "Keep what you learned", p: "Ideas you've explained stay explained in every project that uses them. Export your learning log any time." },
];

function Screen({ i, swap }: { i: number; swap?: boolean }) {
  const s = SCREENS[i];
  return (
    <>
      <div className="screen-head"><span>{s.head[0]}</span><span>{s.head[1]}</span></div>
      <div className={swap ? "screen-body swap" : "screen-body"} key={swap ? `s${i}` : undefined}>{s.body}</div>
    </>
  );
}

export default function HowStory() {
  const [active, setActive] = useState(0);
  const [moved, setMoved] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    let ticking = false;
    const pick = () => {
      ticking = false;
      const top = document.querySelector<HTMLElement>(".top");
      const line = (top?.offsetHeight ?? 64) + 28 + window.innerHeight * 0.25;
      let idx = 0;
      listRef.current?.querySelectorAll<HTMLElement>(".chapter").forEach((c, i) => { if (c.getBoundingClientRect().top <= line) idx = i; });
      setActive((cur) => { if (cur !== idx) setMoved(true); return idx; });
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(pick); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", pick);
    pick();
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", pick); };
  }, []);

  return (
    <div className="story">
      <div className="stage-view" aria-hidden="true"><div className="screen"><Screen i={active} swap={moved} /></div></div>
      <ol className="chapters" ref={listRef}>
        {CHAPTERS.map((c, i) => (
          <li key={i} className={i === active ? "chapter active" : "chapter"} data-c={i}>
            <p className="label"><b>{String(i + 1).padStart(2, "0")}</b> · {c.label}</p>
            <h3>{c.h}</h3>
            <p>{c.p}</p>
            <div className="inline-view" aria-hidden="true"><div className="screen"><Screen i={i} /></div></div>
          </li>
        ))}
      </ol>
    </div>
  );
}
