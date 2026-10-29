import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { open, json, modelPoints, gradeFor } from '../support/helpers.mjs';

const t = await open();
after(() => t.close());
const { db, rows, one, idOf, fails, newLearner, enroll, scratchChallenge } = t;

test('the wc sample loads with the expected shape', async () => {
  assert.equal((await one(`select count(*)::int n from challenge`)).n, 1);
  assert.equal((await one(`select count(*)::int n from concept`)).n, 6);
  assert.equal((await one(`select count(*)::int n from concept_area`)).n, 10);
  assert.equal((await one(`select count(*)::int n from task`)).n, 6);
  const est = await one(`select steps, est_minutes from v_milestone_estimate`);
  assert.deepEqual(est, { steps: 3, est_minutes: 45 });
  const teachBack = await rows(`select count(*)::int n, bool_and(concept_id is null) untagged from question group by milestone_id`);
  assert.deepEqual(teachBack, [{ n: 1, untagged: true }], 'milestone 1 closes with one teach-back whose points carry the concepts');
});

test('task rules', async () => {
  const { stepId } = await scratchChallenge();
  const insert = (role, kind, extra = {}) =>
    db.query(
      `insert into task (step_id, role, kind, prompt, snippet, answer_key, rubric) values ($1, $2, $3, 'p', $4, $5, $6)`,
      [stepId, role, kind, extra.snippet ?? null, extra.key ?? null, extra.rubric ?? null]
    );
  const key = (match, expected) => JSON.stringify({ match, expected });
  await fails(`insert into task (step_id, role, kind, prompt) values ($1, 'think', 'predict', 'p')`, [stepId], /task_check/);
  await assert.rejects(() => insert('think', 'explain', { rubric: JSON.stringify([{ id: 'p1', point: 'only one' }]) }));
  await assert.rejects(() => insert('think', 'spot_bug', { rubric: JSON.stringify([{ id: 'a', point: 'x' }, { id: 'b', point: 'y' }]) }));
  await assert.rejects(() => insert('think', 'build'));
  await assert.rejects(() => insert('build', 'predict', { key: key('number_exact', 1) }));
  await assert.rejects(() => insert('think', 'predict', { key: JSON.stringify({ expected: 1 }) }));
  await assert.rejects(() => insert('think', 'predict', { key: key('regex', '.*') }), /answer_key/);
  await insert('think', 'predict', { key: key('number_exact', 1) });
  await assert.rejects(() => insert('think', 'predict', { key: key('number_exact', 2) }), /unique|duplicate/i);
});

test('question rules: a concept per question, or a concept on every point of a teach-back', async () => {
  const m = await idOf('milestone', 'position', 1);
  const outside = await idOf('concept', 'slug', 'bytes-vs-characters');
  const inside = await idOf('concept', 'slug', 'stdin-vs-file');
  const rubric = JSON.stringify([{ id: 'a', point: 'x' }, { id: 'b', point: 'y' }]);
  const tagged = (...slugs) => JSON.stringify(slugs.map((concept, i) => ({ id: `t${i + 1}`, concept, point: 'x' })));
  const insert = (concept, r, position = 2) =>
    db.query(`insert into question (milestone_id, concept_id, position, prompt, rubric) values ($1, $2, $3, 'q', $4)`, [m, concept, position, r]);
  await assert.rejects(() => insert(outside, rubric), /foreign key|violates/i);
  await assert.rejects(() => insert(inside, JSON.stringify([{ id: 'a', point: 'only one' }])));
  await assert.rejects(() => insert(inside, JSON.stringify([1, 2, 3, 4, 5].map((n) => ({ id: `p${n}`, point: 'x' })))));
  await assert.rejects(() => insert(inside, rubric, 4), /check/i, 'a milestone has at most three questions');
  await assert.rejects(() => insert(null, rubric), /tag every rubric point/);
  await assert.rejects(() => insert(null, tagged('stdin-vs-file', 'bytes-vs-characters')), /bytes-vs-characters is not one the milestone covers/);
  await assert.rejects(() => insert(inside, tagged('stdin-vs-file', 'no-such-concept')), /not one the milestone covers/);
  await db.exec('begin');
  await insert(null, tagged('stdin-vs-file', 'stream-read-contract'));
  await db.exec('rollback');
});

