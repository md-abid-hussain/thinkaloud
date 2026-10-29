import { handle, HttpError, readJson, requireLearner, stepScope } from "@/lib/api";
import { giveHelp } from "@/lib/progress";

// Help is never refused. "not_sure" shows the hint and counts as help used; "code" unlocks Show me code
// for the learner's next mentor message (the mentor's tool list changes only when that flag is sent).
export const POST = handle(async (req: Request, { params }: { params: Promise<{ stepId: string }> }) => {
  const { stepId } = await params;
  const l = await requireLearner();
  const s = await stepScope(l, stepId);
  const { rung } = await readJson<{ rung?: string }>(req);
  if (rung === "not_sure") return Response.json(await giveHelp(l, s.enrollment_id, stepId, "hint", "not_sure", s.language));
  if (rung === "hint" || rung === "example") return Response.json(await giveHelp(l, s.enrollment_id, stepId, rung, "button", s.language));
  if (rung === "code") {
    await giveHelp(l, s.enrollment_id, stepId, "code", "show_me_code", s.language);
    return Response.json({ unlocked: true });
  }
  throw new HttpError(400, "Unknown help level.");
});
