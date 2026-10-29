// Validates content files and turns them into SQL.
//
//   node scripts/import-content.mjs --check                 validate and load into a fresh in-memory database
//   node scripts/import-content.mjs --check --verify-links  also fetch every reference link
//   node scripts/import-content.mjs --sql out.sql           also write the SQL seed (add --verify-links to record link status)
//   node scripts/import-content.mjs --check --project challenge-cut   check only these projects (comma-separated)
//   node scripts/import-content.mjs --sql seed_content.sql --skip-invalid   leave out project files with errors, report them
//
// Reads ../content/concepts.yaml and every ../content/projects/**/*.yaml. Every predict and trace
// key must be proven by a function in ../content/proofs/<slug>.mjs, which the check runs.
// The format is described in CONTENT_FORMAT.md.

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
export const DB_DIR = join(here, '..');
export const CONTENT_DIR = join(here, '..', '..', 'content');

export const AREAS = [
  'text-encodings', 'streams-io', 'formats-parsing', 'state-storage', 'process-testing',
  'design-structure', 'networking-http', 'concurrency', 'apis-backends', 'data-stores',
];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RUBRIC_ID = /^[a-z][a-z0-9]*$/;
const SOURCES = {
  coding_challenges: 'https://codingchallenges.fyi/challenges/',
  roadmap_sh: 'https://roadmap.sh/projects/',
};
const THINK_KINDS = ['predict', 'trace', 'spot_bug', 'explain'];
const MATCHES = ['number_exact', 'numbers_all', 'text_ci'];
// The landing figure kinds from design/DESIGN_SYSTEM.md section 7. The schema has the same list.
export const FIGURE_KINDS = [
  'stream', 'columns', 'match', 'sort', 'diff', 'states', 'tokens', 'tape', 'tree',
  'bits', 'hash', 'net', 'bucket', 'log', 'kv', 'short', 'pages',
];

