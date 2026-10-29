"use client";
// A mentor diagram: Mermaid source from a trace line, drawn in the browser with securityLevel "strict" and a
// theme that follows light or dark (the saved choice on <html>, else the OS).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

function isDark() {
  const t = document.documentElement.getAttribute("data-theme");
  return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => { mq.removeEventListener("change", cb); mo.disconnect(); };
}

let seq = 0;

export default function Diagram({ code, caption }: { code: string; caption?: string }) {
  const dark = useSyncExternalStore(subscribe, isDark, () => null);
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (dark === null) return;
    let alive = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "neutral", fontFamily: "IBM Plex Mono, ui-monospace, monospace" });
        const { svg } = await mermaid.render(`ta-mm-${++seq}`, code);
        if (alive && ref.current) { ref.current.innerHTML = svg; setFailed(false); }
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, [code, dark]);

  return (
    <figure className="diagram">
      {failed ? <pre className="fine">{code}</pre> : <div ref={ref} className="mm" role="img" aria-label={caption || "Diagram from the mentor"} />}
      {caption && <figcaption className="fine">{caption}</figcaption>}
    </figure>
  );
}
