import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentLearnerId } from "@/lib/learner";
import { stepView } from "@/lib/views";
import { shortName } from "@/lib/catalogue";
import Workspace from "@/ws/Workspace";
import Rail from "@/ws/Rail";
import StepPane from "@/ws/StepPane";
import MentorPanel from "@/ws/MentorPanel";
import BuildStep from "@/ws/BuildStep";
import { one } from "@/lib/db";
import { stepV3Extras } from "@/lib/views3";
import { languageLayer } from "@/lib/views";
import { ContextBar, WsFooter, WsHeader } from "../../../WsFrame";
import "../../../../workspace.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Step · ThinkAloud" };

export default async function StepPage({ params }: { params: Promise<{ slug: string; m: string; s: string }> }) {
  const { slug, m, s } = await params;
  const mi = Number(m), si = Number(s);
  const learner = await currentLearnerId();
  const data = learner && Number.isInteger(mi) && Number.isInteger(si) ? await stepView(learner, slug, mi, si) : null;
  if (!data) redirect(`/projects/${slug}`);
  const short = shortName(slug, data.project.title);
  // Format 3: a build step with one outcome, tagged with the concepts it uses.
  const ch = await one<{ id: string; content_format: number }>(`select id, content_format from challenge where slug = $1`, [slug]);
  let build: React.ReactNode = null;
  if (ch && ch.content_format >= 3) {
    const x = await stepV3Extras(ch.id, data.step.id, learner!);
    build = (
      <BuildStep d={{
        slug, stepId: data.step.id, milestone: data.milestone, step: { position: data.step.position, title: data.step.title, estMinutes: data.step.estMinutes, status: data.step.status },
        build: x.build, outcome: x.outcome, concepts: x.concepts, hints: x.hints, hasLanguage: !!data.enrollment.language,
        language: await languageLayer(data.enrollment.id, data.enrollment.language, data.enrollment.framework, x.concepts.map((c) => c.id)),
        next: data.next,
      }} />
    );
  }

  return (
    <div className="pg-ws">
      <WsHeader />
      <ContextBar slug={slug} short={short} milestone={data.milestone} last={build ? `Build step ${data.step.position}` : `Step ${data.step.position}`} level={data.enrollment.supportLevel} language={data.enrollment.language} />
      <Workspace
        key={data.step.id}
        railLabel={`Steps in ${short}`}
        rail={<Rail slug={slug} short={short} title={data.project.title} milestones={data.milestones} current={{ m: mi, s: si }} milestone={mi}
          ideas={data.concepts.map((c) => ({ id: c.id, name: c.name, brief: c.brief, status: c.status }))} helpLevel={data.step.helpLevel} />}
        main={<>{build ?? <StepPane data={data} />}<WsFooter slug={slug} short={short} sourceUrl={data.project.sourceUrl} /></>}
        mentor={<MentorPanel stepId={data.step.id} mentor={data.mentor} />}
      />
    </div>
  );
}
