import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readContent, validate, checkContent, summarise, codeSign, AREAS, dropInvalidProjects } from '../scripts/import-content.mjs';
import { recipes } from '../support/recipes.mjs';

// Every project file is format 3 (CONTENT_FORMAT.md, The learning model): a learning map of concepts with lessons,
// references and explain-backs, and a build plan of steps with one outcome each. Format 3 has no keyed quizzes,
// so there are no answer keys and no proof scripts to run.
const content = readContent();
const { skipped } = dropInvalidProjects(content);
const base = await checkContent(content);
after(() => base.db?.close());

const copy = () => structuredClone(content);
const errorsFor = (mutate) => {
  const c = copy();
  mutate(c);
  return validate(c).errors.join('\n');
};
const projectOf = (c, slug) => c.projects.find((p) => p.data.project.slug === slug).data;
const wc = (c) => projectOf(c, 'challenge-wc');
const web = (c) => projectOf(c, 'challenge-webserver');
const concept = (c, slug) => c.catalogue.concepts.find((x) => x.slug === slug);

test('every content file validates as format 3 and everything loads into the database', () => {
  assert.deepEqual(skipped, [], 'no project file is left out');
  assert.deepEqual(base.errors, []);
  assert.equal(base.ok, true);
  assert.ok(content.projects.every((p) => p.data.format === 3), 'every project is format 3');
  const s = base.summary;
  assert.equal(s.generatedProjects + s.reviewedProjects, content.projects.length);
  assert.equal(s.concepts, content.catalogue.concepts.length);
  assert.equal(s.thinkTasks, 0, 'no keyed quizzes');
  assert.equal(s.teachBacks, 0, 'explain-backs live on the learning map');
  assert.equal(s.buildTasks, s.steps, 'every step has a build');
  assert.equal(base.keys.length, 0, 'no answer keys, so nothing to prove');
});

test('every learning-map concept has a lesson and at least 2 references, and every step concept is on the map', () => {
  const problems = [];
  for (const { data } of content.projects) {
    const slug = data.project.slug;
    const map = new Set(data.learning_map.map((x) => x.concept));
    for (const x of data.learning_map) {
      const c = concept(content, x.concept);
      if (!(c?.lesson?.how_it_works?.length > 400)) problems.push(`${slug}: ${x.concept} has no full lesson`);
      if ((c?.resources ?? []).length < 2) problems.push(`${slug}: ${x.concept} has fewer than 2 references`);
      if (!(x.explain_back.rubric.length >= 2 && x.explain_back.rubric.length <= 4)) problems.push(`${slug}: ${x.concept} rubric size`);
    }
    for (const m of data.milestones) for (const st of m.steps) {
      for (const c of st.concepts) if (!map.has(c)) problems.push(`${slug}: step ${st.title} uses ${c}, not on the map`);
      if (!st.outcome || !st.build) problems.push(`${slug}: step ${st.title} needs a build and an outcome`);
    }
  }
  assert.deepEqual(problems, []);
});

test('the worked examples, wc and the web server, load with the expected shape', async () => {
  for (const slug of ['challenge-wc', 'challenge-webserver']) {
    const d = projectOf(content, slug);
    const q = async (sql) => (await base.db.query(sql, [slug])).rows[0];
    const ch = await q(`select content_format, done_when, reference_tool, open_checks, primer -> 'words' -> 0 ->> 'term' as word from challenge where slug = $1`);
    assert.equal(ch.content_format, 3);
    assert.ok(ch.done_when.length > 20, `${slug} done_when`);
    assert.equal(ch.word, d.project.primer.words[0].term);
    assert.deepEqual(ch.open_checks, (d.project.open_checks ?? []).map((x) => x.trim()));
    const map = await q(`select count(*)::int as n, min(position) as first from project_concept pc join challenge c on c.id = pc.challenge_id where c.slug = $1`);
    assert.deepEqual([map.n, map.first], [d.learning_map.length, 1]);
    const steps = await q(`select count(*)::int as n, count(*) filter (where s.outcome is not null)::int as with_outcome
      from step s join milestone m on m.id = s.milestone_id join challenge c on c.id = m.challenge_id where c.slug = $1`);
    const n = d.milestones.flatMap((m) => m.steps).length;
    assert.deepEqual([steps.n, steps.with_outcome], [n, n]);
    const links = await q(`select count(*)::int as n from step_concept sc join step s on s.id = sc.step_id join milestone m on m.id = s.milestone_id
      join challenge c on c.id = m.challenge_id where c.slug = $1`);
    assert.equal(links.n, d.milestones.flatMap((m) => m.steps).reduce((a, st) => a + st.concepts.length, 0));
    const mc = await q(`select count(*)::int as n from milestone_concept mc join milestone m on m.id = mc.milestone_id join challenge c on c.id = m.challenge_id where c.slug = $1`);
    assert.equal(mc.n, d.milestones.reduce((a, m) => a + new Set(m.steps.flatMap((st) => st.concepts)).size, 0), 'milestone concepts are the union of their steps');
  }
  const opened = (await base.db.query(`select count(*)::int as n from resource where opened`)).rows[0].n;
  assert.ok(opened > 0, 'opened references are marked');
});

