// Small helpers shared by the API routes: who is asking, and does the thing they name belong to them.
import "server-only";
import { one } from "@/lib/db";
import { currentLearnerId } from "@/lib/learner";

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function requireLearner() {
  const id = await currentLearnerId();
  if (!id) throw new HttpError(401, "Start a project first.");
  return id;
}

export async function readJson<T>(req: Request): Promise<T> {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") throw new HttpError(400, "Expected a JSON body.");
  return b as T;
}

export function text(v: unknown, max = 8000) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw new HttpError(400, "Write or dictate an answer first.");
  if (s.length > max) throw new HttpError(400, `Please keep it under ${max} characters.`);
  return s;
}

/** The learner's enrollment that a step belongs to. */
export async function stepScope(learnerId: string, stepId: string) {
  const s = await one<{ enrollment_id: string; language: string | null; support_level: string; milestone_id: string; slug: string }>(
    `select en.id as enrollment_id, en.language, en.support_level, m.id as milestone_id, c.slug
       from step s join milestone m on m.id = s.milestone_id join challenge c on c.id = m.challenge_id
       join enrollment en on en.challenge_id = c.id and en.learner_id = $1
      where s.id = $2`,
    [learnerId, stepId]
  );
  if (!s) throw new HttpError(404, "Start this project first.");
  return s;
}

export async function questionScope(learnerId: string, questionId: string) {
  const s = await one<{ enrollment_id: string; milestone_id: string }>(
    `select en.id as enrollment_id, m.id as milestone_id
       from question q join milestone m on m.id = q.milestone_id join enrollment en on en.challenge_id = m.challenge_id and en.learner_id = $1
      where q.id = $2`,
    [learnerId, questionId]
  );
  if (!s) throw new HttpError(404, "Start this project first.");
  return s;
}

export async function enrollmentScope(learnerId: string, slug: string) {
  const s = await one<{ enrollment_id: string }>(
    `select en.id as enrollment_id from enrollment en join challenge c on c.id = en.challenge_id where en.learner_id = $1 and c.slug = $2`,
    [learnerId, slug]
  );
  if (!s) throw new HttpError(404, "Start this project first.");
  return s;
}

/** Wraps a route handler so HttpErrors become JSON responses and anything else a 500. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error("[api]", e);
      return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}