test('primer, figure and support level rules', async () => {
  const { challengeId } = await scratchChallenge();
  const setPrimer = (p) => db.query(`update challenge set primer = $2 where id = $1`, [challengeId, JSON.stringify(p)]);
  const words = (n) => Array.from({ length: n }, (_, i) => ({ term: `t${i}`, meaning: 'm' }));
  await assert.rejects(() => setPrimer({ what: 'w', why: 'y', example: 'e', words: [] }));
  await assert.rejects(() => setPrimer({ what: 'w', why: 'y', example: 'e', words: words(7) }));
  await assert.rejects(() => setPrimer({ what: 'w', example: 'e', words: words(1) }));
  await assert.rejects(() => setPrimer({ what: 'w', why: 'y', example: 'e', words: [{ term: 't' }] }));
  await setPrimer({ what: 'w', why: 'y', example: 'e', words: words(6) });
  await fails(`update challenge set figure_kind = 'spiral' where id = $1`, [challengeId], /check/i);
  await db.query(`update challenge set figure_kind = 'tree' where id = $1`, [challengeId]);

  const e = await enroll(await newLearner());
  assert.equal((await one(`select support_level from enrollment where id = $1`, [e])).support_level, 'standard');
  await fails(`update enrollment set support_level = 'expert' where id = $1`, [e], /check/i);
  await db.query(`update enrollment set support_level = 'guided' where id = $1`, [e]);
});

test('concept rules', async () => {
  const ins = (slug, kind, language, framework) =>
    db.query(
      `insert into concept (slug, name, area_slug, kind, language, framework) values ($1, $1, 'design-structure', $2, $3, $4)`,
      [slug, kind, language, framework]
    );
  await assert.rejects(() => ins('c1', 'foundation', 'java', null));
  await assert.rejects(() => ins('c2', 'language', null, null));
  await assert.rejects(() => ins('c3', 'framework', null, 'spring boot'));
  await assert.rejects(() => ins('c4', 'language', 'Java', null));
  await ins('c-ok-lang', 'language', 'java', null);
  await ins('c-ok-fw', 'framework', 'java', 'spring boot');
});

test('the concept graph rejects bad edges and cycles', async () => {
  const id = (slug) => idOf('concept', 'slug', slug);
  const [a, b, c] = [await id('bytes-vs-characters'), await id('explicit-charsets'), await id('decoding-across-chunks')];
  const edge = (from, to, type) =>
    db.query(`insert into concept_edge (from_concept_id, to_concept_id, type) values ($1, $2, $3)`, [from, to, type]);
  await assert.rejects(() => edge(a, a, 'prerequisite'));
  const [lo, hi] = a < b ? [a, b] : [b, a];
  await assert.rejects(() => edge(hi, lo, 'related'));
  await edge(lo, hi, 'related');
  await assert.rejects(() => edge(c, a, 'prerequisite'), /cycle/);
  await assert.rejects(() => edge(b, a, 'prerequisite'), /cycle/);
});

test('learner and enrollment rules', async () => {
  const l = await newLearner();
  const ch = await idOf('challenge', 'slug', 'challenge-wc');
  const enrollWith = (cols, vals) =>
    db.query(`insert into enrollment (learner_id, challenge_id, ${cols}) values ($1, $2, ${vals})`, [l, ch]);
  await assert.rejects(() => enrollWith('framework', `'spring boot'`));
  await assert.rejects(() => enrollWith('repo_url', `'https://github.com/a/b'`));
  await assert.rejects(() => enrollWith('language, repo_url', `'java', 'https://example.com/a/b'`));
  await assert.rejects(() => enrollWith('language', `'Java'`));
  await enrollWith('language, framework, repo_url', `'java', 'spring boot', 'https://github.com/a/b'`);
  await assert.rejects(() => enrollWith('language', `'java'`), /unique|duplicate/i);

  await db.query(`insert into learner (email) values ('Ada@Example.com')`);
  await fails(`insert into learner (email) values ('ada@example.com')`, [], /unique|duplicate/i);
  await fails(`insert into learner (email) values ('not-an-email')`);
  await db.query(`insert into learner (display_name) values (null)`);
});

test('answer rules', async () => {
  const l = await newLearner();
  const e = await enroll(l);
  const task = await idOf('task', 'kind', 'predict');
  const question = await one(`select id from question order by position limit 1`);
  const ins = (kind, taskId, questionId, extra) =>
    db.query(
      `insert into answer (enrollment_id, kind, task_id, question_id, body ${extra ? ', ' + extra.cols : ''})
       values ($1, $2, $3, $4, 'text' ${extra ? ', ' + extra.vals : ''})`,
      [e, kind, taskId, questionId]
    );
  await assert.rejects(() => ins('think', task, question.id));
  await assert.rejects(() => ins('gate', task, question.id));
  await assert.rejects(() => ins('gate', null, null));
  await assert.rejects(() => ins('reflection', null, null, { cols: 'grade, graded_by', vals: `'met', 'key'` }));
  await assert.rejects(() => ins('think', task, null, { cols: 'grade', vals: `'met'` }));
  await assert.rejects(() => ins('gate', null, question.id, { cols: 'grade, graded_by', vals: `'met', 'model'` }));
  await assert.rejects(() => db.query(`insert into answer (enrollment_id, kind, body) values ($1, 'restate', '   ')`, [e]));
  await ins('think', task, null);
  await assert.rejects(() => ins('think', task, null), /unique|duplicate/i);
  await db.query(`insert into answer (enrollment_id, kind, task_id, attempt, body) values ($1, 'think', $2, 2, 'again')`, [e, task]);
});