// Hints, examples, primers and language notes are written in words (help rule 7). These catch the
// usual signs of code. A spot_bug snippet is the one place code is allowed.
const CODE_SIGNS = [
  [/`/, 'a backtick or code fence'],
  [/==|!=|&&|\|\||=>|(?<!\bC)\+\+|\+=|::/, 'a code operator such as == or =>'], // C++ the language is fine
  [/\b[A-Za-z_]\w*\.[A-Za-z_]\w*\([^()]*\)/, 'a method call such as a.b()'],
  [/\b[A-Za-z_]\w*\([^()]*\)\s*[;{]/, 'a function call ending in ; or {'],
  [/;\s*$/m, 'a line that ends in a semicolon'],
  [/^\s*[{}]\s*$/m, 'a line holding only a brace'],
  [/\b(def|function|fn|func|const|let|var)\s+\w+\s*[=(]/, 'a declaration'],
  [/\b[A-Za-z_][\w.]*\s*=\s*(["'\[{(]|\w+\()/, 'an assignment'],
  [/<\/?(script|div|span|p|h[1-6]|html|body|head|a|ul|li)\b[^>]*>/i, 'an HTML tag'],
];
export const codeSign = (text) => CODE_SIGNS.find(([re]) => re.test(String(text ?? '')))?.[1] ?? null;

// Content v2 (concept-first) bans Think tasks that only ask for the tool's output on a made-up input. Code cannot
// tell those apart for certain, so these signs flag a prompt for a person to look at; they never fail the check.
const TOY_SIGNS = [
  [/\b(what|how many|which)\b[^?]*\b(does|do|would|will|should)\b[^?]*\b(print|prints|report|reports|output|outputs|show|shows)\b/i,
    'asks what the tool prints or reports'],
  [/\b(a|the|one|your) (file|line|text|string|input|word|folder|directory|request|message|log)s? (holds|contains|reads)\b/i,
    'describes a made-up input'],
];
export const toySign = (prompt) => TOY_SIGNS.find(([re]) => re.test(String(prompt ?? '')))?.[1] ?? null;
const LESSON_LISTS = ['examples', 'misconceptions', 'elsewhere'];

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

function yamlFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? yamlFiles(path) : name.endsWith('.yaml') ? [path] : [];
  });
}

export function readContent(dir = CONTENT_DIR) {
  const catalogue = parse(readFileSync(join(dir, 'concepts.yaml'), 'utf8'));
  const projects = yamlFiles(join(dir, 'projects')).map((path) => ({
    file: relative(dir, path).replaceAll('\\', '/'),
    data: parse(readFileSync(path, 'utf8')),
  }));
  return { catalogue, projects, dir };
}

// ---------------------------------------------------------------------------
// Validation. The database checks the same rules again when the SQL runs.
// ---------------------------------------------------------------------------

export function validate({ catalogue, projects }) {
  const errors = [];
  const warnings = [];
  const keys = [];
  const flags = [];
  const e = (where, msg) => errors.push(`${where}: ${msg}`);
  const w = (where, msg) => warnings.push(`${where}: ${msg}`);
  const isText = (v) => typeof v === 'string' && v.trim().length > 0;
  const isLower = (v) => typeof v === 'string' && v === v.toLowerCase();

  const checkRubric = (where, rubric, min = 2, max = 4) => {
    if (!Array.isArray(rubric) || rubric.length < min || rubric.length > max) {
      e(where, `a rubric needs ${min} to ${max} points`);
      return false;
    }
    const seen = new Set();
    for (const point of rubric) {
      if (!RUBRIC_ID.test(point?.id ?? '')) e(where, `rubric point id "${point?.id}" must be lowercase letters and digits, starting with a letter`);
      else if (seen.has(point.id)) e(where, `rubric point ids must be unique, but ${point.id} repeats`);
      else seen.add(point.id);
      if (!isText(point?.point)) e(where, `rubric point ${point?.id} has no text`);
    }
    return true;
  };
  const noCode = (where, field, text) => {
    const sign = codeSign(text);
    if (sign) e(where, `${field} contains ${sign}. Hints, examples and the primer use words, not code`);
  };

  // ---- the concept catalogue ----
  const slugs = new Map();
  if (catalogue?.format !== 1) e('concepts.yaml', 'format must be 1');
  for (const c of catalogue?.concepts ?? []) {
    const where = `concepts.yaml, ${c?.slug}`;
    if (!SLUG.test(c?.slug ?? '')) { e(where, 'slug must be lowercase words joined by hyphens'); continue; }
    if (slugs.has(c.slug)) e(where, 'duplicate slug');
    slugs.set(c.slug, c);
    if (!isText(c.name)) e(where, 'name is required');
    if (!AREAS.includes(c.area)) e(where, `area must be one of ${AREAS.join(', ')}`);
    if (!['foundation', 'language', 'framework'].includes(c.kind)) e(where, 'kind must be foundation, language or framework');
    if (c.kind === 'foundation' && (c.language || c.framework)) e(where, 'a foundation concept has no language or framework');
    if (c.kind === 'language' && (!c.language || c.framework)) e(where, 'a language concept needs a language and no framework');
    if (c.kind === 'framework' && (!c.language || !c.framework)) e(where, 'a framework concept needs a language and a framework');
    if (!['generated', 'reviewed'].includes(c.status)) e(where, 'status must be generated or reviewed');
    if (!isText(c.brief)) e(where, 'brief is required');
    else if (c.brief.length > 450) w(where, 'brief is long, over 450 characters');
    for (const r of c.resources ?? []) {
      if (!isText(r?.title)) e(where, 'every resource needs a title');
      if (!/^https?:\/\//.test(r?.url ?? '')) e(where, `resource url "${r?.url}" must start with http:// or https://`);
      if (r?.language && !isLower(r.language)) e(where, `resource language "${r.language}" must be lowercase`);
    }
    for (const n of c.language_notes ?? []) {
      if (!isText(n?.language) || !isLower(n.language)) e(where, 'a language note needs a lowercase language');
      if (n?.framework && !isLower(n.framework)) e(where, 'a language note framework must be lowercase');
      if (!isText(n?.body)) e(where, 'a language note needs a body');
      else if (codeSign(n.body)) e(where, `the ${n.language} note contains ${codeSign(n.body)}. Name the tools and link the docs, without code`);
    }
    if (c.lesson != null) {
      const l = c.lesson;
      if (!isText(l?.how_it_works)) e(where, 'lesson.how_it_works is required');
      else {
        if (l.how_it_works.length < 400) w(where, 'lesson.how_it_works is short, under 400 characters');
        noCode(where, 'lesson.how_it_works', l.how_it_works);
      }
      for (const field of LESSON_LISTS) {
        if (!Array.isArray(l?.[field]) || l[field].length < 1 || l[field].length > 5 || !l[field].every(isText)) {
          e(where, `lesson.${field} needs 1 to 5 entries of text`);
        } else l[field].forEach((x, i) => noCode(where, `lesson.${field} ${i + 1}`, x));
      }
    }
    if (c.superseded_by != null && c.superseded_by === c.slug) e(where, 'superseded_by cannot name the concept itself');
  }
  for (const c of slugs.values()) {
    if (c.superseded_by != null && !slugs.has(c.superseded_by)) e(`concepts.yaml, ${c.slug}`, `superseded_by names unknown concept ${c.superseded_by}`);
  }
  for (const c of slugs.values()) {
    for (const field of ['prerequisites', 'related']) {
      for (const other of c[field] ?? []) {
        if (other === c.slug) e(`concepts.yaml, ${c.slug}`, `${field} cannot list the concept itself`);
        else if (!slugs.has(other)) e(`concepts.yaml, ${c.slug}`, `${field} lists unknown concept ${other}`);
      }
    }
  }

  // ---- project files ----
  const seenProjects = new Set();
  for (const { file, data } of projects) {
    const p = data?.project ?? {};
    // format 1 is the step-by-step shape of the first 21 projects; format 2 is concept-first (CONTENT_FORMAT.md).
    const v2 = data?.format === 2;
    const v3 = data?.format === 3;
    if (data?.format !== 1 && !v2 && !v3) e(file, 'format must be 1, 2 or 3');
    if (!SOURCES[p.source]) e(file, 'project.source must be coding_challenges or roadmap_sh');
    if (!SLUG.test(p.slug ?? '')) e(file, 'project.slug must be lowercase words joined by hyphens');
    const id = `${p.source}/${p.slug}`;
    if (seenProjects.has(id)) e(file, `project ${id} appears twice`);
    seenProjects.add(id);
    if (!isText(p.title)) e(file, 'project.title is required');
    if (SOURCES[p.source] && p.source_url !== SOURCES[p.source] + p.slug) {
      e(file, `project.source_url must be ${SOURCES[p.source]}${p.slug}`);
    }
    if (p.level != null && !['beginner', 'intermediate', 'advanced'].includes(p.level)) e(file, 'project.level must be beginner, intermediate, advanced or empty');
    if (!['generated', 'reviewed'].includes(p.status)) e(file, 'project.status must be generated or reviewed');
    if (p.status === 'reviewed' && !(isText(p.reviewed_by) && p.reviewed_on)) e(file, 'a reviewed project needs reviewed_by and reviewed_on');
    if (!isText(p.summary)) e(file, 'project.summary is required');
    else if (p.summary.length > 400) w(file, 'project.summary is over 400 characters');
    if (!Array.isArray(p.requirements) || p.requirements.length < 2 || p.requirements.length > 8 || !p.requirements.every(isText)) {
      e(file, 'project.requirements needs 2 to 8 lines of text');
    }
    checkRubric(`${file}, restate_rubric`, p.restate_rubric);
    if (!isText(p.reflection_prompt)) e(file, 'project.reflection_prompt is required');
    const pr = p.primer;
    if (!pr || typeof pr !== 'object') e(file, 'project.primer is required: what, why, example and words');
    else {
      for (const field of ['what', 'why', 'example']) {
        if (!isText(pr[field])) e(file, `project.primer.${field} is required`);
        else noCode(file, `project.primer.${field}`, pr[field]);
      }
      if (!Array.isArray(pr.words) || pr.words.length < 1 || pr.words.length > 6) e(file, 'project.primer.words needs 1 to 6 terms');
      else for (const word of pr.words) {
        if (!isText(word?.term) || !isText(word?.meaning)) e(file, 'every primer word needs a term and a meaning');
        else noCode(file, `primer word ${word.term}`, word.meaning);
      }
    }
    if (p.figure != null && !FIGURE_KINDS.includes(p.figure?.kind)) e(file, `project.figure.kind must be one of ${FIGURE_KINDS.join(', ')}`);

    if (v3) {
      validateV3(file, data, slugs, { e, w, isText, checkRubric, noCode });
      continue;
    }

    const milestones = data?.milestones;
    if (!Array.isArray(milestones) || milestones.length < 1 || milestones.length > 6) { e(file, 'a project needs 1 to 6 milestones'); continue; }

    milestones.forEach((m, mi) => {
      const mw = `${file}, milestone ${mi + 1}`;
      if (!isText(m?.title)) e(mw, 'title is required');
      if (!isText(m?.summary)) e(mw, 'summary is required');
      const concepts = m?.concepts ?? [];
      // In format 2 a milestone is one big concept or a tight group of them; format 1 needed at least 3.
      const minConcepts = v2 ? 1 : 3;
      if (!Array.isArray(concepts) || concepts.length < minConcepts || concepts.length > 4) e(mw, `a milestone covers ${minConcepts} to 4 concepts`);
      if (new Set(concepts).size !== concepts.length) e(mw, 'concepts lists a concept twice');
      for (const c of concepts) {
        const known = slugs.get(c);
        if (!known) e(mw, `unknown concept ${c}. Add it to concepts.yaml first`);
        else if (v2 && known.superseded_by) e(mw, `concept ${c} is superseded by ${known.superseded_by}`);
        else if (v2 && !known.lesson) e(mw, `concept ${c} has no lesson, and a format 2 project teaches every concept it uses`);
      }

      if (!Array.isArray(m?.steps) || m.steps.length < 1 || m.steps.length > 6) { e(mw, 'a milestone needs 1 to 6 steps'); return; }
      let minutes = 0;
      m.steps.forEach((s, si) => {
        const sw = `${mw}, step ${si + 1}`;
        if (!isText(s?.title)) e(sw, 'title is required');
        if (!Number.isInteger(s?.minutes) || s.minutes < 5 || s.minutes > 60) e(sw, 'minutes must be a whole number from 5 to 60');
        else {
          minutes += s.minutes;
          if (s.minutes < 10 || s.minutes > 20) w(sw, `${s.minutes} minutes is outside the usual 10 to 20`);
        }
        const t = s?.think;
        if (!t || !THINK_KINDS.includes(t.kind)) e(sw, `think.kind must be one of ${THINK_KINDS.join(', ')}`);
        else {
          if (!isText(t.prompt)) e(sw, 'think.prompt is required');
          else if (toySign(t.prompt)) flags.push({ where: sw, project: p.slug, id: `${mi + 1}.${si + 1}`, kind: t.kind, sign: toySign(t.prompt), prompt: t.prompt });
          if (t.kind === 'predict' || t.kind === 'trace') {
            const k = t.key;
            if (!k || !MATCHES.includes(k.match)) e(sw, `think.key.match must be one of ${MATCHES.join(', ')}`);
            else if (k.match === 'number_exact' && typeof k.expected !== 'number') e(sw, 'number_exact needs a number as expected');
            else if (k.match === 'numbers_all' && !(Array.isArray(k.expected) && k.expected.length > 0 && k.expected.every((n) => typeof n === 'number'))) e(sw, 'numbers_all needs a list of numbers as expected');
            else if (k.match === 'text_ci' && !isText(k.expected)) e(sw, 'text_ci needs a text as expected');
            if (!isText(k?.derivation)) e(sw, 'think.key.derivation is required: show how the expected answer is worked out');
            if (t.rubric) e(sw, `a ${t.kind} task is graded by key, so it has no rubric`);
            keys.push({ where: sw, project: p.slug, id: `${mi + 1}.${si + 1}`, kind: t.kind, match: k?.match, prompt: t.prompt, snippet: t.snippet, expected: k?.expected, derivation: k?.derivation });
          } else {
            checkRubric(`${sw}, think.rubric`, t.rubric);
            if (t.key) e(sw, `an ${t.kind} task is graded by rubric, so it has no key`);
            if (t.kind === 'spot_bug' && !isText(t.snippet)) e(sw, 'a spot_bug task needs a snippet');
          }
        }
        if (s?.build != null && !isText(s.build.prompt)) e(sw, 'build.prompt is required when build is present');
        if (!isText(s?.hints?.hint)) e(sw, 'hints.hint is required');
        else noCode(sw, 'hints.hint', s.hints.hint);
        if (s?.hints?.example != null) {
          if (!isText(s.hints.example)) e(sw, 'hints.example must be text when present');
          else noCode(sw, 'hints.example', s.hints.example);
        }
      });
      if (minutes < 30 || minutes > 60) w(mw, `${minutes} minutes in total is outside the usual 30 to 60`);

      if (m?.gate) e(mw, 'gate was replaced by teach_back, one question whose points are tagged with concepts');
      const tb = m?.teach_back;
      const tw = `${mw}, teach_back`;
      if (!tb) e(mw, 'teach_back is required');
      else {
        if (!isText(tb.prompt)) e(tw, 'prompt is required');
        if (checkRubric(`${tw}, rubric`, tb.rubric, 3, 4)) {
          const tagged = new Set();
          for (const point of tb.rubric) {
            if (!isText(point?.concept)) e(tw, `point ${point?.id} needs a concept`);
            else if (!concepts.includes(point.concept)) e(tw, `point ${point.id} is tagged ${point.concept}, which is not in the milestone's concepts`);
            else tagged.add(point.concept);
          }
          for (const c of concepts) {
            if (!tagged.has(c)) e(tw, `no point is tagged ${c}, so the milestone lists a concept it never checks`);
          }
        }
      }
    });
  }
  return { errors, warnings, keys, flags };
}

