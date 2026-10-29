import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { open, json } from '../support/helpers.mjs';

const t = await open();
after(() => t.close());
const { db, rows, one, idOf, fails, newLearner, enroll, scratchChallenge } = t;

// The wc fixture closes milestone 1 with one teach-back question, its points tagged with concepts.
const teachBack = async () => one(`select * from question where position = 1`);

const insertAnswer = (e, o) =>
  db.query(
    `insert into answer (enrollment_id, kind, task_id, question_id, attempt, body, grade, graded_by, model, points)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [e, o.kind, o.taskId ?? null, o.questionId ?? null, o.attempt ?? 1, o.body, o.grade ?? 'ungraded',
     o.gradedBy ?? null, o.model ?? null, o.points ? JSON.stringify(o.points) : null]
  );

const BODY = 'Memory stays constant because the input is read in fixed-size chunks and only running totals are kept.';

test('model grading must agree with the rubric and quote the answer', async () => {
  const e = await enroll(await newLearner());
  const q = await teachBack();
  const ids = json(q.rubric).map((r) => r.id);
  const base = { kind: 'gate', questionId: q.id, body: BODY, gradedBy: 'model', model: 'm' };
  const pts = (...flags) => ids.map((id, i) => (flags[i] ? { id, met: true, quote: 'read in fixed-size chunks' } : { id, met: false }));

  await assert.rejects(
    () => insertAnswer(e, { ...base, grade: 'met', points: ids.map((id) => ({ id, met: true, quote: 'a line the learner never wrote' })) }),
    /quote for point/
  );
  await assert.rejects(() => insertAnswer(e, { ...base, grade: 'met', points: pts(true, false, false) }), /does not match the points/);
  await assert.rejects(() => insertAnswer(e, { ...base, grade: 'partial', points: pts(true, true, true) }), /does not match the points/);
  await assert.rejects(() => insertAnswer(e, { ...base, grade: 'met', points: pts(true, true, true).slice(0, 2) }), /every rubric point/);
  await assert.rejects(() => insertAnswer(e, { ...base, grade: 'met', points: [{ id: 'zz', met: false }, ...pts(true, true, true).slice(1)] }), /every rubric point/);
  await assert.rejects(() => insertAnswer(e, { ...base, grade: 'partial', points: ids.map((id, i) => ({ id, met: i === 0, ...(i === 0 ? { quote: '  ' } : {}) })) }), /quote for point/);
  await assert.rejects(() => insertAnswer(e, { ...base, grade: 'met' }), /needs a points array|model grading/);

  await insertAnswer(e, { ...base, attempt: 1, grade: 'not_yet', points: pts(false, false, false) });
  await insertAnswer(e, { ...base, attempt: 2, grade: 'partial', points: pts(true, false, false) });
  await insertAnswer(e, { ...base, attempt: 3, grade: 'met', points: pts(true, true, true) });
});

test('quotes match ignoring case and spacing', async () => {
  const e = await enroll(await newLearner());
  const q = await teachBack();
  const ids = json(q.rubric).map((r) => r.id);
  await insertAnswer(e, {
    kind: 'gate', questionId: q.id, body: 'Both are the   SAME\nbyte stream.', gradedBy: 'model', model: 'm', grade: 'met',
    points: ids.map((id) => ({ id, met: true, quote: 'the same byte stream' })),
  });
});

test('predict and trace tasks are graded by key, never by the model', async () => {
  const e = await enroll(await newLearner());
  const task = await one(`select id from task where kind = 'predict' order by prompt limit 1`);
  const base = { kind: 'think', taskId: task.id, body: '3 reads' };
  await assert.rejects(() => insertAnswer(e, { ...base, grade: 'met', gradedBy: 'model', model: 'm', points: [] }), /graded by key/);
  await assert.rejects(() => insertAnswer(e, { ...base, grade: 'partial', gradedBy: 'key' }));
  await assert.rejects(() => insertAnswer(e, { ...base, grade: 'met', gradedBy: 'key', points: [{ id: 'a', met: true }] }), /points belong to model grading/);
  await insertAnswer(e, { ...base, grade: 'met', gradedBy: 'key' });
});

test('explain tasks, teach-backs and restate answers are graded by rubric, never by key', async () => {
  const e = await enroll(await newLearner());
  const explain = await one(`select id, rubric from task where kind = 'explain'`);
  await assert.rejects(() => insertAnswer(e, { kind: 'think', taskId: explain.id, body: 'x', grade: 'met', gradedBy: 'key' }), /graded by rubric/);
  const q = await teachBack();
  await assert.rejects(() => insertAnswer(e, { kind: 'gate', questionId: q.id, body: 'x', grade: 'met', gradedBy: 'key' }), /graded by rubric/);
  await assert.rejects(() => insertAnswer(e, { kind: 'restate', body: 'x', grade: 'met', gradedBy: 'key' }), /graded by rubric/);
});

test('a restate answer is graded against the project rubric, and a project without one cannot be model graded', async () => {
  const rubric = json((await one(`select restate_rubric r from challenge where slug = 'challenge-wc'`)).r);
  const e = await enroll(await newLearner());
  await insertAnswer(e, {
    kind: 'restate', body: 'A tool that counts bytes, lines, words and characters, and reads standard input.',
    gradedBy: 'model', model: 'm', grade: 'met',
    points: rubric.map((r) => ({ id: r.id, met: true, quote: 'reads standard input' })),
  });

  const other = await scratchChallenge();
  const e2 = await enroll(await newLearner(), other.slug);
  await assert.rejects(
    () => insertAnswer(e2, { kind: 'restate', body: 'x y', gradedBy: 'model', model: 'm', grade: 'met', points: [{ id: 'a', met: true, quote: 'x' }] }),
    /no rubric/
  );
});

test('a dispute can be recorded, but a graded answer cannot be edited into disagreement', async () => {
  const e = await enroll(await newLearner());
  const q = await teachBack();
  const ids = json(q.rubric).map((r) => r.id);
  await insertAnswer(e, {
    kind: 'gate', questionId: q.id, body: 'A read can return fewer bytes than the buffer holds.', gradedBy: 'model', model: 'm', grade: 'not_yet',
    points: ids.map((id) => ({ id, met: false })),
  });
  await db.query(`update answer set disputed_at = now(), dispute_note = 'I said it in the first line' where enrollment_id = $1`, [e]);
  assert.ok((await one(`select disputed_at from answer where enrollment_id = $1`, [e])).disputed_at);
  await fails(`update answer set grade = 'met' where enrollment_id = $1`, [e], /does not match the points/);
});

test('concept status is derived from the timestamps', async () => {
  const l = await newLearner();
  const concepts = await rows(`select id from concept order by slug limit 5`);
  const set = async (concept, cols) =>
    (await one(
      `insert into concept_state (learner_id, concept_id, ${Object.keys(cols).join(', ')})
       values ($1, $2, ${Object.keys(cols).map(() => 'now()').join(', ')}) returning status`,
      [l, concept.id]
    )).status;
  assert.equal(await set(concepts[0], { seen_at: 1 }), 'seen');
  assert.equal(await set(concepts[1], { explained_at: 1 }), 'explained');
  assert.equal(await set(concepts[2], { applied_at: 1 }), 'seen', 'code seen before the concept is explained only counts as seen');
  assert.equal(await set(concepts[3], { explained_at: 1, applied_at: 1 }), 'applied');
  await fails(`insert into concept_state (learner_id, concept_id, status) values ($1, $2, 'explained')`, [l, concepts[4].id], /generated|status/i);
  await db.query(`update concept_state set explained_at = now() where learner_id = $1 and concept_id = $2`, [l, concepts[2].id]);
  assert.equal((await one(`select status from concept_state where learner_id = $1 and concept_id = $2`, [l, concepts[2].id])).status, 'applied');
});
