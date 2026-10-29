import { handle, questionScope, readJson, requireLearner, text } from "@/lib/api";
import { one } from "@/lib/db";
import { createRun } from "@/lib/worker";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ questionId: string }> }) => {
  const { questionId } = await params;
  const l = await requireLearner();
  const s = await questionScope(l, questionId);
  const b = await readJson<{ body?: string; followupOf?: string | null }>(req);
  const followupOf = b.followupOf
    ? (await one<{ id: string }>(`select id from answer where id = $1 and enrollment_id = $2 and question_id = $3`, [b.followupOf, s.enrollment_id, questionId]))?.id ?? null
    : null;
  const runId = await createRun({
    kind: "grade", learnerId: l, enrollmentId: s.enrollment_id, questionId, input: { target: "gate", body: text(b.body, 12000), followupOf },
  });
  return Response.json({ runId });
});