test('the event log is append-only', async () => {
  const l = await newLearner();
  const e = await enroll(l);
  const ev = await one(`insert into event (learner_id, enrollment_id, type) values ($1, $2, 'enrolled') returning id`, [l, e]);
  await fails(`update event set payload = '{"x":1}' where id = $1`, [ev.id], /append-only/);
  await fails(`delete from event where id = $1`, [ev.id], /append-only/);
  await fails(`truncate event`, [], /append-only/);
  await fails(`insert into event (learner_id, type) values ($1, 'not_a_type')`, [l]);
  await db.exec(`begin; set local app.allow_event_delete = 'on'; delete from event where id = ${ev.id}; commit;`);
  assert.equal((await one(`select count(*)::int n from event where id = $1`, [ev.id])).n, 0);
});

test('milestone progress is computed from step state and met answers', async () => {
  const l = await newLearner();
  const e = await enroll(l);
  const steps = await rows(
    `select s.id from step s join milestone m on m.id = s.milestone_id
       join challenge c on c.id = m.challenge_id and c.slug = 'challenge-wc' order by s.position`);
  const [question] = await rows(`select id from question order by position`);
  for (const s of steps.slice(0, 2)) {
    await db.query(`insert into step_state (enrollment_id, step_id, status) values ($1, $2, 'done')`, [e, s.id]);
  }
  const answer = async (qid, grade, attempt, followup = null) => {
    const rubric = json((await one(`select rubric from question where id = $1`, [qid])).rubric);
    const metCount = grade === 'met' ? rubric.length : grade === 'partial' ? 1 : 0;
    await db.query(
      `insert into answer (enrollment_id, kind, question_id, attempt, body, grade, graded_by, model, followup_of, points)
       values ($1, 'gate', $2, $3, 'one two three four', $4, 'model', 'test-model', $5, $6)`,
      [e, qid, attempt, grade, followup, JSON.stringify(modelPoints(rubric, metCount, 'one two'))]
    );
  };

  await answer(question.id, 'partial', 1);
  let p = await one(`select * from v_milestone_progress where enrollment_id = $1`, [e]);
  assert.deepEqual([p.steps_total, p.steps_done, p.gate_total, p.gate_met, p.understood], [3, 2, 1, 0, false]);

  const first = await one(`select id from answer where question_id = $1`, [question.id]);
  await answer(question.id, 'met', 2, first.id);
  p = await one(`select * from v_milestone_progress where enrollment_id = $1`, [e]);
  assert.deepEqual([p.gate_met, p.understood], [1, false], 'a met teach-back does not close the milestone while a step is open');
  await db.query(`insert into step_state (enrollment_id, step_id, status) values ($1, $2, 'done')`, [e, steps[2].id]);
  p = await one(`select * from v_milestone_progress where enrollment_id = $1`, [e]);
  assert.equal(p.understood, true);
  assert.equal(gradeFor(1, 2), 'partial');
});

test('a concept explained in one project shows as explained in another', async () => {
  const l = await newLearner();
  const other = await scratchChallenge();
  const concept = await idOf('concept', 'slug', 'streaming-constant-memory');
  await db.query(`insert into milestone_concept (milestone_id, concept_id) values ($1, $2)`, [other.milestoneId, concept]);
  await db.query(`insert into concept_state (learner_id, concept_id, explained_at) values ($1, $2, now())`, [l, concept]);
  const e = await enroll(l, other.slug);
  const result = await rows(
    `select c.slug, coalesce(cs.status, 'new') as status
       from enrollment en
       join v_challenge_concept vc on vc.challenge_id = en.challenge_id
       join concept c on c.id = vc.concept_id
       left join concept_state cs on cs.concept_id = c.id and cs.learner_id = en.learner_id
      where en.id = $1`,
    [e]
  );
  assert.deepEqual(result, [{ slug: 'streaming-constant-memory', status: 'explained' }]);
});

