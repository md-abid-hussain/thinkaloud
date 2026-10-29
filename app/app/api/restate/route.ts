import { enrollmentScope, handle, readJson, requireLearner, text } from "@/lib/api";
import { createRun } from "@/lib/worker";

export const POST = handle(async (req: Request) => {
  const l = await requireLearner();
  const b = await readJson<{ slug?: string; body?: string }>(req);
  const s = await enrollmentScope(l, String(b.slug ?? ""));
  const runId = await createRun({ kind: "grade", learnerId: l, enrollmentId: s.enrollment_id, input: { target: "restate", body: text(b.body) } });
  return Response.json({ runId });
});
