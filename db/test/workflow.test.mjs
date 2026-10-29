import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../support/helpers.mjs';
import { recipes, keyMatches } from '../support/recipes.mjs';

const t = await open();
after(() => t.close());
const { db, rows, one, idOf, newLearner } = t;
const app = recipes(db);

const steps = await rows(`select id, position, milestone_id from step order by position`);
const [teachBack] = await rows(`select id from question order by position`);
const milestoneId = steps[0].milestone_id;

const STEP1 = '3 reads return data: 8,192 bytes, 8,192 bytes and 3,616 bytes, then the end marker.';
const STEP2 = '1, because only the newline byte is counted and there is no trailing newline.';
const STEP3 = 'Both are the same kind of byte stream, and only the code that opens the stream differs.';
const TEACH_BACK = [
  'Memory stays constant because the input is read in fixed-size chunks and only running totals are kept.',
  'A file and stdin are the same byte stream, and only the code that opens it differs.',
  'A read can return fewer bytes than the buffer, so I use the returned count and stop on -1.',
].join(' ');
const QUOTE = 'read in fixed-size chunks';

const doSteps = async (l, e, skip = []) => {
  const bodies = [STEP1, STEP2, STEP3];
  for (const [i, s] of steps.entries()) {
    if (skip.includes(i)) continue;
    await app.startStep(l, e, s.id);
    await app.thinkAnswer(l, e, s.id, bodies[i], { quote: i === 2 ? 'same kind of byte stream' : undefined });
  }
};
const doTeachBack = async (l, e) => {
  const r = await app.gateAnswer(l, e, teachBack.id, TEACH_BACK, { quote: QUOTE });
  assert.equal(r.grade, 'met');
};

test('key matching handles thousands separators and exact numbers', () => {
  const key = { match: 'numbers_all', expected: [3, 8192, 8192, 3616] };
  assert.ok(keyMatches(key, STEP1));
  assert.ok(!keyMatches(key, '3 reads of 8,192 bytes'));
  assert.ok(keyMatches({ match: 'number_exact', expected: 1 }, STEP2));
  assert.ok(!keyMatches({ match: 'number_exact', expected: 1 }, 'between 1 and 2'));
});

test('a concept-only learner goes from guest to an understood project', async () => {
  const l = await newLearner('Ada');
  const e = await app.enroll(l, 'challenge-wc');
  assert.deepEqual(await one(`select language, framework, repo_url from enrollment where id = $1`, [e]),
    { language: null, framework: null, repo_url: null });

  assert.equal(await app.restate(l, e, 'A tool that counts bytes, lines, words and characters, and reads standard input.', { quote: 'reads standard input' }), 'met');
  const seen = await idOf('concept', 'slug', 'stdin-vs-file');
  await app.seen(l, e, seen);

  await doSteps(l, e);
  let p = await one(`select * from v_milestone_progress where enrollment_id = $1`, [e]);
  assert.deepEqual([p.steps_done, p.gate_met, p.understood], [3, 0, false], 'steps alone do not close a milestone');

  const partial = await app.gateAnswer(l, e, teachBack.id, TEACH_BACK, { metCount: 2, quote: QUOTE });
  p = await one(`select * from v_milestone_progress where enrollment_id = $1`, [e]);
  assert.deepEqual([partial.grade, p.gate_met, p.understood], ['partial', 0, false], 'two of three points are not enough');
  await app.gateAnswer(l, e, teachBack.id, TEACH_BACK, { quote: QUOTE, followupOf: partial.answerId });
  p = await one(`select * from v_milestone_progress where enrollment_id = $1`, [e]);
  assert.equal(p.understood, true);

  let project = await one(`select * from v_enrollment_progress where enrollment_id = $1`, [e]);
  assert.deepEqual([project.milestones_understood, project.reflection_submitted, project.understood], [1, false, false]);
  assert.equal(await app.reflect(l, e, 'I count in one loop over a byte stream and would test against the real wc.'), true);
  project = await one(`select * from v_enrollment_progress where enrollment_id = $1`, [e]);
  assert.equal(project.understood, true);
  assert.equal((await one(`select status from enrollment where id = $1`, [e])).status, 'understood');

  const statuses = await rows(
    `select c.slug, cs.status from concept_state cs join concept c on c.id = cs.concept_id where cs.learner_id = $1 order by c.slug`, [l]);
  assert.deepEqual(statuses, [
    { slug: 'stdin-vs-file', status: 'explained' },
    { slug: 'stream-read-contract', status: 'explained' },
    { slug: 'streaming-constant-memory', status: 'explained' },
  ]);

  const types = (await rows(`select type from event where enrollment_id = $1 order by id`, [e])).map((r) => r.type);
  assert.equal(types[0], 'enrolled');
  assert.equal(types.at(-1), 'project_understood');
  for (const expected of ['concept_seen', 'step_done', 'gate_met', 'concept_explained', 'milestone_understood', 'reflection_submitted']) {
    assert.ok(types.includes(expected), expected);
  }
  assert.equal((await one(`select count(*)::int n from repo_evaluation where enrollment_id = $1`, [e])).n, 0, 'no repo needed');
});