// Format 3 (CONTENT_FORMAT v3): a learning map of concepts with explain-backs, and a build plan of steps with
// one checkable outcome each, tagged with the concepts they use.
function validateV3(file, data, slugs, { e, w, isText, checkRubric, noCode }) {
  const p = data.project;
  if (p.reference_tool != null && !isText(p.reference_tool)) e(file, 'project.reference_tool must be text when present');
  if (!isText(p.done_when)) e(file, 'project.done_when is required in format 3');
  if (p.open_checks != null && (!Array.isArray(p.open_checks) || p.open_checks.length > 6 || !p.open_checks.every(isText))) {
    e(file, 'project.open_checks needs 0 to 6 lines of text');
  }
  const map = data.learning_map;
  const onMap = new Set();
  if (!Array.isArray(map) || map.length < 3 || map.length > 12) e(file, 'learning_map needs 3 to 12 concepts');
  for (const [i, entry] of (Array.isArray(map) ? map : []).entries()) {
    const where = `${file}, learning_map ${i + 1} (${entry?.concept})`;
    const known = slugs.get(entry?.concept);
    if (!known) { e(where, `unknown concept ${entry?.concept}. Add it to concepts.yaml first`); continue; }
    if (onMap.has(entry.concept)) e(where, 'concept appears twice on the learning map');
    onMap.add(entry.concept);
    if (known.superseded_by) e(where, `concept is superseded by ${known.superseded_by}`);
    if (!known.lesson) e(where, 'concept has no lesson in concepts.yaml');
    const res = known.resources ?? [];
    if (res.length < 2 || res.length > 4) w(where, `concept has ${res.length} resources; the model asks for 2 to 4`);
    if (!isText(entry.where)) e(where, 'where is required');
    if (!isText(entry.explain_back?.prompt)) e(where, 'explain_back.prompt is required');
    checkRubric(`${where}, explain_back.rubric`, entry.explain_back?.rubric);
  }
  const used = new Set();
  const ms = data.milestones;
  if (!Array.isArray(ms) || ms.length < 1 || ms.length > 6) { e(file, 'a project needs 1 to 6 milestones'); return; }
  if (ms.length < 2 || ms.length > 5) w(file, `${ms.length} milestones; the model asks for 2 to 5`);
  ms.forEach((m, mi) => {
    const mw = `${file}, milestone ${mi + 1}`;
    if (!isText(m?.title)) e(mw, 'title is required');
    if (!isText(m?.summary)) e(mw, 'summary is required');
    if (m?.concepts || m?.teach_back) e(mw, 'in format 3 concepts come from the steps, and explain-backs live on the learning map');
    if (!Array.isArray(m?.steps) || m.steps.length < 1 || m.steps.length > 5) { e(mw, 'a milestone needs 1 to 5 steps'); return; }
    m.steps.forEach((st, si) => {
      const sw = `${mw}, step ${si + 1}`;
      if (!isText(st?.title)) e(sw, 'title is required');
      if (!Number.isInteger(st?.minutes) || st.minutes < 5 || st.minutes > 60) e(sw, 'minutes must be a whole number from 5 to 60');
      else if (st.minutes < 30) w(sw, `${st.minutes} minutes is under the usual 30 to 60`);
      if (!isText(st?.build)) e(sw, 'build is required: what to build in this step, in words');
      if (!isText(st?.outcome)) e(sw, 'outcome is required: one checkable outcome');
      if (st?.think) e(sw, 'format 3 has no Think tasks; concepts are checked by their explain-back');
      const cs = st?.concepts;
      if (!Array.isArray(cs) || cs.length < 1 || cs.length > 3) e(sw, 'concepts needs 1 to 3 slugs');
      for (const c of Array.isArray(cs) ? cs : []) {
        if (!onMap.has(c)) e(sw, `concept ${c} is not on the learning map`);
        used.add(c);
      }
      if (!isText(st?.hints?.hint)) e(sw, 'hints.hint is required');
      else noCode(sw, 'hints.hint', st.hints.hint);
      if (st?.hints?.example != null) {
        if (!isText(st.hints.example)) e(sw, 'hints.example must be text when present');
        else noCode(sw, 'hints.example', st.hints.example);
      }
    });
  });
  for (const c of onMap) if (!used.has(c)) e(file, `learning-map concept ${c} is not used by any build step`);
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

const lit = (v) =>
  v === null || v === undefined ? 'null'
  : typeof v === 'number' || typeof v === 'boolean' ? String(v)
  : `'${String(v).replace(/'/g, "''")}'`;
const jsonb = (v) => (v === null || v === undefined ? 'null' : `${lit(JSON.stringify(v))}::jsonb`);
const textArray = (list) => `array[${list.map(lit).join(', ')}]::text[]`;
const clean = (s) => String(s).trim();

export function buildSql({ catalogue, projects }, { linkStatus = new Map() } = {}) {
  const out = ['begin;', ''];
  const concepts = catalogue.concepts;
  const inCatalogue = `select id from concept where slug in (${concepts.map((c) => lit(c.slug)).join(', ')})`;

  out.push(
    'insert into concept (slug, name, area_slug, kind, language, framework, brief, lesson, content_status) values',
    concepts
      .map((c) => {
        const lesson = c.lesson ? { ...c.lesson, how_it_works: clean(c.lesson.how_it_works) } : null;
        const cols = [c.slug, clean(c.name), c.area, c.kind, c.language ?? null, c.framework ?? null, clean(c.brief)].map(lit);
        return `  (${[...cols, jsonb(lesson), lit(c.status)].join(', ')})`;
      })
      .join(',\n'),
    'on conflict (slug) do update set name = excluded.name, area_slug = excluded.area_slug, kind = excluded.kind,',
    '  language = excluded.language, framework = excluded.framework, brief = excluded.brief, lesson = excluded.lesson,',
    '  content_status = excluded.content_status;',
    ''
  );

  // The file is the source of truth for the links between the concepts it lists.
  out.push(`delete from concept_edge where type = 'prerequisite' and to_concept_id in (${inCatalogue});`);
  out.push(`delete from concept_edge where type = 'related' and (from_concept_id in (${inCatalogue}) or to_concept_id in (${inCatalogue}));`);
  for (const c of concepts) {
    for (const p of c.prerequisites ?? []) {
      out.push(`insert into concept_edge (from_concept_id, to_concept_id, type) select a.id, b.id, 'prerequisite' from concept a, concept b where a.slug = ${lit(p)} and b.slug = ${lit(c.slug)};`);
    }
    for (const r of c.related ?? []) {
      out.push(`insert into concept_edge (from_concept_id, to_concept_id, type) select least(a.id, b.id), greatest(a.id, b.id), 'related' from concept a, concept b where a.slug = ${lit(r)} and b.slug = ${lit(c.slug)} on conflict do nothing;`);
    }
  }
  out.push('');

  for (const c of concepts) {
    const cid = `(select id from concept where slug = ${lit(c.slug)})`;
    for (const r of c.resources ?? []) {
      out.push(`insert into resource (concept_id, title, url, language, opened) values (${cid}, ${lit(clean(r.title))}, ${lit(r.url)}, ${lit(r.language ?? null)}, ${r.opened === true}) on conflict (concept_id, url) do update set title = excluded.title, language = excluded.language, opened = excluded.opened;`);
    }
    out.push(`delete from resource where concept_id = ${cid} and url <> all(${textArray((c.resources ?? []).map((r) => r.url))});`);
    for (const n of c.language_notes ?? []) {
      out.push(`insert into language_note (concept_id, language, framework, body, content_status) values (${cid}, ${lit(n.language)}, ${lit(n.framework ?? '')}, ${lit(clean(n.body))}, 'generated') on conflict (concept_id, language, framework) do update set body = excluded.body;`);
    }
  }
  for (const [url, status] of linkStatus) {
    out.push(`update resource set http_status = ${status}, verified_at = now() where url = ${lit(url)};`);
  }
  out.push('');

  for (const { data } of projects) {
    const p = data.project;
    const ref = `(select id from challenge where source = ${lit(p.source)} and slug = ${lit(p.slug)})`;
    const mref = (i) => `(select m.id from milestone m where m.challenge_id = ${ref} and m.position = ${i})`;
    const sref = (i, j) => `(select s.id from step s where s.milestone_id = ${mref(i)} and s.position = ${j})`;
    const cref = (slug) => `(select id from concept where slug = ${lit(slug)})`;

    out.push(`-- project ${p.source}/${p.slug}`);
    out.push(`insert into challenge (source, slug, title, source_url) values (${lit(p.source)}, ${lit(p.slug)}, ${lit(clean(p.title))}, ${lit(p.source_url)}) on conflict (source, slug) do nothing;`);
    out.push(
      `do $$ begin if exists (select 1 from enrollment where challenge_id = ${ref}) then`,
      `  raise exception 'project ${p.slug} has learners, so its curriculum is frozen'; end if; end $$;`
    );
    out.push(`delete from milestone where challenge_id = ${ref};`);
    out.push(
      `update challenge set title = ${lit(clean(p.title))}, source_url = ${lit(p.source_url)}, level = ${lit(p.level ?? null)},`,
      `  summary = ${lit(clean(p.summary))}, requirements = ${textArray(p.requirements.map(clean))},`,
      `  restate_rubric = ${jsonb(p.restate_rubric)}, reflection_prompt = ${lit(clean(p.reflection_prompt))},`,
      `  primer = ${jsonb(p.primer)}, figure_kind = ${lit(p.figure?.kind ?? null)},`,
      `  content_format = ${data.format}, reference_tool = ${lit(p.reference_tool ? clean(p.reference_tool) : null)},`,
      `  done_when = ${lit(p.done_when ? clean(p.done_when) : null)}, open_checks = ${textArray((p.open_checks ?? []).map(clean))},`,
      `  content_status = ${lit(p.status)}, updated_at = now() where id = ${ref};`
    );
    out.push(`delete from project_concept where challenge_id = ${ref};`);

    if (data.format === 3) {
      data.learning_map.forEach((entry, i) => {
        out.push(`insert into project_concept (challenge_id, concept_id, position, where_text, explain_prompt, explain_rubric) values (${ref}, ${cref(entry.concept)}, ${i + 1}, ${lit(clean(entry.where))}, ${lit(clean(entry.explain_back.prompt))}, ${jsonb(entry.explain_back.rubric)});`);
      });
      data.milestones.forEach((m, mi) => {
        const i = mi + 1;
        out.push(`insert into milestone (challenge_id, position, title, summary) values (${ref}, ${i}, ${lit(clean(m.title))}, ${lit(clean(m.summary))});`);
        const union = [...new Set(m.steps.flatMap((s) => s.concepts))];
        out.push(`insert into milestone_concept (milestone_id, concept_id) select ${mref(i)}, id from concept where slug in (${union.map(lit).join(', ')});`);
        m.steps.forEach((s, si) => {
          const j = si + 1;
          out.push(`insert into step (milestone_id, position, title, est_minutes, outcome) values (${mref(i)}, ${j}, ${lit(clean(s.title))}, ${s.minutes}, ${lit(clean(s.outcome))});`);
          out.push(`insert into task (step_id, role, kind, prompt) values (${sref(i, j)}, 'build', 'build', ${lit(clean(s.build))});`);
          out.push(`insert into step_concept (step_id, concept_id) select ${sref(i, j)}, id from concept where slug in (${s.concepts.map(lit).join(', ')});`);
          for (const level of ['hint', 'example']) {
            if (s.hints[level]) out.push(`insert into hint (step_id, level, language, body, content_status) values (${sref(i, j)}, ${lit(level)}, '', ${lit(clean(s.hints[level]))}, ${lit(p.status)});`);
          }
        });
      });
      out.push('');
      continue;
    }

    data.milestones.forEach((m, mi) => {
      const i = mi + 1;
      out.push(`insert into milestone (challenge_id, position, title, summary) values (${ref}, ${i}, ${lit(clean(m.title))}, ${lit(clean(m.summary))});`);
      out.push(`insert into milestone_concept (milestone_id, concept_id) select ${mref(i)}, id from concept where slug in (${m.concepts.map(lit).join(', ')});`);
      m.steps.forEach((s, si) => {
        const j = si + 1;
        out.push(`insert into step (milestone_id, position, title, est_minutes) values (${mref(i)}, ${j}, ${lit(clean(s.title))}, ${s.minutes});`);
        const t = s.think;
        out.push(`insert into task (step_id, role, kind, prompt, snippet, answer_key, rubric) values (${sref(i, j)}, 'think', ${lit(t.kind)}, ${lit(clean(t.prompt))}, ${lit(t.snippet ?? null)}, ${jsonb(t.key ?? null)}, ${jsonb(t.rubric ?? null)});`);
        if (s.build) out.push(`insert into task (step_id, role, kind, prompt) values (${sref(i, j)}, 'build', 'build', ${lit(clean(s.build.prompt))});`);
        for (const level of ['hint', 'example']) {
          out.push(`insert into hint (step_id, level, language, body, content_status) values (${sref(i, j)}, ${lit(level)}, '', ${lit(clean(s.hints[level]))}, ${lit(p.status)});`);
        }
      });
      const tb = m.teach_back;
      out.push(`insert into question (milestone_id, concept_id, position, prompt, rubric) values (${mref(i)}, null, 1, ${lit(clean(tb.prompt))}, ${jsonb(tb.rubric)});`);
    });
    out.push('');
  }
  out.push('commit;', '');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Checking against a database
// ---------------------------------------------------------------------------

export async function freshDatabase() {
  const db = new PGlite();
  for (const f of ['schema.sql', 'seed_reference.sql', 'seed_challenges.sql']) {
    await db.exec(readFileSync(join(DB_DIR, f), 'utf8'));
  }
  return db;
}

export async function verifyLinks(catalogue) {
  const urls = [...new Set(catalogue.concepts.flatMap((c) => (c.resources ?? []).map((r) => r.url)))];
  const status = new Map();
  for (const url of urls) {
    // A network hiccup or a 5xx is retried, so one slow reply does not hide a good link.
    let code = 0;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(25000), headers: { 'user-agent': 'Mozilla/5.0 (link check)' } });
        code = res.status;
      } catch {
        code = 0;
      }
      if (code !== 0 && code < 500) break;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
    status.set(url, code);
  }
  return status;
}

