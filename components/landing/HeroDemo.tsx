"use client";

// The landing's self-playing demo: ask, speak, check, mentor. Loops only while visible, has Pause,
// and stays on its finished state when reduced motion is on.
import { useEffect, useRef } from "react";

const Tick = () => (
  <span className="tick"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg></span>
);

class Cancelled extends Error {}

export default function HeroDemo() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const demo = ref.current!;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let alive = true;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const $ = <T extends Element = HTMLElement>(s: string) => demo.querySelector<T & HTMLElement>(s)!;
    const $$ = (s: string) => Array.from(demo.querySelectorAll<HTMLElement>(s));
    const stages = $$(".stages li"), spoken = $$(".spoken > span"), marks = $$(".spoken mark"), points = $$(".points li");
    const trace = $(".trace"), reply = $(".reply"), concept = $(".concept"), cstate = $(".concept b"), ctrl = $<HTMLButtonElement>(".ctrl");
    const dWave = $$(".who .wave i");
    const traceFull = trace.textContent ?? "";
    let paused = false, visible = true, speaking = false;

    const driveWave = (bars: HTMLElement[], max: number, on: boolean) => bars.forEach((b, i) => {
      b.style.height = on ? 4 + Math.round(Math.abs(Math.sin(Date.now() / 140 + i * 0.9)) * (max - 4) * (0.45 + Math.random() * 0.55)) + "px" : "4px";
    });
    const stage = (s: string) => stages.forEach((li) => li.classList.toggle("on", li.dataset.s === s));
    const reset = () => {
      spoken.forEach((s) => s.classList.add("pending")); marks.forEach((m) => m.classList.remove("lit"));
      points.forEach((p) => { p.classList.add("pending"); p.classList.remove("met"); });
      trace.textContent = ""; reply.classList.add("pending"); concept.classList.remove("done"); cstate.textContent = "seen";
    };
    const wait = async (ms: number) => { let t = 0; while (t < ms) { await sleep(100); if (!alive) throw new Cancelled(); if (!paused && visible) t += 100; } };
    const loop = async () => {
      while (alive) {
        reset(); stage("ask"); await wait(1600);
        stage("speak"); speaking = true;
        for (let i = 0; i < spoken.length; i++) { spoken[i].classList.remove("pending"); await wait(520); }
        speaking = false; await wait(500);
        stage("check");
        for (let p = 1; p <= 3; p++) {
          await wait(650); points[p - 1].classList.remove("pending"); points[p - 1].classList.add("met");
          $$(`.spoken mark[data-p="${p}"]`).forEach((m) => m.classList.add("lit"));
        }
        await wait(600); stage("mentor");
        const parts = traceFull.split(" → ");
        for (let k = 0; k < parts.length; k++) { trace.textContent = parts.slice(0, k + 1).join(" → "); await wait(550); }
        reply.classList.remove("pending"); await wait(700);
        concept.classList.add("done"); cstate.textContent = "explained";
        await wait(5200);
      }
    };

    const iv = setInterval(() => driveWave(dWave, 16, speaking && !paused && visible), 110);
    let io: IntersectionObserver | undefined;
    const onCtrl = () => { paused = !paused; ctrl.textContent = paused ? "Play" : "Pause"; };
    if (reduce) { stage("mentor"); ctrl.hidden = true; }
    else {
      loop().catch((e) => { if (!(e instanceof Cancelled)) throw e; });
      ctrl.addEventListener("click", onCtrl);
      if ("IntersectionObserver" in window) { io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; }); io.observe(demo); }
    }
    return () => { alive = false; clearInterval(iv); io?.disconnect(); ctrl.removeEventListener("click", onCtrl); };
  }, []);

  return (
    <div className="demo" id="demo" ref={ref} aria-label="Example: a learner explains an idea out loud and gets it checked">
      <div className="demo-head">
        <p className="label"><b>wc</b> · explain it back</p>
        <ol className="stages" aria-hidden="true">
          <li data-s="ask">Ask</li><li data-s="speak">Speak</li><li data-s="check">Check</li><li data-s="mentor">Mentor</li>
        </ol>
      </div>
      <div className="tx">
        <span className="ts">00:00</span>
        <div className="turn">
          <p className="who">Prompt</p>
          <p className="q">Your wc has to count a 10 GB log on a laptop with 8 GB of memory. Why not load the whole file first, and how does your loop keep memory flat?</p>
        </div>
        <span className="ts">00:09</span>
        <div className="turn">
          <p className="who">You · speaking <span className="wave" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span></p>
          <p className="spoken"><span><mark data-p="1">Loading it all would need 10 GB,</mark></span> <span>more than the laptop has, so it would crash or start swapping.</span> <span>So I read a chunk, say 8 KB, into one buffer,</span> <span>count it,</span> <span>and <mark data-p="2">reuse the same buffer for the next chunk.</mark></span> <span><mark data-p="3">Memory stays about 8 KB</mark></span> <span><mark data-p="3">whether the file is 1 MB or 10 GB.</mark></span></p>
        </div>
        <span className="ts">00:41</span>
        <div className="turn">
          <p className="who">Check · 3 points</p>
          <ul className="points">
            <li data-p="1" className="met"><Tick />Loading the whole file needs as much memory as the file</li>
            <li data-p="2" className="met"><Tick />One buffer is reused for every chunk</li>
            <li data-p="3" className="met"><Tick />Memory stays flat, whatever the file size</li>
          </ul>
        </div>
        <span className="ts">00:43</span>
        <div className="turn">
          <p className="who">Mentor</p>
          <p className="trace">read your answer → checked 3 of 3 points → looked ahead to milestone 3</p>
          <p className="reply">Spot on. Here&apos;s what goes wrong with fixed chunks: é takes 2 bytes. What happens when a chunk ends between them?</p>
        </div>
      </div>
      <div className="demo-foot">
        <span className="concept done"><i></i>Streaming in constant memory · <b>explained</b></span>
        <button type="button" className="ctrl">Pause</button>
      </div>
    </div>
  );
}
