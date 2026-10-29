import { cookies } from "next/headers";
import { handle, requireLearner } from "@/lib/api";
import { deleteLearner } from "@/lib/export";
import { GUEST_COOKIE } from "@/lib/learner";

export const POST = handle(async () => {
  await deleteLearner(await requireLearner());
  (await cookies()).delete(GUEST_COOKIE);
  return Response.json({ ok: true });
});