export async function summarise(db) {
  const one = async (sql) => (await db.query(sql)).rows[0];
  return {
    concepts: (await one(`select count(*)::int n from concept`)).n,
    reviewedProjects: (await one(`select count(*)::int n from challenge where content_status = 'reviewed'`)).n,
    generatedProjects: (await one(`select count(*)::int n from challenge where content_status = 'generated'`)).n,
    milestones: (await one(`select count(*)::int n from milestone`)).n,
    steps: (await one(`select count(*)::int n from step`)).n,
    thinkTasks: (await one(`select count(*)::int n from task where role = 'think'`)).n,
    buildTasks: (await one(`select count(*)::int n from task where role = 'build'`)).n,
    hints: (await one(`select count(*)::int n from hint`)).n,
    teachBacks: (await one(`select count(*)::int n from question`)).n,
    resources: (await one(`select count(*)::int n from resource`)).n,
    languageNotes: (await one(`select count(*)::int n from language_note`)).n,
  };
}

// Every predict and trace key is proven by a function in content/proofs/<slug>.mjs, exported as
// `proofs` and keyed by "milestone.step", for example '2.1'. The check runs each one and compares
// its result with the stored key, so a wrong key fails before a learner ever sees it.
const sameAnswer = (match, expected, actual) =>
  match === 'text_ci'
    ? String(actual).toLowerCase() === String(expected).toLowerCase()
    : JSON.stringify(actual) === JSON.stringify(expected);

