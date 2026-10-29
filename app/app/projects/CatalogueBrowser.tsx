"use client";

// Search, the area menu, the learning paths and the empty state. Ported from design/catalogue.html.
import { useMemo, useRef, useState } from "react";
import ProjectCard, { type CardProject } from "@/components/ProjectCard";

interface Project extends CardProject { areas: string[]; hay: string }
interface Path { t: string; shared: string[]; slugs: string[] }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();

export default function CatalogueBrowser({ projects, paths, areas }: { projects: Project[]; paths: Path[]; areas: { slug: string; name: string }[] }) {
  const [q, setQ] = useState("");
  const [area, setArea] = useState("all");
  const qRef = useRef<HTMLInputElement>(null);
  const bySlug = useMemo(() => new Map(projects.map((p) => [p.slug, { ...p, hay: norm(p.hay) }])), [projects]);
  const total = projects.length;
  const counts = useMemo(() => areas.map((a) => ({ ...a, n: projects.filter((p) => p.areas.includes(a.slug)).length })).filter((a) => a.n > 0), [areas, projects]);

  const term = norm(q);
  const ok = (p: Project) => (area === "all" || p.areas.includes(area)) && (!term || term.split(" ").every((w) => p.hay.includes(w)));
  const groups = paths.map((g) => {
    const list = g.slugs.map((s) => bySlug.get(s)!).filter(Boolean);
    return { ...g, list, vis: list.filter(ok).length };
  });
  const shown = groups.reduce((a, g) => a + g.vis, 0);

  return (
    <>
      <section className="tools" aria-label="Find a project">
        <div className="search" role="search">
          <label className="sr" htmlFor="q">Search projects</label>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input type="search" id="q" ref={qRef} placeholder="Search by tool or idea, like sockets" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="clear" aria-label="Clear search" hidden={!q} onClick={() => { setQ(""); qRef.current?.focus(); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="pick">
          <label className="sr" htmlFor="area">Concept area</label>
          <select id="area" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="all">All areas ({total})</option>
            {counts.map((a) => <option key={a.slug} value={a.slug}>{a.name} ({a.n})</option>)}
          </select>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </div>
        <p className="fine count" role="status">{shown === total ? `${total} projects` : shown === 0 ? "No projects match" : `${shown} of ${total} projects`}</p>
      </section>

      <div>
        {groups.map((g, gi) => (
          <section key={g.t} className="path" aria-labelledby={`path-${gi}`} hidden={g.vis === 0}>
            <div className="path-head">
              <h2 id={`path-${gi}`}>{g.t}</h2>
              <p className="label">{g.vis === g.list.length ? `${g.vis} projects` : `${g.vis} of ${g.list.length} projects`}</p>
              {g.shared.length > 0 && <p className="fine shared">Shared ideas: {g.shared.join(" · ")}</p>}
            </div>
            <div className="proj-grid">
              {g.list.map((p) => <ProjectCard key={p.slug} p={p} hidden={!ok(p)} />)}
            </div>
          </section>
        ))}
      </div>
      <div className="empty" hidden={shown !== 0}>
        <h2>No project matches that yet</h2>
        <p>Try a tool name like grep, or an idea like hashing. Coding Challenges has 109 challenges, and you can build any of them on your own.</p>
        <div className="row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQ(""); setArea("all"); }}>Show all projects</button>
          <a className="btn btn-ghost btn-sm" href="https://codingchallenges.fyi/challenges/intro">Search Coding Challenges ↗</a>
        </div>
      </div>
    </>
  );
}
