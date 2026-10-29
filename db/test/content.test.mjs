import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readContent, validate, check, checkContent, checkProofs, onlyProjects, summarise, codeSign, AREAS } from '../scripts/import-content.mjs';
import { recipes } from '../support/recipes.mjs';
import { keyMatches, numbersIn } from '../support/matching.mjs';

const base = await check();
const content = readContent();
after(() => base.db?.close());

// Most cases mutate the static site generator, the worked example in CONTENT_FORMAT.md.
const ssgIndex = content.projects.findIndex((p) => p.data.project.slug === 'challenge-ssg');
const copy = () => structuredClone(content);
const errorsFor = (mutate) => {
  const c = copy();
  mutate(c);
  return validate(c).errors.join('\n');
};
const project = (c) => c.projects[ssgIndex].data;
const milestone = (c, i = 0) => project(c).milestones[i];
const step = (c, mi = 0, si = 0) => milestone(c, mi).steps[si];
const teachBack = (c, i = 0) => milestone(c, i).teach_back;

test('every content file validates, every key is proven, and everything loads into the database', () => {
  assert.deepEqual(base.errors, []);
  assert.equal(base.ok, true);
  assert.equal(base.warnings.length, 0, base.warnings.join('\n'));
  const s = base.summary;
  assert.equal(s.generatedProjects + s.reviewedProjects, content.projects.length);
  assert.equal(s.concepts, content.catalogue.concepts.length);
  assert.equal(s.thinkTasks, s.steps, 'one think task per step');
  assert.equal(s.teachBacks, s.milestones, 'one teach-back per milestone');
  assert.ok(base.keys.length > 0 && base.keys.every((k) => k.proof?.ok && k.derivation.length > 20));
});

