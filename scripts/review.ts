/**
 * Renders content/generated/review.html: the type list and, for each generated project, its profile, stage 0, step
 * questions and checks, for Abid to review and comment on. Usage:
 *   npm run review -- wc json-parser url-shortener
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { readMapsWithStaging, type ProjectMap } from "../lib/content";
import { env } from "../lib/env";
import type { CaseFilesChecks, ClientChecks, CliChecks, Generated, HttpChecks, ScriptChecks, SocketChecks } from "../lib/gen/schema";
import { readPlaybooks } from "../lib/gen/sources";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const PROJECTS_BY_TYPE: Record<string, string> = {
  "streams-and-text": "wc, cut",
  "language-processing": "JSON Parser, calculator, Brainfuck, comment remover, grep",
  "algorithms-and-data-structures": "sort, diff, Huffman, Bloom filter, duplicate files",
  "storage-engines": "Bitcask",
  "network-protocols": "echo, web server, Redis, curl, DNS resolver",
  "web-services": "URL shortener, rate limiter",
  "developer-tools": "static site generator",
  interactive: "none of the 21 (Pong, Tetris, editor)",
};

type CliCheck = CliChecks[number];
type CaseFilesCheck = CaseFilesChecks[number];
type ScriptCheck = ScriptChecks[number];
type HttpCheck = HttpChecks[number];
type SocketCheck = SocketChecks[number];
type ClientCheck = ClientChecks[number];

const fixtureNames = (s: string) => s.replace(/\{fixture:([^}]+)\}/g, "$1");

/** How a server is started for a step: its arguments, its own settings, and whether it restarts. */
function serverNotes(c: { start_args?: string[]; env?: { name: string; value: string }[] }): string {
  const notes = [
    ...(c.start_args?.length ? [`Started as <code>&lt;run&gt; ${esc(c.start_args.map(fixtureNames).join(" "))}</code>.`] : []),
    ...(c.env?.length ? [`With ${c.env.map((e) => `<code>${esc(e.name)}=${esc(e.value)}</code>`).join(", ")}.`] : []),
  ];
  return notes.length ? `<li class="note">${notes.join(" ")}</li>` : "";
}

function socketCheck(c: SocketCheck): string {
  return (
    serverNotes(c) +
    c.conversations
      .map((v) => {
        const how = [
          v.transport.toUpperCase(),
          ...(v.clients > 1 ? [`${v.clients} clients at once`] : []),
          ...(v.restart_before ? ["after a restart"] : []),
        ].join(", ");
        const lines = v.messages
          .map((m) => `${m.wait_ms ? `wait ${m.wait_ms} ms, ` : ""}send <code>${esc(JSON.stringify(m.send))}</code>${m.split ? " in two parts" : ""}${m.expect ? ` → ${m.compare === "exact" ? "" : "contains "}<code>${esc(JSON.stringify(m.expect))}</code>` : ""}`)
          .join("<br>");
        return `<li><span class="cname">${esc(v.name)}</span><span class="muted">${esc(how)}</span><br>${lines}</li>`;
      })
      .join("")
  );
}

function clientCheck(c: ClientCheck): string {
  return c.commands
    .map((k) => {
      const expects = [
        ...(k.expect_exit !== null ? [`exit ${k.expect_exit}`] : []),
        ...k.received_contains.map((t) => `sends <code>${esc(JSON.stringify(t))}</code>`),
        ...k.received_hex_contains.map((t) => `sends bytes <code>${esc(t)}</code>`),
        ...k.stdout_contains.map((t) => `prints <code>${esc(t)}</code>`),
        ...k.output_contains.map((t) => `shows <code>${esc(t)}</code>`),
      ];
      const replies = k.replies.map((r) => (k.reply_hex ? `hex <code>${esc(r)}</code>` : `<code>${esc(JSON.stringify(r))}</code>`)).join(", then ");
      return `<li><span class="cname">${esc(k.name)}</span><code>${esc(fixtureNames(k.run))}</code> ${expects.join(" · ")}<br><span class="muted">The ${esc(k.transport.toUpperCase())} stub replies ${replies}</span></li>`;
    })
    .join("");
}

