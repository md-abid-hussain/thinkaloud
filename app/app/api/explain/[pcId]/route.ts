import { handle, HttpError, readJson, requireLearner, text } from "@/lib/api";
import { one } from "@/lib/db";
import { createRun } from "@/lib/worker";

// A concept's explain-back (format 3): graded by rubric in the background, like any other model grade.
export const POST = handle(async (req: Request, { params }: { params: Promise<{ pcId: string }> }) => {
  const { pcId } = await params;
  const l = await requireLearner();
  const s = await one<{ enrollment_id: string }>(
    `select en.id as enrollment_id from project_concept pc join enrollment en on en.challenge_id = pc.challenge_id and en.learner_id = $1 where pc.id = $2`,
    [l, pcId]
  );
  if (!s) throw new HttpError(404, "Start this project first.");
  const body = text((await readJson<{ body?: string }>(req)).body, 12000);
  const pending = await one<{ id: string }>(
    `select id from run where enrollment_id = $1 and kind = 'grade' and status in ('queued', 'running') and input->>'projectConceptId' = $2 limit 1`,
    [s.enrollment_id, pcId]
  );
  if (pending) return Response.json({ runId: pending.id, already: true });
  const runId = await createRun({ kind: "grade", learnerId: l, enrollmentId: s.enrollment_id, input: { target: "explain_back", body, projectConceptId: pcId } });
  return Response.json({ runId });
});
