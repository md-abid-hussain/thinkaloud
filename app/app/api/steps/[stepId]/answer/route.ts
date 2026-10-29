import { handle, readJson, requireLearner, stepScope, text } from "@/lib/api";
import { one } from "@/lib/db";
import { isKeyed, keyedThink, thinkTask } from "@/lib/progress";
import { createRun } from "@/lib/worker";

// Predict and trace answers are checked by key here and now. Explain and spot-the-bug answers start a grade run.
export const POST = handle(async (req: Request, { params }: { params: Promise<{ stepId: string }> }) => {
  const { stepId } = await params;
  const l = await requireLearner();
  const s = await stepScope(l, stepId);
  const body = text((await readJson<{ body?: string }>(req)).body);
  const task = await thinkTask(stepId);
  if (!task) return Response.json({ error: "This step has no check." }, { status: 404 });
  if (isKeyed(task)) {
    const r = await keyedThink(l, s.enrollment_id, stepId, body);
    return Response.json({ mode: "key", ...r });
  }
  const pending = await one<{ id: string }>(
    `select id from run where enrollment_id = $1 and step_id = $2 and kind = 'grade' and status in ('queued', 'running') order by created_at desc limit 1`,
    [s.enrollment_id, stepId]
  );
  if (pending) return Response.json({ mode: "run", runId: pending.id, already: true });
  const runId = await createRun({ kind: "grade", learnerId: l, enrollmentId: s.enrollment_id, stepId, input: { target: "think", body } });
  return Response.json({ mode: "run", runId });
});
