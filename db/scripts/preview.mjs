// Writes a readable preview of a project, with its lessons, questions and teach-backs, to content/previews/<slug>.md.
//
//   node scripts/preview.mjs challenge-wc [challenge-cut ...]
//
// The page is generated from the YAML, so fix the YAML and run this again rather than editing the page.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readContent, validate, CONTENT_DIR } from './import-content.mjs';

const slugs = process.argv.slice(2);
if (!slugs.length) {
  console.error('usage: node scripts/preview.mjs <project-slug> [...]');
  process.exit(1);
}

const content = readContent();
const { errors } = validate(content);
if (errors.length) {
  for (const m of errors) console.error(`ERROR    ${m}`);
  process.exit(1);
}
const concepts = new Map(content.catalogue.concepts.map((c) => [c.slug, c]));
const para = (text) => String(text).trim().split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ')).join('\n\n');
const line = (text) => String(text).replace(/\s+/g, ' ').trim();
const KIND = { predict: 'Predict', trace: 'Trace', spot_bug: 'Spot the bug', explain: 'Explain' };
const MATCH = { number_exact: 'one number', numbers_all: 'these numbers, in this order', text_ci: 'this text' };

function lesson(c) {
  const out = [`#### ${c.name}`, '', `*${line(c.brief)}*`, ''];
  if (!c.lesson) return [...out, '_No lesson yet._', ''];
  out.push('**How it works**', '', para(c.lesson.how_it_works), '');
  for (const [field, title] of [['examples', 'In the real world'], ['misconceptions', 'Common misconceptions'], ['elsewhere', 'Where else it shows up']]) {
    out.push(`**${title}**`, '', ...c.lesson[field].map((x) => `- ${line(x)}`), '');
  }
  if (c.resources?.length) out.push('**Read more**', '', ...c.resources.map((r) => `- [${r.title}](${r.url})`), '');
  return out;
}

mkdirSync(join(CONTENT_DIR, 'previews'), { recursive: true });
for (const slug of slugs) {
  const entry = content.projects.find((p) => p.data.project.slug === slug);
  if (!entry) { console.error(`no project ${slug}`); process.exit(1); }
  const { project: p, milestones } = entry.data;
  const out = [
    `# ${p.title}`,
    '',
    `> Preview generated from \`content/${entry.file}\` by \`node scripts/preview.mjs ${slug}\`. Status: ${p.status}.`,
    `> Source challenge: ${p.source_url}`,
    '',
    line(p.summary),
    '',
    '## Primer',
    '',
    line(p.primer.what),
    '',
    `**Why it matters.** ${line(p.primer.why)}`,
    '',
    `**A small example.** ${line(p.primer.example)}`,
    '',
    ...p.primer.words.map((w) => `- **${w.term}**: ${line(w.meaning)}`),
    '',
    '## The path',
    '',
    ...milestones.map((m, i) => `${i + 1}. **${m.title}** (${m.steps.reduce((a, s) => a + s.minutes, 0)} min): ${line(m.summary)}`),
    '',
  ];
  const taught = new Set();
  milestones.forEach((m, mi) => {
    out.push(`## Milestone ${mi + 1}. ${m.title}`, '', line(m.summary), '', '### Lessons', '');
    for (const slugC of m.concepts) {
      const c = concepts.get(slugC);
      if (taught.has(slugC)) out.push(`#### ${c.name}`, '', '_Taught in an earlier milestone of this project._', '');
      else out.push(...lesson(c));
      taught.add(slugC);
    }
    out.push('### Questions', '');
    m.steps.forEach((s, si) => {
      const t = s.think;
      out.push(`#### ${mi + 1}.${si + 1} ${s.title} (${KIND[t.kind]}, ${s.minutes} min)`, '', line(t.prompt), '');
      if (t.snippet) out.push('```', t.snippet.trimEnd(), '```', '');
      if (t.key) {
        out.push(`**Answer key** (${MATCH[t.key.match]}): **${[].concat(t.key.expected).join(', ')}**. ${line(t.key.derivation)}`, '');
      } else {
        out.push('**A good answer says:**', '', ...t.rubric.map((r) => `- ${line(r.point)}`), '');
      }
      out.push(`**Hint.** ${line(s.hints.hint)}`, '');
      if (s.hints.example) out.push(`**A similar case.** ${line(s.hints.example)}`, '');
      if (s.build) out.push(`**Build (optional, with a language).** ${line(s.build.prompt)}`, '');
    });
    out.push('### Teach-back', '', `> ${line(m.teach_back.prompt)}`, '', '**A full answer covers:**', '');
    out.push(...m.teach_back.rubric.map((r) => `- ${line(r.point)} _(${concepts.get(r.concept).name})_`), '');
  });
  out.push('## Reflection', '', line(p.reflection_prompt), '');
  const path = join(CONTENT_DIR, 'previews', `${slug}.md`);
  writeFileSync(path, out.join('\n'));
  console.log(`Wrote content/previews/${slug}.md`);
}
