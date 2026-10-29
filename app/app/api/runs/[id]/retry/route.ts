import { handle, HttpError, requireLearner } from "@/lib/api";
import { retryRun } from "@/lib/worker";

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!(await retryRun(id, await requireLearner()))) throw new HttpError(409, "This check isn't paused.");
  return Response.json({ ok: true });
});
