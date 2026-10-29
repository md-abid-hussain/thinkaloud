// Test setup: an in-memory PGlite loaded with the shared schema and seeds, a guest on wc, and helpers.
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

export async function stepsOf(slug = "challenge-wc") {
  return rows<{ id: string; milestone: number; position: number; kind: string; answer_key: any; rubric: any; prompt: string; snippet: string | null }>(
    `select s.id, m.position as milestone, s.position, t.kind, t.answer_key, t.rubric, t.prompt, t.snippet
       from step s join milestone m on m.id = s.milestone_id join challenge c on c.id = m.challenge_id
       join task t on t.step_id = s.id and t.role = 'think' where c.slug = $1 order by m.position, s.position`,
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
