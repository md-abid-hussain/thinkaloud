"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client/useRun";

const LEVELS = [
  ["guided", "Guided"],
  ["standard", "Standard"],
  ["independent", "Independent"],
] as const;

export default function SettingsForms({ me, projects }: { me: { display_name: string | null; email: string | null } | null; projects: { slug: string; title: string; support_level: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);

  if (!me) {
    return (
      <div className="empty">
        <h2>Nothing saved yet</h2>
        <p>Start a project and your settings will appear here.</p>
        <Link className="btn btn-primary" href="/projects">Browse projects</Link>
      </div>
    );
  }

  return (
    <>
      <section className="sec" aria-labelledby="save-h">
        <div className="sec-h"><p className="label">Optional</p><h2 id="save-h">Save your progress</h2></div>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              await post("/api/me", { name: f.get("name"), email: f.get("email") });
              setMsg({ ok: true, text: "Saved." });
              router.refresh();
            } catch (err) {
              setMsg({ ok: false, text: (err as Error).message });
            }
          }}
        >
          <label>Name<input name="name" defaultValue={me.display_name ?? ""} autoComplete="name" /></label>
          <label>Email<input name="email" type="email" defaultValue={me.email ?? ""} autoComplete="email" /></label>
          <div className="actions" style={{ marginTop: 0 }}><button className="btn btn-primary" type="submit">Save</button>{msg ? <p className={`msg${msg.ok ? "" : " err"}`} role="status">{msg.text}</p> : null}</div>
        </form>
      </section>

      {projects.length ? (
        <section className="sec" aria-labelledby="sup-h">
          <div className="sec-h"><p className="label">Per project</p><h2 id="sup-h">Support level</h2></div>
          <p className="fine" style={{ marginBottom: 14 }}>It changes what's shown first, never what counts as done.</p>
          <div className="form">
            {projects.map((p) => (
              <label key={p.slug}>
                {p.title}
                <select
                  defaultValue={p.support_level}
                  onChange={async (e) => {
                    await post(`/api/enrollments/${p.slug}/support`, { level: e.target.value }).catch(() => {});
                    router.refresh();
                  }}
                >
                  {LEVELS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <section className="sec" aria-labelledby="data-h">
        <div className="sec-h"><p className="label">Your data</p><h2 id="data-h">Export or delete</h2></div>
        <div className="actions" style={{ marginTop: 0, marginBottom: 20 }}>
          <a className="btn btn-ghost" href="/api/export?format=md">Export learning log</a>
          <a className="btn btn-ghost" href="/api/export?format=json">Download all data (JSON)</a>
        </div>
        <div className="danger">
          <p style={{ margin: 0 }}>Delete everything: your answers, progress, help log and mentor notes. This can't be undone.</p>
          {confirm ? (
            <div className="actions" style={{ marginTop: 0 }}>
              <button
                className="btn btn-primary"
                type="button"
                onClick={async () => {
                  await post("/api/me/delete").catch(() => {});
                  router.push("/");
                  router.refresh();
                }}
              >
                Delete my data
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setConfirm(false)}>Keep it</button>
            </div>
          ) : (
            <button className="btn btn-ghost" type="button" onClick={() => setConfirm(true)}>Delete my data</button>
          )}
        </div>
      </section>
    </>
  );
}