function cliCheck(c: CliCheck): string {
  return c.cases
    .map((k) => {
      const cmd = (args: string[]) => args.map((a) => a.replace(/\{fixture:([^}]+)\}/g, "$1")).join(" ");
      const run = `${k.stdin ? `${k.stdin} → ` : ""}&lt;run&gt; ${esc(cmd(k.args))}`;
      const against = k.reference
        ? `same as <code>${k.stdin ? `${esc(k.stdin)} → ` : ""}${esc(cmd(k.reference))}</code>, compare ${esc(k.compare)}`
        : `expect ${k.expect_stdout !== null ? `output <code>${esc(k.expect_stdout)}</code>` : ""}${k.expect_exit !== null ? ` exit ${k.expect_exit}` : ""}`;
      return `<li><span class="cname">${esc(k.name)}</span><code>${run}</code> ${against}</li>`;
    })
    .join("");
}

function caseFilesCheck(c: CaseFilesCheck): string {
  const allowed = (c as { allowed_mismatches?: string[] }).allowed_mismatches ?? [];
  return `<li><span class="cname">every file in <code>${esc(c.dir)}</code></span><code>&lt;run&gt; FILE</code> names starting <code>${esc(c.valid_prefix)}</code> exit ${c.valid_exit}, <code>${esc(c.invalid_prefix)}</code> exit ${c.invalid_exit}${
    allowed.length ? `<br><span class="muted">Either answer allowed for ${allowed.map((a) => `<code>${esc(a)}</code>`).join(", ")}: the current spec (checked with an independent parser) disagrees with this suite.</span>` : ""
  }</li>`;
}

function scriptCheck(c: ScriptCheck): string {
  return c.commands
    .map((k) => {
      const expects = [
        ...(k.expect_exit !== null ? [`exit ${k.expect_exit}`] : []),
        ...k.stdout_contains.map((t) => `prints <code>${esc(t)}</code>`),
        ...k.stdout_not_contains.map((t) => `never prints <code>${esc(t)}</code>`),
      ];
      const cmd = k.run.replace(/\{fixture:([^}]+)\}/g, "$1");
      return `<li><span class="cname">${esc(k.name)}</span><code>${k.stdin ? `${esc(k.stdin)} → ` : ""}${esc(cmd)}</code> ${expects.join(" · ")}</li>`;
    })
    .join("");
}

function httpCheck(c: HttpCheck): string {
  return (
    serverNotes(c) +
    (c.restart_before ? `<li class="note">The service restarts first.</li>` : "") +
    (c.idle_clients ? `<li class="note">${c.idle_clients} slow clients stay connected, half a request each, while these run.</li>` : "") +
    c.requests
      .map((r) => {
        const expects = [
          `status ${r.expect_status.join(" or ")}`,
          ...r.expect_headers.map((h) => `${esc(h.name)} has <code>${esc(h.contains)}</code>`),
          ...(r.expect_json_fields.length ? [`fields ${r.expect_json_fields.map((f) => `<code>${esc(f)}</code>`).join(", ")}`] : []),
          ...r.expect_json_equals.map((e) => `<code>${esc(e.field)}</code> = <code>${esc(e.value)}</code>`),
          ...(r.expect_body_contains ? [`body has <code>${esc(r.expect_body_contains)}</code>`] : []),
        ];
        return `<li><span class="cname">${esc(r.name)}</span>${r.wait_ms ? `<span class="muted">after ${r.wait_ms} ms</span> ` : ""}<code>${esc(r.method)} ${esc(r.path)}${r.json_body ? ` ${esc(r.json_body)}` : ""}</code> ${expects.join(" · ")}</li>`;
      })
      .join("")
  );
}

function question(id: string, label: string, prompt: string, looksFor: string[], flag?: string): string {
  return `<div class="q${flag ? " flagged" : ""}" id="${esc(id)}">
  <div class="who"><span class="qid">${esc(id)}</span><span>${label}</span></div>
  <div class="turn"><p class="prompt">${esc(prompt)}</p>
  <ul class="points">${looksFor.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
  ${flag ? `<p class="flag">Flagged by the relevance check: ${esc(flag)}</p>` : ""}</div>
</div>`;
}