test('the worked example loads with the expected shape', async () => {
  const r = await checkContent(onlyProjects(content, ['challenge-ssg']));
  assert.deepEqual(r.errors, []);
  const { concepts, ...rest } = r.summary;
  assert.deepEqual(rest, {
    reviewedProjects: 0,
    generatedProjects: 1,
    milestones: 3,
    steps: 10,
    thinkTasks: 10,
    buildTasks: 10,
    hints: 20,
    teachBacks: 3,
    resources: rest.resources,
    languageNotes: 3,
  });
  assert.equal(r.keys.length, 6);
  const { rows } = await r.db.query(
    `select m.position, e.est_minutes, c.figure_kind, c.primer -> 'words' -> 0 ->> 'term' as first_word
       from milestone m join v_milestone_estimate e on e.milestone_id = m.id
       join challenge c on c.id = m.challenge_id and c.slug = 'challenge-ssg' order by m.position`
  );
  assert.deepEqual(rows.map((x) => x.est_minutes), [30, 60, 60]);
  assert.equal(rows[0].figure_kind, 'pages');
  assert.equal(rows[0].first_word, 'Markdown');
  await r.db.close();
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

test('validation catches broken content, with a message that says where and what', () => {
  const cases = [
    [(c) => delete milestone(c).teach_back, /teach_back is required/],
    [(c) => (milestone(c).gate = []), /gate was replaced by teach_back/],
    [(c) => teachBack(c).rubric.splice(2), /3 to 4 points/],
    [(c) => (teachBack(c).rubric = [1, 2, 3, 4, 5].map((n) => ({ id: `t${n}`, concept: 'untrusted-paths', point: 'x' }))), /3 to 4 points/],
    [(c) => (teachBack(c).rubric[1].id = 't1'), /must be unique/],
    [(c) => delete teachBack(c).rubric[0].concept, /point t1 needs a concept/],
    [(c) => (teachBack(c).rubric[0].concept = 'markup-to-html'), /tagged markup-to-html, which is not in the milestone's concepts/],
    [(c) => (teachBack(c).rubric[0].concept = 'untrusted-paths'), /no point is tagged site-directory-layout/],
    [(c) => milestone(c).concepts.push('no-such-concept'), /unknown concept no-such-concept/],
    [(c) => delete project(c).project.primer, /primer is required/],
    [(c) => delete project(c).project.primer.why, /primer.why is required/],
    [(c) => (project(c).project.primer.words = []), /1 to 6 terms/],
    [(c) => (project(c).project.primer.example = 'Run `init mysite`.'), /primer.example contains a backtick/],
    [(c) => (project(c).project.figure = { kind: 'spiral' }), /figure.kind must be one of/],
    [(c) => (step(c).hints.hint = 'Try count = len(files) first.'), /hints.hint contains/],
    [(c) => (step(c).hints.example = 'if name == "x" then stop'), /hints.example contains a code operator/],
    [(c) => (c.catalogue.concepts.find((x) => x.language_notes).language_notes[0].body = 'Call `Path.of("a")`.'), /java note contains/],
    [(c) => delete step(c).think.key.derivation, /derivation is required/],
    [(c) => (step(c).think.key.match = 'regex'), /key.match must be one of/],
    [(c) => (step(c).think.key.expected = 'three'), /number_exact needs a number/],
    [(c) => (step(c, 0, 1).think.key = { match: 'number_exact', expected: 1, derivation: 'x' }), /graded by rubric, so it has no key/],
    [(c) => delete step(c, 0, 1).think.snippet, /needs a snippet/],
    [(c) => (step(c).minutes = 90), /minutes must be a whole number from 5 to 60/],
    [(c) => delete step(c).hints.hint, /hints.hint is required/],
    [(c) => (project(c).project.status = 'reviewed'), /reviewed_by and reviewed_on/],
    [(c) => (project(c).project.source_url = 'https://example.com/x'), /source_url must be/],
    [(c) => (c.catalogue.concepts[0].area = 'security'), /area must be one of/],
    [(c) => (c.catalogue.concepts[1].prerequisites = ['nope']), /unknown concept nope/],
    [(c) => (c.catalogue.concepts.find((x) => x.kind === 'foundation').language = 'java'), /no language or framework|foundation/],
  ];
  for (const [mutate, expected] of cases) {
    assert.match(errorsFor(mutate), expected, String(mutate));
  }
  assert.equal(errorsFor((c) => delete step(c).hints.example), '', 'the example hint is optional');
});

// Numbers as a learner might dictate them, up to 9999.
const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const inWords = (n) => {
  if (n < 20) return SMALL[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${SMALL[n % 10]}` : '');
  if (n < 1000) return `${SMALL[Math.floor(n / 100)]} hundred${n % 100 ? ` and ${inWords(n % 100)}` : ''}`;
  return `${inWords(Math.floor(n / 1000))} thousand${n % 1000 ? ` and ${inWords(n % 1000)}` : ''}`;
};
const spaced = (s) => s.toUpperCase().replace(/([,/])/g, ' $1 ');

test('every key accepts natural correct answers and rejects an obvious guess list', () => {
  const failures = [];
  for (const k of base.keys) {
    const context = `${k.prompt}\n${k.snippet ?? ''}`;
    const restated = `Going by the question, which mentions ${numbersIn(context).map((n) => n.value).join(', ') || 'no numbers'}, `;
    const expected = [].concat(k.expected);
    let right;
    let wrong;
    if (k.match === 'text_ci') {
      right = [`It is ${spaced(k.expected)}.`, `"${k.expected}"`];
      wrong = [`${k.expected} or something else entirely`, 'I am not sure'];
    } else if (k.match === 'number_exact') {
      right = [`I think it is ${k.expected}.`, `I think it is ${inWords(k.expected)}.`, `${restated}my answer is ${k.expected}.`];
      const top = Math.max(30, k.expected + 3);
      wrong = [Array.from({ length: top + 1 }, (_, i) => i).join(', '), `${k.expected} or ${k.expected + 1}`];
    } else {
      right = [
        `First ${expected.join(', then ')}.`,
        `First ${expected.map(inWords).join(', then ')}.`,
        `${restated}my answers are ${expected.join(' and ')}.`,
      ];
      const top = Math.max(30, ...expected) + 3;
      wrong = [Array.from({ length: top + 1 }, (_, i) => i).join(' ')];
      if (expected.length > 1 && new Set(expected).size === expected.length) wrong.push(`First ${[...expected].reverse().join(', then ')}.`);
    }
    for (const a of right) if (!keyMatches(k, a, context)) failures.push(`${k.where}: should pass: ${a}`);
    for (const a of wrong) if (keyMatches(k, a, context)) failures.push(`${k.where}: should fail: ${a.slice(0, 80)}`);
  }
  assert.deepEqual(failures, []);
  assert.ok(base.keys.length > 100, 'every project file was read');
});

// Content v2 (concept-first): the worked example is wc.
const wcIndex = content.projects.findIndex((p) => p.data.project.slug === 'challenge-wc');
const wc = (c) => c.projects[wcIndex].data;
const concept = (c, slug) => c.catalogue.concepts.find((x) => x.slug === slug);

test('content v2: wc is concept-first, and every concept it uses has a full lesson', () => {
  assert.equal(wc(content).format, 2);
  const used = new Set(wc(content).milestones.flatMap((m) => m.concepts));
  for (const slug of used) {
    const l = concept(content, slug).lesson;
    assert.ok(l?.how_it_works?.length > 400, `${slug} has a lesson`);
    for (const field of ['examples', 'misconceptions', 'elsewhere']) assert.ok(l[field].length >= 1, `${slug} ${field}`);
  }
  assert.ok(wc(content).milestones.some((m) => m.concepts.length < 3), 'a v2 milestone can be one tight group of concepts');
});

test('content v2: validation enforces lessons and superseded concepts, and flags made-up-input prompts', () => {
  const cases = [
    [(c) => delete concept(c, 'grapheme-clusters').lesson, /concept grapheme-clusters has no lesson/],
    [(c) => (wc(c).milestones[0].concepts.push('bytes-vs-characters')), /superseded by text-encoding-utf8/],
    [(c) => (concept(c, 'io-buffering').lesson.examples = []), /lesson.examples needs 1 to 5 entries/],
    [(c) => (concept(c, 'io-buffering').lesson.misconceptions[0] = 'Call `read` once.'), /lesson.misconceptions 1 contains a backtick/],
    [(c) => (concept(c, 'bytes-vs-characters').superseded_by = 'no-such-concept'), /superseded_by names unknown concept/],
    [(c) => (wc(c).format = 3), /format must be 1 or 2/],
    [(c) => (milestone(c).concepts = ['site-directory-layout']), /a milestone covers 3 to 4 concepts/],
  ];
  for (const [mutate, expected] of cases) assert.match(errorsFor(mutate), expected, String(mutate));

  const c = copy();
  wc(c).milestones[0].steps[0].think.prompt = 'A file holds h, i and a newline. What does ccwc -c report?';
  const flags = validate(c).flags.filter((f) => f.project === 'challenge-wc');
  assert.ok(flags.some((f) => f.id === '1.1'), 'the rejected v1 style of question is flagged for a person');
});

test('content v2: lessons load into the database with a shape check', async () => {
  const { rows } = await base.db.query(`select lesson -> 'misconceptions' ->> 0 as first from concept where slug = 'utf16-code-units'`);
  assert.match(rows[0].first, /UTF-16/);
  await assert.rejects(
    () => base.db.query(`update concept set lesson = '{"how_it_works": "x", "examples": []}' where slug = 'utf16-code-units'`),
    /check/i
  );
});

test('a key that its proof does not support fails the check, and so does a key with no proof', async () => {
  const { keys } = validate(copy());
  const ssgKeys = keys.filter((k) => k.project === 'challenge-ssg');
  assert.deepEqual(await checkProofs({ keys: ssgKeys, dir: content.dir }), []);

  const wrong = structuredClone(ssgKeys);
  wrong[0].expected = 4;
  assert.match((await checkProofs({ keys: wrong, dir: content.dir })).join('\n'), /proof returned 3 but the key expects 4/);

  const extra = [...structuredClone(ssgKeys), { ...ssgKeys[0], id: '9.9', where: 'x' }];
  assert.match((await checkProofs({ keys: extra, dir: content.dir })).join('\n'), /no proof for step 9.9/);

  const unknown = [{ ...ssgKeys[0], project: 'challenge-nothing' }];
  assert.match((await checkProofs({ keys: unknown, dir: content.dir })).join('\n'), /challenge-nothing.mjs: missing/);
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

test('imported content drives a milestone through the write recipes, and the teach-back explains its concepts', async () => {
  const r = await checkContent(onlyProjects(content, ['challenge-ssg']));
  const { db } = r;
  const app = recipes(db);
  const learner = (await db.query(`insert into learner (display_name) values ('Ada') returning id`)).rows[0].id;
  const e = await app.enroll(learner, 'challenge-ssg', { language: 'java' });
  const ids = async (sql) => (await db.query(sql)).rows.map((x) => x.id);
  const steps = await ids(
    `select s.id from step s join milestone m on m.id = s.milestone_id
       join challenge c on c.id = m.challenge_id and c.slug = 'challenge-ssg' where m.position = 1 order by s.position`
  );
  const [question] = await ids(
    `select q.id from question q join milestone m on m.id = q.milestone_id
       join challenge c on c.id = m.challenge_id and c.slug = 'challenge-ssg' where m.position = 1`
  );

  assert.equal(await app.thinkAnswer(learner, e, steps[0], '3 files in total'), 'met', 'a predict task graded by its key');
  assert.equal(await app.thinkAnswer(learner, e, steps[1], 'The page name escapes the folder, and an unknown command still exits with success.'), 'met');
  const result = await app.gateAnswer(learner, e, question,
    'Content holds what the author writes, an unknown command exits non-zero, and the page path is checked to stay inside the folder.');
  assert.equal(result.grade, 'met');
  const explained = (await db.query(
    `select c.slug from concept_state cs join concept c on c.id = cs.concept_id where cs.learner_id = $1 and cs.status = 'explained' order by 1`,
    [learner]
  )).rows.map((x) => x.slug);
  assert.deepEqual(explained, ['cli-subcommands', 'site-directory-layout', 'untrusted-paths']);
  const p = (await db.query(`select * from v_milestone_progress where enrollment_id = $1 and steps_total = 2`, [e])).rows[0];
  assert.equal(p.understood, true);

  const hints = (await db.query(`select h.level, h.language from hint h where h.step_id = $1 order by h.level`, [steps[0]])).rows;
  assert.deepEqual(hints, [{ level: 'example', language: '' }, { level: 'hint', language: '' }]);

  await assert.rejects(() => db.exec(r.sql), /frozen/);
  await db.exec('rollback');
  await db.close();
});
