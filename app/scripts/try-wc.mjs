// The wc finish line, end to end as a guest: start, open a concept, one real explain-back grade (one model
// call), tick a build step's outcome, then both exports.   node scripts/try-wc.mjs [http://localhost:3000]
const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
let cookie = '';
async function req(path, body) {
  const r = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual',
  });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: r.status, text: await r.text() };
}
const idAfter = (html, key) => html.match(new RegExp(`${key}\\\\?"\\s*:\\s*\\\\?"([0-9a-f-]{36})`))?.[1];

const start = await req('/api/start', { slug: 'challenge-wc' });
console.log('start', start.status);
const concept = await req('/projects/challenge-wc/c/text-encoding-utf8');
const pc = idAfter(concept.text, 'pcId');
console.log('concept page', concept.status, 'pcId', pc);
if (!pc) process.exit(1);

const body = 'Text is stored as code points, and UTF-8 writes each code point as one to four bytes. Plain English letters take one byte, but accented letters like é or ó take two, so a twenty-character name can need more than twenty bytes and overflow a twenty-byte column. The limit has to be counted in the same unit on both sides: count characters everywhere, or give the column room for the encoded bytes.';
const sent = JSON.parse((await req(`/api/explain/${pc}`, { body })).text);
let run;
for (let i = 0; i < 60; i++) {
  run = JSON.parse((await req(`/api/runs/${sent.runId}`)).text);
  if (['done', 'paused', 'failed'].includes(run.status)) break;
  await new Promise((r) => setTimeout(r, 1500));
}
console.log('explain-back', run.status, run.result?.grade, (run.result?.points ?? []).map((p) => `${p.id}:${p.met ? 'met' : 'not yet'}`).join(' '));
for (const p of run.result?.points ?? []) if (p.met) console.log('   quote:', JSON.stringify(p.quote));

const step = await req('/projects/challenge-wc/m/1/s/2');
const stepId = idAfter(step.text, 'stepId');
console.log('outcome', (await req(`/api/steps/${stepId}/outcome`, {})).text);
const home = await req('/projects/challenge-wc/home');
console.log('home', home.text.match(/<ul class="facts">(.*?)<\/ul>/)?.[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
const md = await req('/api/export?format=md');
console.log('export md', md.status, md.text.includes('### Text encoding') || md.text.includes('UTF-8') ? 'has the explained concept' : 'MISSING concept');
const js = await req('/api/export?format=json');
console.log('export json', js.status, JSON.parse(js.text).answer.length, 'answer(s)');
