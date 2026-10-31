"use client";

// "With Wispr Flow": shortcut keys by OS (Mac fn, Windows Ctrl + Win, auto-detected), then the
// hold-to-talk and hands-free demos in turn while the demo is on screen.
import { Fragment, useEffect, useRef, useState } from "react";

type OS = "mac" | "win";
const KEYS: Record<OS, string[]> = { mac: ["fn"], win: ["Ctrl", "Win"] };

function detectOS(): OS {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = ((nav.userAgentData && nav.userAgentData.platform) || navigator.platform || navigator.userAgent || "").toLowerCase();
  return /mac|iphone|ipad/.test(p) ? "mac" : "win";
}

function Keys({ os, dbl }: { os: OS | null; dbl?: boolean }) {
  if (!os) return null;
  return (
    <>
      {KEYS[os].map((k, i) => <Fragment key={k}>{i > 0 && <span>+</span>}<span className="kc">{k}</span></Fragment>)}
      {dbl && <span>twice</span>}
    </>
  );
}

export default function WisprFlow() {
  const [os, setOs] = useState<OS | null>(null);
  const demoRef = useRef<HTMLDivElement>(null);

  // Read after hydration on purpose: the OS is only known in the browser.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setOs(detectOS()); }, []);

  useEffect(() => {
    const demo = demoRef.current!;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const big = Array.from(demo.querySelectorAll<HTMLElement>(".bigwave i"));
    const landed = Array.from(demo.querySelectorAll<HTMLElement>(".ph"));
    const badge = demo.querySelector<HTMLElement>(".mode-badge")!, cap = demo.querySelector<HTMLElement>(".mic-cap")!;
    const mHold = document.getElementById("mode-hold")!, mFree = document.getElementById("mode-free")!;
    let flowOn = false, flowSpeak = false, flowRun = 0, alive = true;
    const driveWave = (bars: HTMLElement[], max: number, on: boolean) => bars.forEach((b, i) => {
      b.style.height = on ? 4 + Math.round(Math.abs(Math.sin(Date.now() / 140 + i * 0.9)) * (max - 4) * (0.45 + Math.random() * 0.55)) + "px" : "4px";
    });
    const iv = setInterval(() => driveWave(big, 34, flowSpeak && flowOn), 110);
    const press = (on: boolean) => demo.querySelectorAll(".keys .kc").forEach((k) => k.classList.toggle("down", on));
    const flowLoop = async (id: number) => {
      let hands = false;
      while (id === flowRun && alive) {
        hands = !hands;
        mHold.classList.toggle("on", !hands); mFree.classList.toggle("on", hands);
        cap.textContent = hands ? "Hands-free: double-tap, talk, tap once to stop" : "Hold to talk: hold the keys, talk, let go";
        landed.forEach((s) => s.classList.add("pending")); badge.textContent = "Idle"; badge.classList.remove("live"); press(false); await sleep(900);
        if (id !== flowRun) return;
        if (hands) { press(true); await sleep(140); press(false); await sleep(140); press(true); await sleep(140); press(false); }
        else press(true);
        badge.textContent = hands ? "Hands-free" : "Listening"; badge.classList.add("live"); flowSpeak = true;
        for (let i = 0; i < landed.length; i++) { await sleep(650); if (id !== flowRun) return; if (hands) landed[i].classList.remove("pending"); }
        await sleep(400); if (id !== flowRun) return;
        flowSpeak = false;
        if (hands) { press(true); await sleep(160); press(false); }
        else { press(false); for (let j = 0; j < landed.length; j++) { landed[j].classList.remove("pending"); await sleep(160); } }
        badge.textContent = "Done"; badge.classList.remove("live");
        await sleep(3200);
      }
    };
    let io: IntersectionObserver | undefined;
    if (!reduce && "IntersectionObserver" in window) {
      io = new IntersectionObserver((es) => {
        const on = es[0].isIntersecting;
        if (on && !flowOn) { flowOn = true; flowRun++; flowLoop(flowRun); }
        else if (!on && flowOn) { flowOn = false; flowRun++; flowSpeak = false; landed.forEach((s) => s.classList.remove("pending")); press(false); }
      });
      io.observe(demo);
    } else { mFree.classList.add("on"); badge.textContent = "Done"; }
    return () => { alive = false; flowRun++; clearInterval(iv); io?.disconnect(); };
  }, []);

  return (
    <section className="band flow" id="flow" aria-labelledby="flow-title">
      <div className="flow-in">
        <div className="sec-split">
          <div>
            <p className="label kick"><b>With Wispr Flow</b></p>
            <h2 className="h2" id="flow-title">Think out loud. Literally.</h2>
          </div>
          <p className="intro">Explain by speaking instead of typing. Wispr Flow turns your voice into clean text in any app, including your answers here.</p>
        </div>
        <div className="flow-body">
          <div className="flow-left">
            <ul className="modes">
              <li id="mode-hold"><h3>Hold to talk</h3><p>Hold the shortcut, explain, let go. The text lands in the chat box.</p><span className="keys"><Keys os={os} /></span></li>
              <li id="mode-free"><h3>Hands-free</h3><p>Double-tap the shortcut and Flow keeps listening until you tap it again.</p><span className="keys"><Keys os={os} dbl /></span></li>
            </ul>
            <div className="os">
              <div className="seg" role="group" aria-label="Show shortcuts for">
                <button type="button" aria-pressed={os === "mac"} onClick={() => setOs("mac")}>Mac</button>
                <button type="button" aria-pressed={os === "win"} onClick={() => setOs("win")}>Windows</button>
              </div>
              <span className="fine">Default shortcut. You can change it in Flow&apos;s settings.</span>
            </div>
            <div className="cta">
              <a className="btn btn-primary" href="https://wisprflow.ai/r?MD13753" rel="sponsored noopener">Get Wispr Flow</a>
              <span className="fine">Referral link: sign up through it for a 30-day free trial of Flow Pro. Flow also has a free plan.</span>
            </div>
          </div>
          <div className="mic-demo" id="mic-demo" ref={demoRef} aria-hidden="true">
            <div className="mic-top">
              <span className="keys" id="demo-keys"><Keys os={os} /></span>
              <span className="bigwave">{Array.from({ length: 26 }, (_, i) => <i key={i} />)}</span>
              <span className="mode-badge">Idle</span>
            </div>
            <div className="field"><span className="lbl">Your answer · URL Shortener, step 2</span><span><span className="ph">A 302 is a temporary redirect,</span> <span className="ph">so the browser asks my server every time.</span> <span className="ph">With a 301 it would remember the target,</span> <span className="ph">and I could never change or delete the link.</span></span></div>
            <p className="mic-cap">Hands-free: double-tap, talk, tap once to stop</p>
          </div>
        </div>
      </div>
    </section>
  );
}
