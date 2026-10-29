// Live check of the language layer: starts a guest on a project with a language and prints the research
// agent's trace as it prepares notes.   node scripts/try-language.mjs http://localhost:3000 java [challenge-wc]
const [base = 'http://localhost:3000', language = 'java', slug = 'challenge-wc'] = process.argv.slice(2);
let cookie = '';
async function post(path, body) {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return r.json();
}
await post('/api/start', { slug });
const r = await post(`/api/enrollments/${slug}/language`, { language });
console.log('language run', r);
if (!r.runId) process.exit(0);
const res = await fetch(`${base}/api/runs/${r.runId}/events`, { headers: { cookie } });
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
const t0 = Date.now();
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  let i;
  while ((i = buf.indexOf('\n\n')) >= 0) {
    const chunk = buf.slice(0, i);
    buf = buf.slice(i + 2);
    const ev = /event: (\w+)/.exec(chunk)?.[1];
    const data = /data: (.*)/.exec(chunk)?.[1];
    if (ev === 'trace') console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s`, JSON.parse(data).label);
    if (ev === 'result' || ev === 'error') console.log(ev, data);
    if (ev === 'end') process.exit(0);
  }
}