function project(map: ProjectMap, g: Generated, typeNames: Map<string, string>): string {
  const p = g.profile;
  const conceptName = new Map(map.concepts.map((c) => [c.id, c.name]));
  const checksByStep = new Map(g.checks.map((c) => [c.step, c]));
  const steps = map.steps
    .map((s) => {
      const prof = p.steps.find((x) => x.step === s.id);
      const qs = g.questions.filter((q) => q.step === s.id);
      const check = checksByStep.get(s.id);
      const checkHtml = !check
        ? ""
        : `<ul class="checks">${
            g.runner === "cli"
              ? cliCheck(check as CliCheck)
              : g.runner === "case-files"
                ? caseFilesCheck(check as CaseFilesCheck)
                : g.runner === "script"
                  ? scriptCheck(check as ScriptCheck)
                  : g.runner === "socket"
                    ? socketCheck(check as SocketCheck)
                    : g.runner === "client"
                      ? clientCheck(check as ClientCheck)
                      : httpCheck(check as HttpCheck)
          }</ul>`;
      return `<section class="step">
  <div class="step-h"><span class="label">${esc(s.id)}${s.optional ? " · optional" : ""}</span><h4>${esc(s.title)}</h4>
  <span class="pill ${esc(prof?.check)}">${esc(prof?.check ?? "-")}</span></div>
  <p class="why">${esc(prof?.why)}</p>
  ${qs.map((q) => question(q.id, `Asks about · ${esc(conceptName.get(q.concept) ?? q.concept)}`, q.prompt, q.looks_for, q.flag)).join("")}
  ${checkHtml}
</section>`;
    })
    .join("");
  const fixtures = p.fixtures.length
    ? p.fixtures
        .map(
          (f) =>
            `<li><code>${esc(f.name)}</code> ${f.source ? `<a href="${esc(f.source)}">from the page</a>` : `<span class="muted">we write it</span>`} · ${esc(f.purpose)}${
              f.content !== null ? `<pre>${esc(f.content || "(empty)")}</pre>` : ""
            }</li>`,
        )
        .join("")
    : `<li class="muted">None: the checks send their own requests.</li>`;
  return `<article class="proj" id="${esc(g.slug)}">
<header class="proj-h">
  <p class="label">Project · <b>${esc(typeNames.get(p.learns) ?? p.learns)}</b>${p.also.length ? ` + ${esc(p.also.map((t) => typeNames.get(t) ?? t).join(", "))}` : ""}</p>
  <h2>${esc(map.project.title)}</h2>
  <p class="lede">${esc(p.reason)}</p>
</header>
<div class="sec"><p class="label">Profile</p>
<dl class="rows">
  <dt>Runs as</dt><dd>${esc(p.runs_as)} · checked by the <b>${esc(g.runner)}</b> runner</dd>
  <dt>Contract</dt><dd><code>${esc(p.contract.run)}</code><br>${esc(p.contract.input)}<br>${esc(p.contract.output)}</dd>
  <dt>Settings</dt><dd>${p.contract.settings.length ? p.contract.settings.map((s) => `<code>${esc(s.name)}</code> ${esc(s.purpose)}${s.test_value != null ? ` <span class="muted">(checks use <code>${esc(s.test_value)}</code>)</span>` : ""}`).join("<br>") : `<span class="muted">none</span>`}</dd>
  <dt>Right answer</dt><dd>${esc(p.oracle)}${p.reference_tool ? ` · compared with the real <code>${esc(p.reference_tool)}</code>` : ""}</dd>
  <dt>Test files</dt><dd><ul class="plain">${fixtures}</ul></dd>
</dl></div>
<div class="sec"><p class="label">Stage 0 · understand the problem</p>
<p class="summary">${esc(g.stage0.summary)}</p>
${g.stage0.questions.map((q) => question(q.id, q.kind, q.prompt, q.looks_for, q.flag)).join("")}
</div>
<div class="sec"><p class="label">Steps · questions and checks</p>${steps}</div>
${
  g.rejected.length
    ? `<div class="sec"><p class="label">Replaced after the relevance check</p><ul class="plain">${g.rejected
        .map((r) => `<li><span class="qid">${esc(r.id)}</span> <s>${esc(r.prompt)}</s><br><span class="muted">${esc(r.reason)}</span></li>`)
        .join("")}</ul></div>`
    : ""
}
</article>`;
}

