import { handle, HttpError, requireLearner } from "@/lib/api";
import { runFor } from "@/lib/worker";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const r = await runFor(id, await requireLearner());
  if (!r) throw new HttpError(404, "Not found.");
  return Response.json({ id: r.id, kind: r.kind, status: r.status, result: r.result, failed: !!r.error });
});