const prerequisitesOf = `
  with recursive up (id) as (
    select e.from_concept_id from concept_edge e
      join concept c on c.id = e.to_concept_id
     where c.slug = $1 and e.type = 'prerequisite'
    union
    select e.from_concept_id from concept_edge e join up on e.to_concept_id = up.id
     where e.type = 'prerequisite'
  )
  select c.slug from up join concept c on c.id = up.id order by c.slug`;

test('all prerequisites of a concept, by recursion', async () => {
  const result = await rows(prerequisitesOf, ['decoding-across-chunks']);
  assert.deepEqual(
    result.map((r) => r.slug),
    ['bytes-vs-characters', 'explicit-charsets', 'stream-read-contract']
  );
});

test('suggested next concepts follow explained prerequisites', async () => {
  const l = await newLearner();
  const suggest = async () =>
    (await rows(
      `select c.slug from concept c
         left join concept_state cs on cs.concept_id = c.id and cs.learner_id = $1
        where c.kind = 'foundation'
          and coalesce(cs.status, 'new') not in ('explained', 'applied')
          and not exists (
            select 1 from concept_edge e
              left join concept_state ps on ps.concept_id = e.from_concept_id and ps.learner_id = $1
             where e.to_concept_id = c.id and e.type = 'prerequisite'
               and coalesce(ps.status, 'new') not in ('explained', 'applied'))
        order by c.slug`,
      [l]
    )).map((r) => r.slug);

  assert.deepEqual(await suggest(), ['bytes-vs-characters', 'stdin-vs-file', 'stream-read-contract']);
  const concept = await idOf('concept', 'slug', 'bytes-vs-characters');
  await db.query(`insert into concept_state (learner_id, concept_id, explained_at) values ($1, $2, now())`, [l, concept]);
  assert.deepEqual(await suggest(), ['explicit-charsets', 'stdin-vs-file', 'stream-read-contract']);
});

test('stuck detection compares active time with the step estimate', async () => {
  const l = await newLearner();
  const e = await enroll(l);
  const steps = await rows(`select id from step order by position`);
  await db.query(`insert into step_state (enrollment_id, step_id, status, active_seconds) values ($1, $2, 'in_progress', 1000)`, [e, steps[0].id]);
  await db.query(`insert into step_state (enrollment_id, step_id, status, active_seconds) values ($1, $2, 'in_progress', 300)`, [e, steps[1].id]);
  const stuck = await rows(
    `select ss.step_id from step_state ss join step s on s.id = ss.step_id
      where ss.enrollment_id = $1 and ss.status = 'in_progress' and ss.active_seconds > s.est_minutes * 60`,
    [e]
  );
  assert.deepEqual(stuck.map((r) => r.step_id), [steps[0].id]);
});

test('the help log view lists help events', async () => {
  const l = await newLearner();
  const e = await enroll(l);
  const step = await one(`select id from step order by position limit 1`);
  await db.query(
    `insert into event (learner_id, enrollment_id, type, step_id, payload) values
       ($1, $2, 'help_offered', $3, '{"level":"hint"}'),
       ($1, $2, 'step_started', $3, '{}'),
       ($1, $2, 'help_given',   $3, '{"level":"hint"}')`,
    [l, e, step.id]
  );
  const log = await rows(`select type, level from v_help_log where enrollment_id = $1`, [e]);
  assert.deepEqual(log.map((r) => r.type).sort(), ['help_given', 'help_offered']);
});

test('spend can be summed per day and per client, across guest IDs', async () => {
  const insertLearner = async (hash) =>
    (await one(`insert into learner (client_hash) values ($1) returning id`, [hash])).id;
  const [a, b, c] = [await insertLearner('client-1'), await insertLearner('client-1'), await insertLearner('client-2')];
  for (const [l, usd] of [[a, '0.0123'], [b, '0.0050'], [c, '0.0010']]) {
    await db.query(
      `insert into llm_usage (learner_id, purpose, provider, model, input_tokens, output_tokens, cost_usd)
       values ($1, 'grade', 'anthropic', 'm', 1000, 200, $2)`,
      [l, usd]
    );
  }
  const perClient = await rows(
    `select l.client_hash, sum(u.cost_usd)::float8 as usd
       from llm_usage u join learner l on l.id = u.learner_id
      where u.created_at >= date_trunc('day', now()) and l.client_hash is not null
      group by l.client_hash order by l.client_hash`
  );
  assert.equal(perClient[0].client_hash, 'client-1');
  assert.ok(Math.abs(perClient[0].usd - 0.0173) < 1e-9, 'two guest IDs from one client are added together');
  assert.ok(Math.abs(perClient[1].usd - 0.001) < 1e-9);
});
