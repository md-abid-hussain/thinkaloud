import { handle, readJson, requireLearner, stepScope, text } from "@/lib/api";
import { one, query } from "@/lib/db";
import { createRun } from "@/lib/worker";

// One mentor turn = one run. The learner's message is stored first, so a reload shows it at once.
export const POST = handle(async (req: Request) => {
  const l = await requireLearner();
  const b = await readJson<{ stepId?: string; message?: string; showCode?: boolean }>(req);
  const s = await stepScope(l, String(b.stepId ?? ""));
  const message = text(b.message, 4000);
  const busy = await one<{ id: string }>(
    `select id from run where enrollment_id = $1 and kind = 'mentor' and status in ('queued', 'running') limit 1`, [s.enrollment_id]
  );
  if (busy) return Response.json({ error: "The mentor is still answering your last message.", runId: busy.id }, { status: 409 });
  await query(`insert into message (enrollment_id, step_id, role, body) values ($1, $2, 'learner', $3)`, [s.enrollment_id, b.stepId, message]);
  const runId = await createRun({
    kind: "mentor", learnerId: l, enrollmentId: s.enrollment_id, stepId: b.stepId, input: { message, showCode: b.showCode === true },
  });
  return Response.json({ runId });
});