test('a wrong predict answer can be retried, and only the right one completes the step', async () => {
  const l = await newLearner();
  const e = await app.enroll(l, 'challenge-wc');
  await app.startStep(l, e, steps[0].id);
  assert.equal(await app.thinkAnswer(l, e, steps[0].id, '2 reads of 8,192 bytes'), 'not_yet');
  assert.equal((await one(`select status from step_state where enrollment_id = $1 and step_id = $2`, [e, steps[0].id])).status, 'in_progress');
  assert.equal(await app.thinkAnswer(l, e, steps[0].id, STEP1), 'met');
  const attempts = await rows(`select attempt, grade from answer where enrollment_id = $1 order by attempt`, [e]);
  assert.deepEqual(attempts, [{ attempt: 1, grade: 'not_yet' }, { attempt: 2, grade: 'met' }]);
  assert.equal((await one(`select status from step_state where enrollment_id = $1 and step_id = $2`, [e, steps[0].id])).status, 'done');
});

test('a partial teach-back explains the concepts of its met points, and a follow-up links back to it', async () => {
  const l = await newLearner();
  const e = await app.enroll(l, 'challenge-wc');
  const first = await app.gateAnswer(l, e, teachBack.id, TEACH_BACK, { metCount: 1, quote: QUOTE });
  assert.equal(first.grade, 'partial');
  const explained = async () => (await rows(
    `select c.slug from concept_state cs join concept c on c.id = cs.concept_id
      where cs.learner_id = $1 and cs.status = 'explained' order by c.slug`, [l])).map((r) => r.slug);
  assert.deepEqual(await explained(), ['streaming-constant-memory'], 'only the met point marks its concept');
  const second = await app.gateAnswer(l, e, teachBack.id, TEACH_BACK, { quote: QUOTE, followupOf: first.answerId });
  assert.equal(second.grade, 'met');
  assert.deepEqual(await explained(), ['stdin-vs-file', 'stream-read-contract', 'streaming-constant-memory']);
  assert.equal((await one(`select followup_of from answer where id = $1`, [second.answerId])).followup_of, first.answerId);
  assert.equal((await one(`select count(*)::int n from event where enrollment_id = $1 and type = 'gate_met'`, [e])).n, 1);
});

test('the support level is saved with the enrollment and every change is logged', async () => {
  const l = await newLearner();
  const e = await app.enroll(l, 'challenge-wc', { supportLevel: 'guided' });
  await app.setSupportLevel(l, e, 'independent');
  assert.equal((await one(`select support_level from enrollment where id = $1`, [e])).support_level, 'independent');
  const levels = (await rows(`select payload from event where enrollment_id = $1 and type = 'support_level_set'`, [e]))
    .map((r) => (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload).level);
  assert.deepEqual(levels, ['independent']);
});

test('a parked step keeps the milestone from being understood until it is done', async () => {
  const l = await newLearner();
  const e = await app.enroll(l, 'challenge-wc');
  await doSteps(l, e, [1]);
  await app.park(l, e, steps[1].id, 'come back after the break');
  await doTeachBack(l, e);
  let p = await one(`select * from v_milestone_progress where enrollment_id = $1`, [e]);
  assert.deepEqual([p.steps_done, p.gate_met, p.understood], [2, 1, false]);
  await app.thinkAnswer(l, e, steps[1].id, STEP2);
  p = await one(`select * from v_milestone_progress where enrollment_id = $1`, [e]);
  assert.equal(p.understood, true);
  assert.equal((await one(`select status from milestone_state where enrollment_id = $1`, [e])).status, 'understood');
});

