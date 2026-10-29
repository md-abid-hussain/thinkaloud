"use client";
// Pick or change the language (and optional framework). Picking one starts the language notes:
// the classes and APIs for each idea, prepared from the official docs in the background.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client/useRun";

const SUGGESTED = ["java", "python", "javascript", "typescript", "go", "rust", "c#", "c++", "kotlin"];

export default function LanguagePick({ slug, language, framework }: { slug: string; language: string | null; framework: string | null }) {
  const router = useRouter();
  const [lang, setLang] = useState(language ?? "");
  const [fw, setFw] = useState(framework ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (l: string, f: string) => {
    setBusy(true); setMsg(null);
    try {
      const r = await post<{ runId: string | null; docs: boolean; language: string | null }>(`/api/enrollments/${slug}/language`, { language: l || null, framework: f || null });
      setMsg(!r.language ? "Ideas only. Pick a language any time." : r.runId ? "Preparing your notes from the official docs. They appear on each step as they're ready." : r.docs ? "Your notes are ready on each step." : "Saved. There's no official-docs list for that language yet, so no notes are generated; the mentor can still search.");
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="langpick" onSubmit={(e) => { e.preventDefault(); save(lang.trim(), fw.trim()); }}>
      <div className="seg" role="group" aria-label="Language">
        <button type="button" aria-pressed={!lang} onClick={() => { setLang(""); save("", ""); }} disabled={busy}>Ideas only</button>
        {SUGGESTED.map((s) => <button key={s} type="button" aria-pressed={lang === s} disabled={busy} onClick={() => { setLang(s); save(s, fw.trim()); }}>{s}</button>)}
      </div>
      <div className="row">
        <label>Another language<input value={SUGGESTED.includes(lang) ? "" : lang} onChange={(e) => setLang(e.target.value)} placeholder="e.g. ruby" /></label>
        <label>Framework (optional)<input value={fw} onChange={(e) => setFw(e.target.value)} placeholder="e.g. spring boot" disabled={!lang} /></label>
        <button className="btn btn-ghost btn-sm" type="submit" disabled={busy}>Save</button>
      </div>
      {msg && <p className="fine" role="status">{msg}</p>}
    </form>
  );
}
