// Test setup: an in-memory PGlite loaded with the shared schema and seeds, a guest on a project, and helpers.
process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;
delete process.env.ANTHROPIC_API_KEY;

import { dbReady, one, rows, tx } from "@/lib/db";
import { recipes } from "@/vendor/db/support/recipes.mjs";

export { one, rows, tx };

export async function guestOn(slug = "challenge-wc") {
  await dbReady();
  return tx(async (q) => {
    const l = (await q.query<{ id: string }>(`insert into learner (display_name) values ('Test') returning id`)).rows[0].id;
    const e = await recipes(q).enroll(l, slug);
    return { l, e };
  });
}

/** The build steps of a project, in order. */
export async function stepsOf(slug = "challenge-wc") {
  return rows<{ id: string; milestone: number; position: number; outcome: string }>(
    `select s.id, m.position as milestone, s.position, s.outcome
       from step s join milestone m on m.id = s.milestone_id join challenge c on c.id = m.challenge_id
      where c.slug = $1 order by m.position, s.position`,
    [slug]
  );
}

/** The learning map of a project: one row per concept, with its explain-back rubric. */
export async function mapOf(slug = "challenge-wc") {
  return rows<{ id: string; slug: string; rubric: { id: string; point: string }[] }>(
    `select pc.id, c.slug, pc.explain_rubric as rubric from project_concept pc join concept c on c.id = pc.concept_id
       join challenge ch on ch.id = pc.challenge_id where ch.slug = $1 order by pc.position`,
    [slug]
  );
}

export const waitFor = async (check: () => Promise<boolean>, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timed out");
};