test('adding a language and a repo later marks a concept applied only once it is explained', async () => {
  const l = await newLearner();
  const e = await app.enroll(l, 'challenge-wc');
  await app.setLanguage(l, e, 'java', 'spring boot');
  await app.linkRepo(l, e, 'https://github.com/ada/ccwc');
  await app.setHelp(l, e, steps[0].id, 'hint');

  await app.repoCheck(l, e, {
    toSha: 'abc123',
    messages: ['count bytes in chunks'],
    findings: [{ concept: 'streaming-constant-memory', applied: true, file: 'src/Main.java', lines: [10, 24], confidence: 'high' }],
  });
  const concept = await idOf('concept', 'slug', 'streaming-constant-memory');
  const status = async () => (await one(`select status from concept_state where learner_id = $1 and concept_id = $2`, [l, concept])).status;
  assert.equal(await status(), 'seen', 'code without an explanation is not applied yet');

  await app.gateAnswer(l, e, teachBack.id, TEACH_BACK, { quote: QUOTE });
  assert.equal(await status(), 'applied');
  assert.equal((await one(`select count(*)::int n from evidence where learner_id = $1 and concept_id = $2`, [l, concept])).n, 2);
  assert.equal((await one(`select help_level from step_state where enrollment_id = $1 and step_id = $2`, [e, steps[0].id])).help_level, 'hint');

  await app.repoCheck(l, e, { fromSha: 'abc123', toSha: 'def456', findings: [] });
  const last = await one(`select from_sha, to_sha from repo_evaluation where enrollment_id = $1 order by created_at desc, to_sha limit 1`, [e]);
  assert.equal(last.from_sha, 'abc123');
});

test('the export covers every learner-owned table, and delete removes every row', async () => {
  const l = await newLearner('Export me');
  const e = await app.enroll(l, 'challenge-wc', { language: 'java' });
  await app.linkRepo(l, e, 'https://github.com/ada/ccwc');
  await app.restate(l, e, 'A tool that counts bytes, lines, words and characters, and reads standard input.', { quote: 'reads standard input' });
  await app.startStep(l, e, steps[0].id);
  const first = await app.gateAnswer(l, e, teachBack.id, TEACH_BACK, { metCount: 1, quote: QUOTE });
  await app.gateAnswer(l, e, teachBack.id, TEACH_BACK, { quote: QUOTE, followupOf: first.answerId });
  await doSteps(l, e);
  await doTeachBack(l, e);
  await app.repoCheck(l, e, {
    toSha: 'abc', findings: [{ concept: 'stdin-vs-file', applied: true, file: 'src/Main.java', lines: [1, 5], confidence: 'high' }],
  });
  await db.query(`insert into side_item (enrollment_id, kind, prompt, in_scope) values ($1, 'later', 'What is a socket?', false)`, [e]);
  await db.query(`insert into session_summary (enrollment_id, summary, covers_from, covers_to) values ($1, 's', now(), now())`, [e]);
  await db.query(`insert into message (enrollment_id, role, body) values ($1, 'learner', 'hello')`, [e]);
  await db.query(
    `insert into llm_usage (learner_id, enrollment_id, purpose, provider, model, input_tokens, output_tokens, cost_usd)
     values ($1, $2, 'grade', 'anthropic', 'm', 10, 5, 0.001)`, [l, e]);

  const owned = (await rows(`
    select distinct c.table_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
       and c.column_name in ('learner_id', 'enrollment_id') order by 1`)).map((r) => r.table_name);
  assert.ok(owned.length >= 12, `found ${owned.join(', ')}`);

  const doc = (await one(`select export_learner($1) as doc`, [l])).doc;
  const exported = typeof doc === 'string' ? JSON.parse(doc) : doc;
  assert.ok(exported.learner, 'the learner row');
  for (const table of owned) {
    assert.ok(Array.isArray(exported[table]), `the export is missing ${table}`);
    assert.ok(exported[table].length > 0, `the test learner has no ${table} rows, so the export is not proven for it`);
  }

  await assert.rejects(() => db.query(`delete from learner where id = $1`, [l]), /append-only/);
  await db.exec(`begin; set local app.allow_event_delete = 'on'; delete from learner where id = '${l}'; commit;`);
  for (const table of owned) {
    const cols = (await rows(`select column_name from information_schema.columns where table_name = $1 and column_name in ('learner_id','enrollment_id')`, [table])).map((r) => r.column_name);
    for (const col of cols) {
      const id = col === 'learner_id' ? l : e;
      assert.equal((await one(`select count(*)::int n from ${table} where ${col} = $1`, [id])).n, 0, `${table}.${col} still has rows`);
    }
  }
  assert.equal((await one(`select count(*)::int n from learner where id = $1`, [l])).n, 0);
  assert.equal((await one(`select count(*)::int n from challenge where slug = 'challenge-wc'`)).n, 1, 'the curriculum is untouched');
});
