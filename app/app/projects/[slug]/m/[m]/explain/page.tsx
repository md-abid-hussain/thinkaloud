import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentLearnerId } from "@/lib/learner";
import { teachBackView } from "@/lib/views";
import { shortName } from "@/lib/catalogue";
import Workspace from "@/ws/Workspace";
import Rail from "@/ws/Rail";
import TeachBack from "@/ws/TeachBack";
import MentorPanel from "@/ws/MentorPanel";
import { ContextBar, WsFooter, WsHeader } from "../../WsFrame";
import "../../../workspace.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Explain it back · ThinkAloud" };

export default async function ExplainPage({ params }: { params: Promise<{ slug: string; m: string }> }) {
  const { slug, m } = await params;
  const mi = Number(m);
  const learner = await currentLearnerId();
  const data = learner && Number.isInteger(mi) ? await teachBackView(learner, slug, mi) : null;
  if (!data) redirect(`/projects/${slug}`);
  const short = shortName(slug, data.project.title);
  // The mentor needs a step for its context: the milestone's last step.
  const steps = data.milestones.find((x) => x.position === mi)?.steps ?? [];
  const stepId = steps[steps.length - 1]?.id ?? null;

  return (
    <div className="pg-ws">
      <WsHeader />
      <ContextBar slug={slug} short={short} milestone={data.milestone} last="Explain it back" level={data.enrollment.supportLevel} language={data.enrollment.language} />
      <Workspace
        key={data.question.id}
        railLabel={`Steps in ${short}`}
        rail={<Rail slug={slug} short={short} title={data.project.title} milestones={data.milestones} current={{ m: mi, explain: true }} milestone={mi}
          ideas={data.question.concepts.map((c) => ({ name: c.name, status: c.status }))} />}
        main={<><TeachBack data={data} /><WsFooter slug={slug} short={short} sourceUrl={data.project.sourceUrl} /></>}
        mentor={stepId ? <MentorPanel stepId={stepId} mentor={null} quiet /> : null}
      />
    </div>
  );
}
