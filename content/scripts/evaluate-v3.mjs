// Evaluates format 3 project files against the learning model in CONTENT_FORMAT.md (v3) and writes a
// readable preview for each to content/previews/<slug>.md.
// Usage (from db/, which has the yaml package): node ../content/scripts/evaluate-v3.mjs [slug ...]
// With no slugs it evaluates every format 3 file. Exit code 1 when any project has a blocking problem.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire(path.resolve(root, '../db/package.json'));
const Y = require('yaml');

const concepts = new Map(Y.parse(fs.readFileSync(path.join(root, 'concepts.yaml'), 'utf8')).concepts.map((c) => [c.slug, c]));
const dir = path.join(root, 'projects/coding-challenges');
const wanted = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yaml'))
  .filter((f) => !wanted.length || wanted.includes(f.replace(/\.yaml$/, '')));

// Signs of code or of the rejected quiz style. Tool names, flags and protocol names are allowed.
const CODE = [/```/, /`[^`]+\(/, /==|=>|!=|&&|\|\|/, /\b\w+\([^)]*\)\s*[;{]/, /;\s*$/m, /^\s*[{}]\s*$/m, /<\/?[a-z]+>/i];
const TOY = [/\bwhat does \S+ (report|print|output)\b/i, /\bhow many (bytes|words|lines|tokens|requests) does\b/i, /\ba file holds\b/i];

let blocking = 0;
for (const f of files) {
  const doc = Y.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (doc.format !== 3) continue;
  const p = doc.project, map = doc.learning_map || [], ms = doc.milestones || [];
  const errs = [], warns = [];
  const texts = [];
  const add = (where, t) => { if (typeof t === 'string') texts.push([where, t]); };

  if (map.length < 3 || map.length > 12) errs.push(`learning map has ${map.length} concepts (3 to 12)`);
  const mapSlugs = new Set(map.map((m) => m.concept));
  for (const m of map) {
    const c = concepts.get(m.concept);
    if (!c) { errs.push(`${m.concept}: not in concepts.yaml`); continue; }
    if (!c.lesson) errs.push(`${m.concept}: no lesson`);
    else if ((c.lesson.how_it_works || '').length < 400) warns.push(`${m.concept}: lesson under 400 characters`);
    const refs = (c.resources || []).filter((r) => !r.language);
    if (refs.length < 2) errs.push(`${m.concept}: ${refs.length} language-neutral references (needs 2 to 4)`);
    if (refs.some((r) => !r.opened)) warns.push(`${m.concept}: some references not marked opened`);
    if (!m.where) errs.push(`${m.concept}: no "where"`);
    const r = m.explain_back?.rubric || [];
    if (!m.explain_back?.prompt) errs.push(`${m.concept}: no explain-back`);
    if (r.length < 2 || r.length > 4) errs.push(`${m.concept}: explain-back rubric has ${r.length} points (2 to 4)`);
    add(`${m.concept} where`, m.where); add(`${m.concept} explain-back`, m.explain_back?.prompt);
    r.forEach((x) => add(`${m.concept} rubric`, x.point));
    if (c.lesson) Object.values(c.lesson).flat().forEach((t) => add(`${m.concept} lesson`, t));
  }
  if (ms.length < 2 || ms.length > 5) warns.push(`${ms.length} milestones (2 to 5)`);
  const used = new Set();
  for (const m of ms) for (const s of m.steps || []) {
    if (!(s.minutes >= 30 && s.minutes <= 60)) errs.push(`step "${s.title}": ${s.minutes} minutes (30 to 60)`);
    if (!s.outcome) errs.push(`step "${s.title}": no outcome`);
    if (!s.build) errs.push(`step "${s.title}": no build text`);
    for (const c of s.concepts || []) { used.add(c); if (!mapSlugs.has(c)) errs.push(`step "${s.title}": concept ${c} not in learning map`); }
    if (!(s.concepts || []).length) errs.push(`step "${s.title}": no concepts`);
    add(`step ${s.title}`, s.build); add(`step ${s.title} outcome`, s.outcome); add(`step ${s.title} hint`, s.hints?.hint); add(`step ${s.title} example`, s.hints?.example);
  }
  for (const s of mapSlugs) if (!used.has(s)) errs.push(`${s}: in learning map but no step uses it`);
  for (const k of ['done_when', 'summary']) if (!p[k]) errs.push(`project: no ${k}`);
  add('primer', p.primer?.what); add('primer', p.primer?.example);
  for (const [w, t] of texts) {
    if (CODE.some((re) => re.test(t))) warns.push(`possible code in ${w}: "${t.slice(0, 70)}"`);
    if (TOY.some((re) => re.test(t))) errs.push(`toy-input quiz wording in ${w}: "${t.slice(0, 70)}"`);
  }

  // Preview
  const L = [];
  L.push(`# ${p.title}`, '', `${p.summary}`, '', `Source: ${p.source_url} · level: ${p.level || 'unset'} · status: ${p.status}`, '');
  L.push('## Before you start', '', p.primer?.what || '', '', p.primer?.why || '', '', `**Example.** ${p.primer?.example || ''}`, '');
  L.push('## Learning map', '');
  map.forEach((m, i) => {
    const c = concepts.get(m.concept) || {};
    L.push(`### ${i + 1}. ${c.name || m.concept}`, '', `**Where it shows up here.** ${m.where}`, '');
    if (c.lesson) {
      L.push(`**How it works.** ${c.lesson.how_it_works.replace(/\n\n/g, '\n\n')}`, '');
      L.push('**Examples.**', ...c.lesson.examples.map((x) => `- ${x}`), '', '**Misconceptions.**', ...c.lesson.misconceptions.map((x) => `- ${x}`), '', '**Elsewhere.**', ...c.lesson.elsewhere.map((x) => `- ${x}`), '');
    }
    L.push('**Read.**', ...(c.resources || []).filter((r) => !r.language).map((r) => `- [${r.title}](${r.url})${r.opened ? '' : ' (not opened)'}`), '');
    L.push(`**Explain it back.** ${m.explain_back?.prompt}`, '', ...(m.explain_back?.rubric || []).map((r) => `- [ ] ${r.point}`), '');
  });
  L.push('## Build plan', '');
  if (p.reference_tool) L.push(`**Reference tool.** ${p.reference_tool}`, '');
  ms.forEach((m, i) => {
    L.push(`### Milestone ${i + 1}: ${m.title}`, '', m.summary || '', '');
    (m.steps || []).forEach((s, j) => L.push(`**${i + 1}.${j + 1} ${s.title}** (${s.minutes} min · ${s.concepts.join(', ')})`, '', s.build, '', `*Outcome:* ${s.outcome}`, '', `*Hint:* ${s.hints?.hint || ''}`, ''));
  });
  L.push('## Open checks', '', ...(p.open_checks || []).map((x) => `- ${x}`), '', '## Done when', '', p.done_when || '', '');
  fs.mkdirSync(path.join(root, 'previews'), { recursive: true });
  fs.writeFileSync(path.join(root, 'previews', f.replace(/\.yaml$/, '.md')), L.join('\n'));

  const steps = ms.reduce((n, m) => n + (m.steps || []).length, 0);
  console.log(`\n${p.slug}: ${map.length} concepts, ${ms.length} milestones, ${steps} steps, ${errs.length} errors, ${warns.length} warnings`);
  errs.forEach((e) => console.log('  ERROR ' + e));
  warns.forEach((w) => console.log('  warn  ' + w));
  if (errs.length) blocking++;
}
process.exit(blocking ? 1 : 0);
