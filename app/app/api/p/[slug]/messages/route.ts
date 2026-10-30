import { z } from "zod";
import { startTurn } from "@/lib/agent/run";
import { tx } from "@/lib/db";
import { getMap } from "@/lib/content";
import { ensureGuest } from "@/lib/guest";
import { getOrCreateEnrollment, insertMessage } from "@/lib/repo";

const Body = z.object({ text: z.string().trim().min(1).max(8000) });

/** Saves the learner's message, starts the mentor's reply in the background, and returns both IDs. */
export async function POST(request: Request, ctx: RouteContext<"/api/p/[slug]/messages">) {
  const { slug } = await ctx.params;
  if (!(await getMap(slug))) return Response.json({ error: "No such project." }, { status: 404 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Write a message first (up to 8000 characters)." }, { status: 400 });

  const learnerId = await ensureGuest();
  const enrollment = await getOrCreateEnrollment(learnerId, slug);
  try {
    const { learner, mentor } = await tx(async (client) => ({
      learner: await insertMessage(enrollment.id, { role: "learner", text: body.data.text }, client),
      mentor: await insertMessage(enrollment.id, { role: "mentor", status: "pending" }, client),
    }));
    startTurn({ enrollmentId: enrollment.id, learnerMessageId: learner.id, mentorMessageId: mentor.id });
    return Response.json({ learner, mentorId: mentor.id }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return Response.json({ error: "The mentor is still replying. Wait for it to finish." }, { status: 409 });
    }
    throw error;
  }
}
