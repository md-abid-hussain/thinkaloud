import { handle, requireLearner, stepScope } from "@/lib/api";
import { tx } from "@/lib/db";
import { recipes } from "@/vendor/db/support/recipes.mjs";

// Format 3: the learner ticks a build step's outcome as met. The app can't run their code, so this is their call.
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ stepId: string }> }) => {
  const { stepId } = await params;
  const l = await requireLearner();
  const s = await stepScope(l, stepId);
  const r = await tx((q) => recipes(q).outcomeMet(l, s.enrollment_id, stepId));
  return Response.json({ ok: true, ...r });
});
