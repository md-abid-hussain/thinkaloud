import { handle, HttpError, requireLearner } from "@/lib/api";
import { dispute } from "@/lib/progress";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const b = ((await req.json().catch(() => ({}))) ?? {}) as { note?: string };
  if (!(await dispute(await requireLearner(), id, b.note?.trim().slice(0, 1000) || null))) throw new HttpError(404, "Not found.");
  return Response.json({ ok: true });
});