test('validation catches broken content, with a message that says where and what', () => {
  const cases = [
    [(c) => delete web(c).project.primer, /primer is required/],
    [(c) => (web(c).project.primer.words = []), /1 to 6 terms/],
    [(c) => (web(c).project.primer.example = 'Run `curl localhost`.'), /primer.example contains a backtick/],
    [(c) => (web(c).project.figure = { kind: 'spiral' }), /figure.kind must be one of/],
    [(c) => (web(c).milestones[0].steps[0].hints.hint = 'Try count = len(files) first.'), /hints.hint contains/],
    [(c) => (web(c).learning_map[0].explain_back.rubric[1].id = web(c).learning_map[0].explain_back.rubric[0].id), /must be unique/],
    [(c) => (web(c).milestones[0].steps[0].minutes = 90), /minutes must be a whole number from 5 to 60/],
    [(c) => (web(c).milestones[0].steps[0].concepts = []), /concepts needs 1 to 3 slugs/],
    [(c) => (web(c).learning_map = web(c).learning_map.slice(0, 2)), /learning_map needs 3 to 12 concepts/],
    [(c) => (web(c).milestones[0].teach_back = { prompt: 'x' }), /explain-backs live on the learning map/],
    [(c) => (web(c).project.open_checks = ['a', 'b', 'c', 'd', 'e', 'f', 'g']), /0 to 6 lines/],
    [(c) => (concept(c, web(c).learning_map[0].concept).superseded_by = 'text-encoding-utf8'), /superseded by/],
  ];
  for (const [mutate, expected] of cases) assert.match(errorsFor(mutate), expected, String(mutate));
});

test('imported content drives the web server through the v3 rules: outcomes build it, explain-backs make it understood', async () => {
  const r = await checkContent({ ...content, projects: content.projects.filter((p) => p.data.project.slug === 'challenge-webserver') });
  const { db } = r;
  const app = recipes(db);
  const rows = async (sql, params) => (await db.query(sql, params)).rows;
  const l = (await rows(`insert into learner (display_name) values ('Ada') returning id`))[0].id;
  const e = await app.enroll(l, 'challenge-webserver', { language: 'java' });
  const [m1] = await rows(`select m.id from milestone m join challenge c on c.id = m.challenge_id where c.slug = 'challenge-webserver' and m.position = 1`);
  const steps = await rows(`select id from step where milestone_id = $1 order by position`, [m1.id]);
  for (const st of steps) await app.outcomeMet(l, e, st.id);
  let [p] = await rows(`select * from v_milestone_progress where enrollment_id = $1 and milestone_id = $2`, [e, m1.id]);
  assert.deepEqual([p.built, p.understood], [true, false]);
  const applied = await rows(`select count(*)::int as n from concept_state where learner_id = $1 and applied_at is not null`, [l]);
  assert.ok(applied[0].n > 0, 'concepts used by done steps are applied');

  const pcs = await rows(
    `select pc.id, pc.explain_rubric from project_concept pc join milestone_concept mc on mc.concept_id = pc.concept_id
      where mc.milestone_id = $1 and pc.challenge_id = (select challenge_id from milestone where id = $1)`, [m1.id]
  );
  const body = 'A socket is accepted, the bytes are read until the request ends, and the server writes a response back.';
  for (const pc of pcs) {
    const rubric = typeof pc.explain_rubric === 'string' ? JSON.parse(pc.explain_rubric) : pc.explain_rubric;
    const bad = rubric.map((x) => ({ id: x.id, met: true, quote: 'words that are not in the answer' }));
    await assert.rejects(() => app.explainBack(l, e, pc.id, body, { points: bad }), /quote/, 'grading integrity applies to explain-backs');
    const good = rubric.map((x) => ({ id: x.id, met: true, quote: 'the server writes a response back' }));
    assert.equal((await app.explainBack(l, e, pc.id, body, { points: good, model: 'test' })).grade, 'met');
  }
  [p] = await rows(`select * from v_milestone_progress where enrollment_id = $1 and milestone_id = $2`, [e, m1.id]);
  assert.deepEqual([p.built, p.understood], [true, true]);
  const explained = await rows(`select count(*)::int as n from concept_state where learner_id = $1 and explained_at is not null`, [l]);
  assert.equal(explained[0].n, pcs.length);

  await assert.rejects(() => db.exec(r.sql), /frozen/, 'a project with learners keeps its curriculum');
  await db.exec('rollback');
  await db.close();
});