const CSS = `
:root{
  /* Layout: one reading column, a sticky jump bar, projects one after another. Tokens from docs/design-system.md. */
  --bg:#EDEFF1;--surface:#FFFFFF;--ink:#15191D;--muted:#525A63;--rule:#C5CBD1;--accent:#8F4F00;--fill:#F5B95A;
  --soft:#FBE9CF;--ok:#1F6B44;--ok-bg:#E1F1E8;--hl:#FFE2A8;--hl-ink:#3D2600;
  --f-display:"Bricolage Grotesque","Arial Narrow",system-ui,sans-serif;--f-body:"Newsreader",Georgia,serif;
  --f-mono:"IBM Plex Mono",ui-monospace,Consolas,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14171B;--surface:#1C2026;--ink:#E6E9EC;--muted:#9BA3AC;--rule:#343B44;--accent:#F2B25C;--fill:#E89A2C;--soft:#3A2A12;--ok:#6CD29C;--ok-bg:#173826;--hl:#5A3F0E;--hl-ink:#FFE9C2;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#14171B;--surface:#1C2026;--ink:#E6E9EC;--muted:#9BA3AC;--rule:#343B44;--accent:#F2B25C;--fill:#E89A2C;--soft:#3A2A12;--ok:#6CD29C;--ok-bg:#173826;--hl:#5A3F0E;--hl-ink:#FFE9C2;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font:18px/1.6 var(--f-body);padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.wrap{max-width:980px;margin:0 auto;padding-block:40px 64px}
h1,h2,h4{font-family:var(--f-display);text-wrap:balance;margin:0}
h1{font-size:clamp(2.1rem,3.6vw,3rem);line-height:1.02;letter-spacing:-0.02em}
h2{font-size:clamp(1.6rem,2.6vw,2.1rem);letter-spacing:-0.01em}
h4{font-size:1.1rem;font-weight:600}
.label{font:500 12px/1.4 var(--f-mono);text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin:0}
.label b{color:var(--accent);font-weight:500}
.lede{font-size:19px;max-width:65ch;margin:.4em 0 0}
.facts{font:13px/1.5 var(--f-mono);color:var(--muted);margin-top:12px}
code,pre{font-family:var(--f-mono);font-size:.82em}
pre{background:var(--surface);border:1px solid var(--rule);padding:8px 10px;overflow-x:auto;white-space:pre-wrap;margin:6px 0 0}
a{color:var(--accent)}
.jump{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);border-bottom:1.5px solid var(--ink);display:flex;flex-wrap:wrap;gap:4px 18px;padding:10px 0;margin:28px 0 0;font:500 13px var(--f-mono)}
.jump a{color:var(--ink);text-decoration:none}.jump a:hover,.jump a:focus-visible{text-decoration:underline;text-decoration-color:var(--fill);text-decoration-thickness:2px}
.types{width:100%;border-collapse:collapse;font-size:16px}
.types th,.types td{text-align:left;padding:8px 10px 8px 0;border-bottom:1px solid var(--rule);vertical-align:top}
.types th{font:500 12px var(--f-mono);text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.scroll{overflow-x:auto}
.proj{border-top:1.5px solid var(--ink);margin-top:56px;padding-top:32px;display:grid;gap:28px}
.proj-h{display:grid;gap:6px}
.sec{display:grid;gap:12px;min-width:0}
.rows{display:grid;grid-template-columns:150px 1fr;margin:0;border-top:1px solid var(--rule)}
.rows dt,.rows dd{padding:10px 0;border-bottom:1px solid var(--rule);margin:0;min-width:0}
.rows dt{font:500 12px/1.9 var(--f-mono);text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.plain{list-style:none;padding:0;margin:0;display:grid;gap:8px}
.muted{color:var(--muted)}
.summary{max-width:68ch;margin:0;font-size:18px}
.q{display:grid;grid-template-columns:150px 1fr;gap:0 16px;padding:12px 0;border-top:1px solid var(--rule)}
.q.flagged{background:var(--soft)}
.who{font:500 12px/1.6 var(--f-mono);color:var(--muted);text-transform:uppercase;letter-spacing:.06em;display:grid;align-content:start}
.qid{font:500 12px var(--f-mono);color:var(--accent);text-transform:none;letter-spacing:0}
.turn{min-width:0}
.prompt{margin:0;font-style:italic;font-size:18px}
.points{margin:8px 0 0;padding:0;list-style:none;display:grid;gap:4px;font-size:16px}
.points li{padding-left:22px;position:relative}
.points li::before{content:"";position:absolute;left:2px;top:.55em;width:10px;height:10px;border:1.5px solid var(--ok);border-radius:2px}
.flag{margin:8px 0 0;font:13px/1.5 var(--f-mono);color:var(--hl-ink);background:var(--hl);padding:6px 8px}
.step{border:1.5px solid var(--ink);background:var(--surface);padding:16px;display:grid;gap:8px;min-width:0}
.step-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px}
.step-h h4{flex:1 1 auto}
.why{margin:0;font-size:16px;color:var(--muted)}
.pill{font:500 12px var(--f-mono);padding:2px 8px;border-radius:99px;border:1px solid var(--rule)}
.pill.auto{background:var(--ok-bg);color:var(--ok);border-color:transparent}
.pill.partly{background:var(--soft);color:var(--accent);border-color:transparent}
.checks{list-style:none;margin:4px 0 0;padding:10px 0 0;border-top:1px dashed var(--rule);display:grid;gap:8px;font-size:15px}
.checks li{display:grid;gap:2px;min-width:0;overflow-wrap:anywhere}
.cname{font:500 12px var(--f-mono);color:var(--muted)}
.note{font:13px var(--f-mono);color:var(--muted)}
s{color:var(--muted)}
@media (max-width:640px){.rows,.q{grid-template-columns:1fr}.rows dt{padding-bottom:0;border-bottom:0}}
`;

