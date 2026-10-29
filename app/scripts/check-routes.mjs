// Requests every learner route of every ready project as a guest and reports anything that isn't a clean 200.
// No model or search calls: it starts projects with no language and submits nothing.
//   node scripts/check-routes.mjs [http://localhost:3000]
const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
let cookie = '';
async function req(path, body) {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: r.status, text: await r.text() };
}
const bad = [];
let pages = 0;
const check = async (path) => {
  const r = await req(path);
  pages++;
  // A server error page in dev mode shows this marker; a redirect is a failure for these routes too.
  if (r.status !== 200 || /Unhandled Runtime Error|Application error/.test(r.text)) bad.push(`${r.status} ${path}`);
  return r.text;
};

const health = JSON.parse((await req('/api/health')).text);
console.log('health', health.projects);
for (const p of ['/', '/projects', '/learning', '/settings']) await check(p);
const catalogue = await check('/projects');
const slugs = [...new Set([...catalogue.matchAll(/href="\/projects\/(challenge-[a-z0-9-]+)"/g)].map((m) => m[1]))];
for (const slug of slugs) {
  await check(`/projects/${slug}`);
  const s = await req('/api/start', { slug });
  if (s.status !== 200) bad.push(`start ${s.status} ${slug}`);
  const home = await check(`/projects/${slug}/home`);
  const concepts = [...new Set([...home.matchAll(new RegExp(`/projects/${slug}/c/([a-z0-9-]+)`, 'g'))].map((m) => m[1]))];
  const steps = [...new Set([...home.matchAll(new RegExp(`/projects/${slug}/m/(\\d+)/s/(\\d+)`, 'g'))].map((m) => `${m[1]}/s/${m[2]}`))];
  for (const c of concepts) await check(`/projects/${slug}/c/${c}`);
  for (const st of steps) await check(`/projects/${slug}/m/${st}`);
  for (const c of concepts.slice(0, 1)) await check(`/concepts/${c}`);
  console.log(`${slug}: ${concepts.length} concepts, ${steps.length} steps`);
}
await check('/learning');
console.log(`\n${slugs.length} projects, ${pages} pages, ${bad.length} problem(s)`);
for (const b of bad) console.log('  ', b);
process.exitCode = bad.length ? 1 : 0;
