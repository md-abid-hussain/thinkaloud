import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

export const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

export const DEFAULT_FILES = ['schema.sql', 'seed_reference.sql', 'seed_wc_sample.sql'];

export async function open(files = DEFAULT_FILES) {
  const db = new PGlite();
  for (const f of files) await db.exec(read(f));

  const rows = async (text, params) => (await db.query(text, params)).rows;
  const one = async (text, params) => (await rows(text, params))[0];
  const idOf = async (table, col, val) => (await one(`select id from ${table} where ${col} = $1`, [val])).id;
  const fails = (text, params, pattern = /./) => assert.rejects(() => db.query(text, params), pattern);

  const newLearner = async (name = 'Test') =>
    (await one(`insert into learner (display_name) values ($1) returning id`, [name])).id;

  const enroll = async (learnerId, slug = 'challenge-wc') =>
    (await one(
      `insert into enrollment (learner_id, challenge_id) values ($1, $2) returning id`,
      [learnerId, await idOf('challenge', 'slug', slug)]
    )).id;

  // A throwaway project with one milestone and one step, so rule tests leave the wc sample untouched.
  async function scratchChallenge() {
    const slug = `scratch-${Math.random().toString(36).slice(2, 8)}`;
    const ch = await one(
      `insert into challenge (source, slug, title, source_url) values ('roadmap_sh', $1, 'Scratch', 'https://example.com') returning id`,
      [slug]
    );
    const m = await one(`insert into milestone (challenge_id, position, title) values ($1, 1, 'M') returning id`, [ch.id]);
    const s = await one(`insert into step (milestone_id, position, title, est_minutes) values ($1, 1, 'S', 10) returning id`, [m.id]);
    return { challengeId: ch.id, milestoneId: m.id, stepId: s.id, slug };
  }

  return { db, rows, one, idOf, fails, newLearner, enroll, scratchChallenge, close: () => db.close() };
}

// A model grade for a rubric: the first `metCount` points are met, each backed by `quote`.
export const modelPoints = (rubric, metCount, quote) =>
  rubric.map((r, i) => (i < metCount ? { id: r.id, met: true, quote } : { id: r.id, met: false }));

export const gradeFor = (met, total) => (met === total ? 'met' : met === 0 ? 'not_yet' : 'partial');