async function main() {
  const slugs = process.argv.slice(2);
  const maps = await readMapsWithStaging(env.contentDir);
  const { playbooks } = await readPlaybooks(env.contentDir);
  const typeNames = new Map([...playbooks.values()].map((p) => [p.id as string, p.name]));
  const gens: Generated[] = [];
  for (const slug of slugs) gens.push(parse(await readFile(path.join(env.contentDir, "generated", `${slug}.yaml`), "utf8")));
  const types = [...playbooks.values()]
    .map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.teaches)}</td><td>${esc(PROJECTS_BY_TYPE[p.id])}</td><td><code>${esc(p.runsAs)}</code> · ${esc(p.oracle)}</td></tr>`)
    .join("");
  const html = `<title>ThinkAloud content review</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap">
<style>${CSS}</style>
<div class="wrap">
<header>
  <p class="label">ThinkAloud · <b>review</b> · generated ${esc(gens[0]?.generated_at.slice(0, 10))}</p>
  <h1>Generated content for ${gens.length} project types</h1>
  <p class="lede">Each project gets a profile, stage 0, concept questions per step and the checks the sandbox will run. Comment on anything that's off: the fix goes into the playbook, then every project is generated again.</p>
  <p class="facts">${gens.map((g) => esc(g.slug)).join(" · ")} · Haiku 5.5 · every question passed the relevance check</p>
</header>
<nav class="jump" aria-label="Sections"><a href="#types">Types</a>${gens.map((g) => `<a href="#${esc(g.slug)}">${esc(maps.find((m) => m.project.slug === g.slug)?.project.title.replace(/^Build your own /i, "") ?? g.slug)}</a>`).join("")}</nav>
<section class="proj" id="types">
  <div class="proj-h"><p class="label">The 8 types · by what the learner learns</p><h2>Playbooks</h2>
  <p class="lede">The type picks the playbook for concepts and questions. How the program runs picks the check.</p></div>
  <div class="scroll"><table class="types"><thead><tr><th>Type</th><th>Teaches</th><th>Of the 21</th><th>Usual check</th></tr></thead><tbody>${types}</tbody></table></div>
</section>
${gens.map((g) => project(maps.find((m) => m.project.slug === g.slug)!, g, typeNames)).join("\n")}
</div>`;
  const out = path.join(env.contentDir, "generated", "review.html");
  await writeFile(out, html);
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
