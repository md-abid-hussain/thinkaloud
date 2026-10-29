import { startEnrollment, type StartInput } from "@/lib/learner";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as StartInput | null;
  if (!body?.slug) return Response.json({ error: "slug is required" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  try {
    const r = await startEnrollment(body, ip);
    return Response.json({ ...r, next: `/projects/${body.slug}/home` });
  } catch (e) {
    const msg = String(e);
    if (/learner_email_uniq|duplicate key/.test(msg)) return Response.json({ error: "That email is already saved on another learner." }, { status: 409 });
    if (/violates check constraint/.test(msg)) return Response.json({ error: "Please check the email address." }, { status: 400 });
    console.error("[start]", e);
    return Response.json({ error: "Could not start the project. Please try again." }, { status: 500 });
  }
}
