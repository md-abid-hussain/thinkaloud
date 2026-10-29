// End-to-end smoke test against a running ThinkAloud (local or the Zerops URL):
//   node scripts/smoke.mjs https://app-xxxx.zerops.app [--ai]
// Without --ai it uses only free paths (start, keyed check, hint, export). With --ai it also grades one
// explain answer and asks the mentor one question, which spends a few cents.
const base = (process.argv[2] ?? 'http://localhost:3100').replace(/\/$/, '');
const ai = process.argv.includes('--ai');
let cookie = '';

async function call(path, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(base + path, {
    method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual',
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, data: type.includes('json') ? await res.json() : await res.text() };
}

async function follow(runId) {
  const res = await fetch(`${base}/api/runs/${runId}/events`, { headers: { cookie } });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const seen = [];
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
      if (!ev) continue;
      seen.push({ ev, data: data ? JSON.parse(data) : null });
      if (ev === 'trace') console.log('   →', seen.at(-1).data.label, seen.at(-1).data.tool ?? '');
      if (ev === 'end') return seen;
    }
  }
  return seen;
}

const ok = (cond, msg) => { console.log(cond ? '✔' : '✘', msg); if (!cond) process.exitCode = 1; };

const health = await call('/api/health');
ok(health.status === 200 && health.data.ok, `health: ${JSON.stringify(health.data.projects ?? health.data)}`);
const start = await call('/api/start', { slug: 'challenge-wc' });
ok(start.status === 200 && cookie, 'guest started on wc');
const home = await call('/projects/challenge-wc/home');
ok(home.status === 200, 'project home opens');
const step = await call('/projects/challenge-wc/m/1/s/1');
ok(step.status === 200, 'step 1 opens');

// Step ids come from the export (keyed answers are free).
const exportJson = await call('/api/export?format=json');
ok(exportJson.status === 200, 'JSON export');

if (ai) {
  const restate = await call('/api/restate', { slug: 'challenge-wc', body: 'A tool that counts the bytes, lines, words and characters of a file, with an option for each, and it reads standard input when no file is given.' });
  ok(restate.status === 200, 'restate queued');
  const evs = await follow(restate.data.runId);
  const result = evs.find((e) => e.ev === 'result')?.data;
  ok(result && result.grade, `restate graded: ${result?.grade} (${result?.points?.filter((p) => p.met).length} of ${result?.points?.length} points)`);
  for (const p of result?.points ?? []) if (p.met) console.log('   quote:', JSON.stringify(p.quote));
}

const md = await call('/api/export?format=md');
ok(md.status === 200 && String(md.data).includes('# What I can explain'), 'Markdown learning log');
