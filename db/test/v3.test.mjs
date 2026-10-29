import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readContent, checkContent, dropInvalidProjects } from '../scripts/import-content.mjs';
import { recipes } from '../support/recipes.mjs';

// The v3 progress rules (CONTENT_FORMAT.md, The learning model): a step is done when its outcome is ticked,
// a concept is applied when a done step uses it and explained when its explain-back is met, and a milestone
// is understood when its concepts are explained and built when its steps are done.
const r = await checkContent(dropInvalidProjects(readContent()).content);
const db = r.db;
after(() => db.close());
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const rows = async (sql, p) => (await db.query(sql, p)).rows;
const app = recipes(db);

const learner = async () => (await one(`insert into learner (display_name) values ('v3') returning id`)).id;
const wcSteps = () => rows(
  `select s.id, m.id as milestone_id, m.position as m, s.position as s from step s join milestone m on m.id = s.milestone_id
     join challenge c on c.id = m.challenge_id where c.slug = 'challenge-wc' order by m.position, s.position`
);
const pcFor = async (milestoneId) => rows(
  `select pc.id, pc.explain_rubric from project_concept pc join milestone_concept mc on mc.concept_id = pc.concept_id
     join milestone m on m.id = mc.milestone_id where mc.milestone_id = $1 and pc.challenge_id = m.challenge_id`, [milestoneId]
);
const progress = (e, m) => one(`select understood, built, gate_total, gate_met from v_milestone_progress where enrollment_id = $1 and milestone_id = $2`, [e, m]);

test('wc loads as format 3 with a learning map, build steps with outcomes, and step concepts', async () => {
  const c = await one(`select content_format, done_when, reference_tool from challenge where slug = 'challenge-wc'`);
  assert.equal(c.content_format, 3);
  assert.ok(c.done_when && c.reference_tool);
  assert.ok((await one(`select count(*)::int as n from project_concept pc join challenge c on c.id = pc.challenge_id where c.slug = 'challenge-wc'`)).n >= 3);
  const missing = await one(`select count(*)::int as n from step s join milestone m on m.id = s.milestone_id join challenge c on c.id = m.challenge_id
    where c.slug = 'challenge-wc' and (s.outcome is null or not exists (select 1 from step_concept sc where sc.step_id = s.id))`);
  assert.equal(missing.n, 0);
});

test('ticking outcomes builds a milestone, and met explain-backs make it understood', async () => {
  const l = await learner();
  const e = await app.enroll(l, 'challenge-wc');
  const steps = await wcSteps();
  const m1 = steps.filter((s) => s.m === 1);
  const mid = m1[0].milestone_id;

  for (const s of m1) await app.outcomeMet(l, e, s.id);
  let p = await progress(e, mid);
  assert.equal(p.built, true, 'every step ticked');
  assert.equal(p.understood, false, 'building alone does not make it understood');
  const applied = await one(`select count(*)::int as n from concept_state where learner_id = $1 and applied_at is not null`, [l]);
  assert.ok(applied.n > 0, 'concepts used by done steps are applied');
  assert.ok(await one(`select 1 from event where enrollment_id = $1 and type = 'milestone_built'`, [e]));

  const pcs = await pcFor(mid);
  const body = 'It reads a fixed buffer and keeps only counters, so memory stays flat.';
  const [first, ...rest] = pcs;
  const partial = await app.explainBack(l, e, first.id, body, { metCount: 1, quote: 'fixed buffer' });
  assert.equal(partial.grade, 'partial');
  assert.equal((await progress(e, mid)).gate_met, 0, 'a partial explain-back does not explain the concept');
  for (const pc of pcs) await app.explainBack(l, e, pc.id, body, { quote: 'keeps only counters' });
  p = await progress(e, mid);
  assert.equal(p.gate_met, p.gate_total);
  assert.equal(p.understood, true);
  assert.ok(await one(`select 1 from event where enrollment_id = $1 and type = 'milestone_understood'`, [e]));
  const ev = await one(`select quote from evidence where learner_id = $1 limit 1`, [l]);
  assert.match(ev.quote, /keeps only counters/);
  void rest;
});

test('an explain-back takes real points, and the trigger rejects a quote that is not in the answer', async () => {
  const l = await learner();
  const e = await app.enroll(l, 'challenge-wc');
  const [pc] = await pcFor((await wcSteps())[0].milestone_id);
  const rubric = typeof pc.explain_rubric === 'string' ? JSON.parse(pc.explain_rubric) : pc.explain_rubric;
  const body = 'UTF-8 stores each code point in one to four bytes.';
  const points = rubric.map((x, i) => ({ id: x.id, met: i === 0, ...(i === 0 ? { quote: 'one to four bytes' } : {}) }));
  const g = await app.explainBack(l, e, pc.id, body, { points, model: 'claude-sonnet-5-5' });
  assert.equal(g.grade, rubric.length === 1 ? 'met' : 'partial');
  const bad = rubric.map((x) => ({ id: x.id, met: true, quote: 'words the learner never said' }));
  await assert.rejects(() => app.explainBack(l, e, pc.id, body, { points: bad }), /quote/);
});

test('an explained concept counts in every project that uses it', async () => {
  const l = await learner();
  const e = await app.enroll(l, 'challenge-wc');
  const [pc] = await pcFor((await wcSteps())[0].milestone_id);
  await app.explainBack(l, e, pc.id, 'Memory stays flat with one reused buffer.', { quote: 'one reused buffer' });
  const st = await one(`select status from concept_state where learner_id = $1 and concept_id = (select concept_id from project_concept where id = $2)`, [l, pc.id]);
  assert.equal(st.status, 'explained');
});
