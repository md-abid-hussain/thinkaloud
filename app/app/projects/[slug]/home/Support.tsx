"use client";
// The support level switcher. Changes what is shown and offered by default, never what counts as done.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client/useRun";

const LEVELS = [
  { v: "guided", t: "Guided", d: "Primer first, hints sooner, explaining back in parts." },
  { v: "standard", t: "Standard", d: "A hint is offered after a wrong try." },
  { v: "independent", t: "Independent", d: "Hints only when you ask." },
] as const;

export default function Support({ slug, level }: { slug: string; level: string }) {
  const router = useRouter();
  const [cur, setCur] = useState(level);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const choose = async (v: string) => {
    if (v === cur || busy) return;
    setBusy(true); setErr(null);
    const was = cur;
    setCur(v);
    try {
      await post(`/api/enrollments/${slug}/support`, { level: v });
      router.refresh();
    } catch (e) {
      setCur(was);
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="support">
      <div className="seg" role="group" aria-label="Support level">
        {LEVELS.map((l) => <button key={l.v} type="button" aria-pressed={cur === l.v} onClick={() => choose(l.v)}>{l.t}</button>)}
      </div>
      <p className="fine">{LEVELS.find((l) => l.v === cur)?.d} Every level can ask for any help.</p>
      {err && <p className="err">{err}</p>}
    </div>
  );
}
