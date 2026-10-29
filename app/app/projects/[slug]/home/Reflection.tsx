"use client";
// The closing reflection, ungraded. Submitting it with every milestone understood completes the project.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client/useRun";
import AnswerBox from "@/ws/AnswerBox";

export default function Reflection({ slug }: { slug: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const send = async () => {
    const body = draft.trim();
    if (!body) { setMsg("Say or type a few sentences first."); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await post<{ ok: boolean; understood: boolean }>("/api/reflection", { slug, body });
      if (r.understood) router.refresh();
      else setMsg("Saved. The project completes when every milestone is understood.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="reflect">
      <AnswerBox id="reflection" label="Your reflection" value={draft} onChange={setDraft} onSubmit={send}
        placeholder="What did you learn, and where else would you use it?" busy={busy}
        actions={<button type="button" className="btn btn-primary" onClick={send} disabled={busy}>Send my reflection</button>} />
      {msg && <p className="err">{msg}</p>}
    </div>
  );
}
