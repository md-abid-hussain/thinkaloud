// The server-rendered frame around the workspace: header, context bar (crumb and current choices), and the footer
// with the Coding Challenges credit. Shared by the step and the teach-back routes.
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { META } from "@/lib/catalogue";
import { SUPPORT_NAMES } from "@/ws/types";

export function ContextBar({ slug, short, milestone, last, level, language }: {
  slug: string; short: string; milestone: { position: number; title: string }; last: string; level: string; language: string | null;
}) {
  return (
    <div className="ctx">
      <div className="ctx-in">
        <p className="label crumb">
          <Link href={`/projects/${slug}/home`}>{short}</Link><span aria-hidden="true">/</span>
          <span>Milestone {milestone.position} · {milestone.title}</span><span aria-hidden="true">/</span>
          <b>{last}</b>
        </p>
        <p className="mode"><b>{SUPPORT_NAMES[level] ?? level}</b> support · <b>{language ?? "Ideas only"}</b> · <Link className="linkbtn" href={`/projects/${slug}/home#support`}>Change</Link></p>
      </div>
    </div>
  );
}

export function WsFooter({ slug, short, sourceUrl }: { slug: string; short: string; sourceUrl: string }) {
  const n = META[slug]?.n;
  return <Footer left={<>{short} · from <a href={sourceUrl}>Coding Challenges{n ? ` #${n}` : ""} ↗</a> by John Crickett</>} />;
}

export function WsHeader() {
  return <Header variant="inner" current="projects" />;
}
