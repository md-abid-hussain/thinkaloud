"use client";

// "With Wispr Flow": the official Wispr Flow logo and colours (for the hackathon), why speaking fits ThinkAloud, and a
// demo that plays hold-to-talk and hands-free in turn while it is on screen. Flow shows its own shortcuts, so the page
// doesn't.
import Image from "next/image";
import { useEffect, useRef } from "react";

export default function WisprFlow() {
  const demoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const demo = demoRef.current!;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const big = Array.from(demo.querySelectorAll<HTMLElement>(".bigwave i"));
    const landed = Array.from(demo.querySelectorAll<HTMLElement>(".ph"));
    const badge = demo.querySelector<HTMLElement>(".mode-badge")!, cap = demo.querySelector<HTMLElement>(".mic-cap")!;
    let flowOn = false, flowSpeak = false, flowRun = 0, alive = true;
    const driveWave = (bars: HTMLElement[], max: number, on: boolean) => bars.forEach((b, i) => {
      b.style.height = on ? 4 + Math.round(Math.abs(Math.sin(Date.now() / 140 + i * 0.9)) * (max - 4) * (0.45 + Math.random() * 0.55)) + "px" : "4px";
    });
    const iv = setInterval(() => driveWave(big, 34, flowSpeak && flowOn), 110);
    const flowLoop = async (id: number) => {
      let hands = false;
      while (id === flowRun && alive) {
        hands = !hands;
        cap.textContent = hands ? "Hands-free: words land as you speak" : "Hold to talk: words land when you let go";
        landed.forEach((s) => s.classList.add("pending")); badge.textContent = "Idle"; badge.classList.remove("live"); await sleep(900);
        if (id !== flowRun) return;
        badge.textContent = hands ? "Hands-free" : "Listening"; badge.classList.add("live"); flowSpeak = true;
        for (let i = 0; i < landed.length; i++) { await sleep(650); if (id !== flowRun) return; if (hands) landed[i].classList.remove("pending"); }
        await sleep(400); if (id !== flowRun) return;
        flowSpeak = false;
        if (!hands) for (let j = 0; j < landed.length; j++) { landed[j].classList.remove("pending"); await sleep(160); }
        badge.textContent = "Done"; badge.classList.remove("live");
        await sleep(3200);
      }
    };
    let io: IntersectionObserver | undefined;
    if (!reduce && "IntersectionObserver" in window) {
      io = new IntersectionObserver((es) => {
        const on = es[0].isIntersecting;
        if (on && !flowOn) { flowOn = true; flowRun++; flowLoop(flowRun); }
        else if (!on && flowOn) { flowOn = false; flowRun++; flowSpeak = false; landed.forEach((s) => s.classList.remove("pending")); }
      });
      io.observe(demo);
    } else { badge.textContent = "Done"; }
    return () => { alive = false; flowRun++; clearInterval(iv); io?.disconnect(); };
  }, []);

  return (
    <section className="band flow" id="flow" aria-labelledby="flow-title">
      <div className="flow-in">
        <div className="sec-split">
          <div>
            <p className="label kick flow-brand">
              <b>With</b>
              {/* Both load at once (they're small), so switching theme never shows a gap while the other one loads. */}
              <Image className="wf-logo wf-logo-dark" src="/brand/wispr-flow-logo-dark.svg" alt="Wispr Flow" width={807} height={131} loading="eager" unoptimized />
              <Image className="wf-logo wf-logo-light" src="/brand/wispr-flow-logo-light.png" alt="Wispr Flow" width={2420} height={391} loading="eager" unoptimized />
            </p>
            <h2 className="h2" id="flow-title">Think out loud. Literally.</h2>
          </div>
          <p className="intro">Explain by speaking instead of typing. Wispr Flow turns your voice into clean text in any app, including your answers here.</p>
        </div>
        <div className="flow-body">
          <div className="flow-left">
            <ul className="flow-why">
              <li>Explaining out loud is the quickest way to find a gap in what you know.</li>
              <li>Speaking is faster than typing, so you explain the whole idea, not a short version.</li>
              <li>Flow cleans up the pauses and restarts, so the mentor reads what you meant.</li>
            </ul>
            <div className="cta">
              <a className="btn btn-primary" href="https://wisprflow.ai/r?MD13753" rel="sponsored noopener">Get Wispr Flow</a>
              <span className="fine">Referral link: sign up through it for a 30-day free trial of Flow Pro. Flow also has a free plan.</span>
            </div>
          </div>
          <div className="mic-demo" id="mic-demo" ref={demoRef} aria-hidden="true">
            <div className="mic-top">
              <span className="bigwave">{Array.from({ length: 26 }, (_, i) => <i key={i} />)}</span>
              <span className="mode-badge">Idle</span>
            </div>
            <div className="field"><span className="lbl">Your answer · URL Shortener, step 2</span><span><span className="ph">A 302 is a temporary redirect,</span> <span className="ph">so the browser asks my server every time.</span> <span className="ph">With a 301 it would remember the target,</span> <span className="ph">and I could never change or delete the link.</span></span></div>
            <p className="mic-cap">Hands-free: words land as you speak</p>
          </div>
        </div>
      </div>
    </section>
  );
}