export async function checkProofs({ keys, dir = CONTENT_DIR }) {
  const errors = [];
  const bySlug = Map.groupBy(keys, (k) => k.project);
  for (const [slug, list] of bySlug) {
    const path = join(dir, 'proofs', `${slug}.mjs`);
    if (!existsSync(path)) { errors.push(`proofs/${slug}.mjs: missing, and ${list.length} key(s) need a proof`); continue; }
    const { proofs = {} } = await import(pathToFileURL(path).href);
    for (const k of list) {
      const fn = proofs[k.id];
      if (typeof fn !== 'function') { errors.push(`proofs/${slug}.mjs: no proof for step ${k.id}`); continue; }
      try {
        k.proof = { source: fn.toString(), output: await fn() };
        k.proof.ok = sameAnswer(k.match, k.expected, k.proof.output);
      } catch (err) {
        k.proof = { source: fn.toString(), output: `threw ${err.message}`, ok: false };
      }
      if (!k.proof.ok) errors.push(`${k.where}: the proof returned ${JSON.stringify(k.proof.output)} but the key expects ${JSON.stringify(k.expected)}`);
    }
    for (const id of Object.keys(proofs)) {
      if (!list.some((k) => k.id === id)) errors.push(`proofs/${slug}.mjs: proof ${id} has no predict or trace key`);
    }
  }
  return errors;
}

