import { handle, HttpError, readJson, requireLearner } from "@/lib/api";
import { query } from "@/lib/db";

// Save progress: an optional name and email on the guest. Nothing is sent to the email.
export const POST = handle(async (req: Request) => {
  const l = await requireLearner();
  const b = await readJson<{ name?: string; email?: string }>(req);
  const name = b.name?.trim() || null;
  const email = b.email?.trim() || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Please check the email address.");
  try {
    await query(`update learner set display_name = $2, email = $3, last_seen_at = now() where id = $1`, [l, name, email]);
  } catch (e) {
    if (/learner_email_uniq|duplicate key/.test(String(e))) throw new HttpError(409, "That email is already saved on another learner.");
    throw e;
  }
  return Response.json({ ok: true });
});
