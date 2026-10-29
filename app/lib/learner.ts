// Guest identity and enrollment. A guest is a learner row whose id lives in an httpOnly cookie;
// nothing else is needed to start. Name and email are optional and can be added at Start.
import "server-only";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { one, tx } from "@/lib/db";
import { recipes } from "@/vendor/db/support/recipes.mjs";
import { startLanguageRun, startReferencesRun } from "@/lib/research";

export const GUEST_COOKIE = "ta_guest";
export const SUPPORT_LEVELS = ["guided", "standard", "independent"] as const;
export type SupportLevel = (typeof SUPPORT_LEVELS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The current learner's id, or null for a visitor who has not started anything. */
export async function currentLearnerId(): Promise<string | null> {
  const id = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!id || !UUID.test(id)) return null;
  const row = await one<{ id: string }>(`select id from learner where id = $1`, [id]);
  return row?.id ?? null;
}

export function clientHash(ip: string | null) {
  return ip ? createHash("sha256").update(`ta:${ip}`).digest("hex").slice(0, 32) : null;
}

export interface StartInput {
  slug: string;
  supportLevel?: SupportLevel;
  language?: string | null;
  framework?: string | null;
  name?: string | null;
  email?: string | null;
}

const clean = (s?: string | null) => (s && s.trim() ? s.trim() : null);

/**
 * Creates the guest (if needed) and the enrollment, through the shared recipes, and sets the cookie.
 * Starting a project twice returns the existing enrollment, with the new choices applied.
 */
export async function startEnrollment(input: StartInput, ip: string | null) {
  const level: SupportLevel = SUPPORT_LEVELS.includes(input.supportLevel as SupportLevel) ? input.supportLevel! : "standard";
  const language = clean(input.language)?.toLowerCase() ?? null;
  const framework = language ? clean(input.framework)?.toLowerCase() ?? null : null;
  const existing = await currentLearnerId();

  const result = await tx(async (q) => {
    const app = recipes(q);
    let learnerId = existing;
    if (!learnerId) {
      learnerId = (await q.query<{ id: string }>(
        `insert into learner (display_name, email, client_hash) values ($1, $2, $3) returning id`,
        [clean(input.name), clean(input.email), clientHash(ip)]
      )).rows[0].id;
    } else if (clean(input.name) || clean(input.email)) {
      await q.query(
        `update learner set display_name = coalesce($2, display_name), email = coalesce($3, email), last_seen_at = now() where id = $1`,
        [learnerId, clean(input.name), clean(input.email)]
      );
    }
    const found = (await q.query<{ id: string; support_level: string; language: string | null; framework: string | null }>(
      `select en.id, en.support_level, en.language, en.framework from enrollment en join challenge c on c.id = en.challenge_id
        where en.learner_id = $1 and c.slug = $2`,
      [learnerId, input.slug]
    )).rows[0];
    let enrollmentId: string;
    if (found) {
      enrollmentId = found.id;
      if (found.support_level !== level) await app.setSupportLevel(learnerId, enrollmentId, level);
      if (found.language !== language || found.framework !== framework) await app.setLanguage(learnerId, enrollmentId, language, framework);
    } else {
      enrollmentId = await app.enroll(learnerId, input.slug, { language, framework, supportLevel: level });
    }
    return { learnerId, enrollmentId };
  });

  // Background research: references for thin concepts, and the language notes when a language was chosen.
  // Neither blocks the start; failures only mean the notes arrive later.
  await startReferencesRun(result.learnerId, result.enrollmentId).catch((e) => console.error("[references]", e));
  await startLanguageRun(result.learnerId, result.enrollmentId, language, framework).catch((e) => console.error("[language]", e));

  (await cookies()).set(GUEST_COOKIE, result.learnerId, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return result;
}

/** The learner's enrollment on a project, or null. */
export async function enrollmentFor(learnerId: string | null, slug: string) {
  if (!learnerId) return null;
  return (await one<{ id: string; support_level: SupportLevel; language: string | null; framework: string | null; status: string; challenge_id: string }>(
    `select en.id, en.support_level, en.language, en.framework, en.status, en.challenge_id
       from enrollment en join challenge c on c.id = en.challenge_id where en.learner_id = $1 and c.slug = $2`,
    [learnerId, slug]
  )) ?? null;
}