export const check = (dir = CONTENT_DIR, options = {}) => checkContent(readContent(dir), options);

export const onlyProjects = (content, slugs) =>
  slugs?.length ? { ...content, projects: content.projects.filter((p) => slugs.includes(p.data?.project?.slug)) } : content;

// With skipInvalid, a project file with errors is left out (and reported) instead of failing the whole
// import, so finished projects keep loading while others are being rewritten. Catalogue errors still fail.
export function dropInvalidProjects(content) {
  const { errors } = validate(content);
  const bad = new Set(content.projects.filter(({ file }) => errors.some((m) => m.startsWith(`${file}`))).map((p) => p.file));
  return { content: { ...content, projects: content.projects.filter((p) => !bad.has(p.file)) }, skipped: errors.filter((m) => [...bad].some((f) => m.startsWith(f))) };
}

export async function checkContent(content, { links = false, skipInvalid = false } = {}) {
  let skipped = [];
  if (skipInvalid) ({ content, skipped } = dropInvalidProjects(content));
  const result = validate(content);
  result.skipped = skipped;
  if (result.errors.length) return { ...result, ok: false, content };
  result.errors.push(...(await checkProofs({ keys: result.keys, dir: content.dir })));
  if (result.errors.length) return { ...result, ok: false, content };
  const linkStatus = links ? await verifyLinks(content.catalogue) : new Map();
  const sql = buildSql(content, { linkStatus });
  const db = await freshDatabase();
  try {
    await db.exec(sql);
  } catch (err) {
    result.errors.push(`database: ${err.message}`);
    return { ...result, ok: false, content, sql, db };
  }
  return { ...result, ok: true, content, sql, db, linkStatus, summary: await summarise(db) };
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const sqlOut = args.includes('--sql') ? args[args.indexOf('--sql') + 1] : null;
  const only = args.includes('--project') ? args[args.indexOf('--project') + 1].split(',') : null;
  const r = await checkContent(onlyProjects(readContent(CONTENT_DIR), only), { links: args.includes('--verify-links'), skipInvalid: args.includes('--skip-invalid') });
  if (r.skipped?.length) {
    const files = [...new Set(r.skipped.map((m) => m.split(',')[0].split(':')[0]))];
    console.warn(`SKIPPED  ${files.length} project file(s) with errors, not imported: ${files.join(', ')}`);
    for (const m of r.skipped) console.warn(`  skipped: ${m}`);
  }

  for (const m of r.errors) console.error(`ERROR    ${m}`);
  for (const m of r.warnings) console.warn(`warning  ${m}`);
  if (!r.ok) {
    console.error(`\n${r.errors.length} error(s). Nothing was imported.`);
    process.exit(1);
  }
  console.log('\nLoaded into a fresh database:', JSON.stringify(r.summary));
  if (r.linkStatus?.size) {
    const bad = [...r.linkStatus].filter(([, s]) => s !== 200);
    console.log(`Links checked: ${r.linkStatus.size}, not 200: ${bad.length}`);
    for (const [u, s] of bad) console.warn(`warning  link ${u} returned ${s}`);
  }
  if (r.keys.length) {
    console.log(`\n${r.keys.length} answer key(s) to check by hand:`);
    for (const k of r.keys) console.log(`  ${k.where}\n    expected ${JSON.stringify(k.expected)}, proof returned ${JSON.stringify(k.proof.output)}`);
    console.log('\nThe derivations and proof sources are in content/REVIEW_SHEET.md (node scripts/review-sheet.mjs).');
  }
  if (r.flags.length) {
    console.log(`\n${r.flags.length} Think prompt(s) that may ask for the tool's output on a made-up input, for a person to check:`);
    for (const f of r.flags) console.log(`  ${f.where}: ${f.sign}`);
  }
  if (sqlOut) {
    writeFileSync(resolve(sqlOut), r.sql);
    console.log(`\nWrote ${sqlOut}`);
  }
  await r.db.close();
}
