"use client";
// "This grade looks wrong": the missed points as checkboxes, an optional reason, then POST /api/answers/{id}/dispute.
// Focus goes to Close on open, stays inside, and returns to the link. A bottom sheet below 640px (CSS).
import { useEffect, useRef, useState } from "react";
import { post } from "@/lib/client/useRun";

export function DisputeLink({ answerId, missed, disputed, onToast }: { answerId: string; missed: string[]; disputed: boolean; onToast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(disputed);
  const opener = useRef<HTMLButtonElement>(null);
  if (sent) return <span className="fine flagged">Grade flagged for review</span>;
  return (
    <>
      <button type="button" className="linkbtn" ref={opener} onClick={() => setOpen(true)}>This grade looks wrong</button>
      {open && (
        <DisputeDialog answerId={answerId} missed={missed}
          onClose={(done) => { setOpen(false); if (done) { setSent(true); onToast("Sent. A person will look at this grade."); } else opener.current?.focus(); }}
          onError={onToast} />
      )}
    </>
  );
}

function DisputeDialog({ answerId, missed, onClose, onError }: { answerId: string; missed: string[]; onClose: (sent: boolean) => void; onError: (m: string) => void }) {
  const [picked, setPicked] = useState<boolean[]>(missed.map(() => false));
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLFormElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const done = useRef(onClose);
  done.current = onClose;

  useEffect(() => {
    document.body.classList.add("locked");
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { done.current(false); return; }
      if (e.key !== "Tab" || !box.current) return;
      const f = Array.from(box.current.querySelectorAll<HTMLElement>("a[href], button, input, textarea")).filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("locked"); document.removeEventListener("keydown", onKey); };
  }, []);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const points = missed.filter((_, i) => picked[i]);
    const note = [points.length ? `Covers: ${points.join(" | ")}` : "", why.trim()].filter(Boolean).join("\n\n");
    setBusy(true);
    try {
      await post(`/api/answers/${answerId}/dispute`, { note });
      onClose(true);
    } catch (err) {
      onError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="dlg">
      <div className="scrim" onClick={() => onClose(false)} />
      <form className="box" ref={box} role="dialog" aria-modal="true" aria-labelledby="flag-h" onSubmit={send}>
        <div className="box-h">
          <h2 id="flag-h">This grade looks wrong</h2>
          <button type="button" className="icon-btn" ref={close} aria-label="Close" onClick={() => onClose(false)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>Close
          </button>
        </div>
        <div className="box-b">
          {missed.length ? (
            <>
              <p>Which point do you think your answer covers?</p>
              {missed.map((p, i) => (
                <label key={i}>
                  <input type="checkbox" checked={picked[i]} onChange={(e) => setPicked(picked.map((x, j) => (j === i ? e.target.checked : x)))} />
                  <span>{p}</span>
                </label>
              ))}
            </>
          ) : (
            <p className="fine">No points to pick here. Say what looks wrong below.</p>
          )}
          <label htmlFor="flag-why" style={{ display: "block", padding: "8px 0 0" }} className="fine">Say why, if you like</label>
          <textarea id="flag-why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Which part of my answer covers it" />
          <p className="fine" style={{ marginTop: 10 }}>It&apos;s logged and a person reviews it. Your grade doesn&apos;t change on its own.</p>
        </div>
        <div className="box-f">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onClose(false)}>Cancel</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Send</button>
        </div>
      </form>
    </div>
  );
}
