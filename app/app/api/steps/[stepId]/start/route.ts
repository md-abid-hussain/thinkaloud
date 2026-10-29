import { handle, requireLearner, stepScope } from "@/lib/api";
import { startStep } from "@/lib/progress";

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ stepId: string }> }) => {
  const { stepId } = await params;
  const l = await requireLearner();
  const s = await stepScope(l, stepId);
  await startStep(l, s.enrollment_id, stepId);
  return Response.json({ ok: true });
});
