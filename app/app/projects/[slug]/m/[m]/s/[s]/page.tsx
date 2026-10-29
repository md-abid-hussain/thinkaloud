import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentLearnerId } from "@/lib/learner";
import { stepView } from "@/lib/views";
import { shortName } from "@/lib/catalogue";
import Workspace from "@/ws/Workspace";
import Rail from "@/ws/Rail";
import StepPane from "@/ws/StepPane";
import MentorPanel from "@/ws/MentorPanel";
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

  return (
    <div className="pg-ws">
      <WsHeader />
      <ContextBar slug={slug} short={short} milestone={data.milestone} last={`Step ${data.step.position}`} level={data.enrollment.supportLevel} language={data.enrollment.language} />
      <Workspace
        key={data.step.id}
        railLabel={`Steps in ${short}`}
        rail={<Rail slug={slug} short={short} title={data.project.title} milestones={data.milestones} current={{ m: mi, s: si }} milestone={mi}
          ideas={data.concepts.map((c) => ({ id: c.id, name: c.name, brief: c.brief, status: c.status }))} helpLevel={data.step.helpLevel} />}
        main={<><StepPane data={data} /><WsFooter slug={slug} short={short} sourceUrl={data.project.sourceUrl} /></>}
        mentor={<MentorPanel stepId={data.step.id} mentor={data.mentor} />}
      />
    </div>
  );
}