test('the area list in the importer matches the database', async () => {
  const rows = (await base.db.query(`select slug from concept_area order by sort_order`)).rows.map((r) => r.slug);
  assert.deepEqual(rows, AREAS);
});

test('code signs are caught in words meant for a learner, and ordinary prose passes', () => {
  for (const code of [
    'Use `split` here',
    'if a == b then stop',
    'call base.resolve(name) first',
    'print(total);',
    'path = "backups/" + name',
    'const total = 0',
    'wrap it in <p> tags',
    'the arrow => means map',
  ]) {
    assert.ok(codeSign(code), code);
  }
  for (const prose of [
    'A read can hand back fewer bytes than the buffer holds (the count says how many).',
    'Use Path.resolve and then Path.normalize, as the Javadoc describes.',
    'Is 5 < 6? Write &lt; for the less-than sign.',
    'Fill {{ Title }} with the first heading.',
    'Name = Sam, and the note says hello.',
    'Comments in C++ and Go start with two slashes.',
  ]) {
    assert.equal(codeSign(prose), null, prose);
  }
});

test('content v3: validation enforces the learning map, outcomes and concept tags', () => {
  const cases = [
    [(c) => delete wc(c).milestones[0].steps[0].outcome, /outcome is required/],
    [(c) => delete wc(c).milestones[0].steps[0].build, /build is required/],
    [(c) => wc(c).milestones[0].steps[0].concepts.push('no-such-concept'), /concept no-such-concept is not on the learning map/],
    [(c) => (wc(c).milestones[0].steps[0].think = { kind: 'explain' }), /format 3 has no Think tasks/],
    [(c) => (wc(c).learning_map[0].explain_back.rubric = [{ id: 'e1', point: 'x' }]), /2 to 4 points/],
    [(c) => delete wc(c).project.done_when, /done_when is required/],
    [(c) => wc(c).learning_map.push({ ...wc(c).learning_map[0] }), /appears twice/],
    [(c) => (wc(c).format = 4), /format must be 1, 2 or 3/],
    [(c) => delete concept(c, 'grapheme-clusters').lesson, /has no lesson/],
  ];
  for (const [mutate, expected] of cases) assert.match(errorsFor(mutate), expected, String(mutate));
});

test('lessons load into the database with a shape check', async () => {
  const { rows } = await base.db.query(`select lesson -> 'misconceptions' ->> 0 as first from concept where slug = 'utf16-code-units'`);
  assert.match(rows[0].first, /UTF-16/);
  await assert.rejects(
    () => base.db.query(`update concept set lesson = '{"how_it_works": "x", "examples": []}' where slug = 'utf16-code-units'`),
    /check/i
  );
});

test('the database rejects what the validator cannot see, such as a prerequisite cycle', async () => {
  const c = copy();
  const charsets = c.catalogue.concepts.find((x) => x.slug === 'explicit-charsets');
  charsets.prerequisites = ['bytes-vs-characters', 'decoding-across-chunks'];
  assert.deepEqual(validate(c).errors, [], 'the validator does not follow chains');
  const r = await checkContent(c);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /prerequisite cycle/);
  await r.db.close();
});

test('importing the same files twice changes nothing', async () => {
  const before = JSON.stringify(await summarise(base.db));
  await base.db.exec(base.sql);
  assert.equal(JSON.stringify(await summarise(base.db)), before);
});
