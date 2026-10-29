// Merges lessons and checked references written by content writers into content/concepts.yaml.
// Usage (from db/): node ../content/scripts/merge-lessons.mjs lessons.json [refs.json]
//   lessons.json: { "<slug>": { "name", "area", "brief", "lesson": { how_it_works, examples, misconceptions, elsewhere },
//                               "prerequisites"?: [slug] } }
//   refs.json:    { "<slug>": [ { "title", "url" } ] }   every URL loaded (HTTP 200) with its title confirmed
// An existing concept keeps its slug, kind and links; its brief and lesson are replaced. A new slug is added as a
// foundation concept. Language-specific links already on a concept are kept, because they serve Part B.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '../db/package.json'));
const Y = require('yaml');
const file = path.join(root, 'concepts.yaml');
const [lessonsFile, refsFile] = process.argv.slice(2);
const lessons = lessonsFile ? JSON.parse(fs.readFileSync(lessonsFile, 'utf8')) : {};
const refs = refsFile ? JSON.parse(fs.readFileSync(refsFile, 'utf8')) : {};
const AREAS = ['text-encodings', 'streams-io', 'formats-parsing', 'state-storage', 'process-testing', 'design-structure',
  'networking-http', 'concurrency', 'apis-backends', 'data-stores'];

const doc = Y.parseDocument(fs.readFileSync(file, 'utf8'));
const list = doc.get('concepts');
const find = (slug) => list.items.find((c) => c.get('slug') === slug);
let added = 0, updated = 0;
for (const [slug, v] of Object.entries(lessons)) {
  let node = find(slug);
  if (!node) {
    if (!AREAS.includes(v.area)) throw new Error(`${slug}: unknown area ${v.area}`);
    node = doc.createNode({ slug, name: v.name, area: v.area, kind: 'foundation', status: 'generated', brief: v.brief });
    list.items.push(node); added++;
  } else updated++;
  if (v.name) node.set('name', v.name);
  if (v.brief) node.set('brief', v.brief);
  node.set('lesson', doc.createNode(v.lesson));
  if (v.prerequisites?.length) node.set('prerequisites', doc.createNode(v.prerequisites));
}
for (const [slug, items] of Object.entries(refs)) {
  const node = find(slug);
  if (!node) throw new Error(`refs for unknown concept ${slug}`);
  const kept = (node.toJSON().resources || []).filter((r) => r.language);
  node.set('resources', doc.createNode([...items.map((r) => ({ title: r.title, url: r.url, opened: true })), ...kept]));
}
fs.writeFileSync(file, doc.toString({ lineWidth: 118 }));
console.log(`concepts: ${added} added, ${updated} lessons replaced, ${Object.keys(refs).length} reference lists set`);
