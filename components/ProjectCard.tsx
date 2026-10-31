import Link from "next/link";
import "./project-card.css";

export interface CardProject {
  slug: string;
  n: number;
  short: string;
  summary: string;
  figure: string; // SVG body from figureSvg()
  learn: string;
  checked: boolean;
  going?: { milestone: number; done: number; total: number };
  mine?: number;
}

export default function ProjectCard({ p, hidden }: { p: CardProject; hidden?: boolean }) {
  return (
    <article className="card" hidden={hidden}>
      <div className="card-top">
        <span>Challenge #{p.n}</span>
        <span className={p.checked ? "checked" : undefined}>{p.checked ? "Checked" : "Not yet checked"}</span>
      </div>
      {p.figure && (
        <div className="card-fig">
          <svg viewBox="0 0 280 112" role="img" aria-label={`${p.short} figure`} dangerouslySetInnerHTML={{ __html: p.figure }} />
        </div>
      )}
      <div className="card-body">
        <h3><Link href={`/projects/${p.slug}`}>{p.short}</Link></h3>
        <p>{p.summary}</p>
        {p.learn && <p className="learn">You&apos;ll learn <b>{p.learn}</b></p>}
        {p.going && (
          <p className="mine going">
            Milestone {p.going.milestone} · {p.going.done} of {p.going.total} steps
            <span className="progress" aria-hidden="true">
              {Array.from({ length: p.going.total }, (_, i) => <span key={i} className={i < p.going!.done ? "on" : undefined} />)}
            </span>
          </p>
        )}
        {!p.going && p.mine ? (
          <p className="mine"><span className="dot" />{p.mine} {p.mine === 1 ? "idea" : "ideas"} already explained</p>
        ) : null}
      </div>
    </article>
  );
}
