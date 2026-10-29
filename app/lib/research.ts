// The research agent (claude-opus-5-5 with Linkup tools). Two jobs, one loop:
// - language: for each concept of a project, the classes, modules and APIs of the learner's language (and
//   framework), what each is for, the pitfalls, and official documentation links. Named, never written as code.
// - references: for a concept with fewer than 2 verified links, find official docs, specs, RFCs or well-known
//   references.
// Every link is on an allow-list and verified (HTTP 200) by code before it is saved. Results are cached in
// concept_language, language_note and resource, and reused by every project that shares the concept.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { one, query, rows } from "@/lib/db";
import { anthropic, FALLBACK_BETA, MENTOR_MODEL } from "@/lib/llm";
import { assertBudget, recordUsage } from "@/lib/spend";
import { createRun, registerHandler, type RunContext } from "@/lib/runs";
import { docsFor, fetchDoc, REFERENCE_DOCS, searchDocs, verifyLink } from "@/lib/web";
import { looksLikeCode } from "@/lib/codecheck";

const MODEL = MENTOR_MODEL;
const MAX_CALLS = 6;
const MAX_TOOLS = 10;
const REFS = "@references";
const STALE_MINUTES = 15;

export interface LanguageData {
  summary: string;
  classes: { name: string; purpose: string; doc?: string }[];
  pitfalls: string[];
  links: { title: string; url: string }[];
}

const Note = z.object({
  summary: z.string().min(10).max(600),
  classes: z.array(z.object({ name: z.string().min(1).max(120), purpose: z.string().min(3).max(400), doc: z.string().optional() })).min(1).max(12),
  pitfalls: z.array(z.string().min(5).max(400)).max(6),
  links: z.array(z.object({ title: z.string().min(2).max(200), url: z.string() })).min(1).max(8),
});
const Refs = z.object({ links: z.array(z.object({ title: z.string().min(2).max(200), url: z.string(), why: z.string().max(300).optional() })).min(1).max(4) });

// A class or API is named, not written: Charset, String.codePointCount, java.text.BreakIterator are fine;
// anything with arguments, operators or statements is not.
const API_NAME = /^[\w$.:#<>@\-\/ ]+(\(\))?$/;
export const apiNameOk = (s: string) => API_NAME.test(s.trim()) && !/[;=]/.test(s);

const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: "object" as const, properties, required, additionalProperties: false });
const SEARCH: Anthropic.Beta.BetaTool = { name: "search_docs", description: "Search the allowed official documentation sites. Returns titles, URLs and snippets.", input_schema: obj({ query: { type: "string" } }, ["query"]) };
const READ: Anthropic.Beta.BetaTool = { name: "read_page", description: "Read one page from the allowed documentation sites, as markdown.", input_schema: obj({ url: { type: "string" } }, ["url"]) };
const SAVE_NOTE: Anthropic.Beta.BetaTool = {
  name: "save_notes",
  description: "Save the finished notes for this concept. Links must be pages you found on the allowed sites.",
  input_schema: obj({
    summary: { type: "string", description: "Two or three sentences: how this language handles the concept" },
    classes: { type: "array", items: obj({ name: { type: "string", description: "Class, module, function or API name only, e.g. java.nio.charset.CharsetDecoder or String.codePointCount" }, purpose: { type: "string" }, doc: { type: "string", description: "Its official doc URL, if found" } }, ["name", "purpose"]) },
    pitfalls: { type: "array", items: { type: "string" } },
    links: { type: "array", items: obj({ title: { type: "string" }, url: { type: "string" } }, ["title", "url"]) },
  }, ["summary", "classes", "pitfalls", "links"]),
};
const SAVE_REFS: Anthropic.Beta.BetaTool = {
  name: "save_links",
  description: "Save the 2 to 3 best references for this concept.",
  input_schema: obj({ links: { type: "array", items: obj({ title: { type: "string" }, url: { type: "string" }, why: { type: "string" } }, ["title", "url"]) } }, ["links"]),
};

const SYSTEM_LANGUAGE = `You prepare language notes for ThinkAloud, where developers learn a concept and then build a project in their own language. For one concept and one language (and optional framework), find in the official documentation:
- the classes, modules, functions and APIs the learner needs for this concept, and what each one is for in this concept;
- the pitfalls specific to this language;
- the official documentation pages for them.

Rules:
- Use search_docs, and read_page when a snippet isn't enough. Only cite pages you actually found. Prefer the current stable version of the docs.
- Name APIs; never write code. No expressions, arguments, statements or snippets anywhere. "String.codePointCount" is fine; "s.codePointCount(0, s.length())" is not.
- Be accurate: if you are unsure an API exists, check the docs or leave it out. Prefer 4 to 8 entries that matter for this concept over a long list.
- Plain words for a junior developer. When done, call save_notes once.`;

const SYSTEM_REFS = `You find reading for a concept in ThinkAloud. Find the 2 or 3 best references a junior developer should read to understand the concept: official documentation, specifications, RFCs, or well-known references. Search with search_docs, read a page if you need to judge it, then call save_links once. Only save pages you found. Prefer primary sources and stable URLs.`;

interface Job {
  learnerId: string;
  enrollmentId: string;
  conceptId: string;
  concept: { slug: string; name: string; brief: string; lesson?: unknown };
  mode: "language" | "references";
  language: string | null;
  framework: string | null;
  domains: string[];
  emit: RunContext["emit"];
}

async function claim(conceptId: string, language: string, framework: string) {
  const ins = await one(
    `insert into concept_language (concept_id, language, framework, status) values ($1, $2, $3, 'running') on conflict do nothing returning concept_id`,
    [conceptId, language, framework]
  );
  if (ins) return true;
  // Someone else has it: take over only a failed or stale row.
  const took = await one(
    `update concept_language set status = 'running', updated_at = now()
      where concept_id = $1 and language = $2 and framework = $3
        and (status = 'failed' or (status = 'running' and updated_at < now() - make_interval(mins => $4))) returning concept_id`,
    [conceptId, language, framework, STALE_MINUTES]
  );
  return !!took;
}

async function saveResource(conceptId: string, title: string, url: string, language: string | null, framework: string | null) {
  await query(
    `insert into resource (concept_id, title, url, language, framework, http_status, verified_at) values ($1, $2, $3, $4, $5, 200, now())
     on conflict (concept_id, url) do update set http_status = 200, verified_at = now()`,
    [conceptId, title.slice(0, 200), url, language, framework]
  );
}

function render(d: LanguageData) {
  return [d.summary, "", ...d.classes.map((c) => `- ${c.name}: ${c.purpose}`), ...(d.pitfalls.length ? ["", "Pitfalls:", ...d.pitfalls.map((p) => `- ${p}`)] : []), "", ...d.links.map((l) => `${l.title}: ${l.url}`)].join("\n");
}

/** Verifies and cleans what the model wants to save. Returns the clean data or an error to send back. */
export async function cleanNote(input: z.infer<typeof Note>, domains: string[], verify = verifyLink): Promise<{ data?: LanguageData; error?: string; dropped: string[] }> {
  const dropped: string[] = [];
  const classes = input.classes.filter((c) => {
    const ok = apiNameOk(c.name) && !looksLikeCode(c.purpose);
    if (!ok) dropped.push(c.name);
    return ok;
  });
  const pitfalls = input.pitfalls.filter((p) => !looksLikeCode(p));
  const links: LanguageData["links"] = [];
  const checked = await Promise.all(input.links.map(async (l) => ({ l, ok: await verify(l.url, domains) })));
  for (const { l, ok } of checked) {
    if (ok && !links.some((x) => x.url === ok)) links.push({ title: l.title, url: ok });
    else if (!ok) dropped.push(l.url);
  }
  for (const c of classes) if (c.doc) c.doc = (await verify(c.doc, domains)) ?? undefined;
  if (!classes.length) return { error: "No usable entries: name each API without code.", dropped };
  if (!links.length) return { error: "None of the links answered 200 on the allowed sites. Search again and use URLs from the results.", dropped };
  return { data: { summary: input.summary.trim(), classes, pitfalls, links }, dropped };
}

async function research(j: Job) {
  const isLang = j.mode === "language";
  const tools = [SEARCH, READ, isLang ? SAVE_NOTE : SAVE_REFS];
  const who = { learnerId: null, enrollmentId: j.enrollmentId, purpose: "generate" as const };
  const lesson = j.concept.lesson ? `\nLesson (for context): ${JSON.stringify(j.concept.lesson).slice(0, 3000)}` : "";
  const messages: Anthropic.Beta.BetaMessageParam[] = [{
    role: "user",
    content: `Concept: ${j.concept.name} (${j.concept.slug})\nBrief: ${j.concept.brief}${lesson}\n${isLang ? `Language: ${j.language}${j.framework ? `\nFramework: ${j.framework}` : ""}` : "Find references for this concept."}\nAllowed sites: ${j.domains.join(", ")}`,
  }];
  let tools_used = 0;
  for (let call = 0; call < MAX_CALLS; call++) {
    await assertBudget(j.learnerId);
    const last = call === MAX_CALLS - 1;
    const msg = await anthropic().beta.messages.create({
      model: MODEL, max_tokens: 8000, betas: [FALLBACK_BETA], fallbacks: "default",
      output_config: { effort: "low" },
      system: [{ type: "text", text: isLang ? SYSTEM_LANGUAGE : SYSTEM_REFS, cache_control: { type: "ephemeral" } }],
      tools: last ? [isLang ? SAVE_NOTE : SAVE_REFS] : tools,
      messages,
    });
    await recordUsage({ learnerId: null, enrollmentId: j.enrollmentId, purpose: "generate", model: msg.model ?? MODEL }, msg.usage);
    const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (!uses.length || msg.stop_reason === "refusal") break;
    messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    let saved: LanguageData | { title: string; url: string }[] | null = null;
    for (const u of uses) {
      tools_used++;
      const input = u.input as Record<string, any>;
      try {
        if (tools_used > MAX_TOOLS && u.name !== SAVE_NOTE.name && u.name !== SAVE_REFS.name) throw new Error("Tool limit reached: save what you have now.");
        if (u.name === "search_docs") {
          const hits = await searchDocs(String(input.query ?? ""), j.domains, who, 6);
          await j.emit("trace", { tool: "search_docs", label: `Searched ${new URL(`https://${j.domains[0]}`).hostname}${j.domains.length > 1 ? ` and ${j.domains.length - 1} more` : ""} for ${j.concept.name}` });
          results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(hits) });
        } else if (u.name === "read_page") {
          const md = await fetchDoc(String(input.url ?? ""), j.domains, who);
          await j.emit("trace", { tool: "read_page", label: `Read ${new URL(String(input.url)).hostname}${new URL(String(input.url)).pathname.slice(0, 60)}` });
          results.push({ type: "tool_result", tool_use_id: u.id, content: md || "(empty page)" });
        } else if (u.name === "save_notes") {
          const parsed = Note.safeParse(input);
          if (!parsed.success) throw new Error(`Invalid notes: ${parsed.error.issues[0]?.message}`);
          const c = await cleanNote(parsed.data, j.domains);
          if (c.error) throw new Error(c.error);
          saved = c.data!;
          results.push({ type: "tool_result", tool_use_id: u.id, content: `Saved. Dropped: ${c.dropped.join(", ") || "nothing"}` });
        } else if (u.name === "save_links") {
          const parsed = Refs.safeParse(input);
          if (!parsed.success) throw new Error(`Invalid links: ${parsed.error.issues[0]?.message}`);
          const ok: { title: string; url: string }[] = [];
          for (const l of parsed.data.links) {
            const v = await verifyLink(l.url, j.domains);
            if (v && !ok.some((x) => x.url === v)) ok.push({ title: l.title, url: v });
          }
          if (!ok.length) throw new Error("None of the links answered 200 on the allowed sites.");
          saved = ok;
          results.push({ type: "tool_result", tool_use_id: u.id, content: "Saved." });
        } else throw new Error("Unknown tool.");
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: u.id, is_error: true, content: (e as Error).message });
      }
    }
    if (saved) return saved;
    messages.push({ role: "user", content: results });
  }
  return null;
}

async function conceptsOf(enrollmentId: string) {
  return rows<{ id: string; slug: string; name: string; brief: string; lesson: unknown; milestone: number }>(
    `select c.id, c.slug, c.name, c.brief, to_jsonb(c) -> 'lesson' as lesson, min(m.position) as milestone
       from enrollment en join milestone m on m.challenge_id = en.challenge_id join milestone_concept mc on mc.milestone_id = m.id
       join concept c on c.id = mc.concept_id where en.id = $1 group by c.id order by min(m.position), c.name`,
    [enrollmentId]
  );
}

async function languageRun(ctx: RunContext) {
  const { run } = ctx;
  const language = String(run.input.language);
  const framework = run.input.framework ? String(run.input.framework) : null;
  const domains = docsFor(language, framework);
  const concepts = await conceptsOf(run.enrollment_id!);
  let done = 0, skipped = 0, failed = 0;
  // Milestone 1 first, so the first thing the learner opens fills in first.
  for (const c of concepts) {
    if (!(await claim(c.id, language, framework ?? ""))) { skipped++; continue; }
    await ctx.emit("trace", { label: `Preparing ${language} notes: ${c.name}`, concept: c.slug });
    try {
      const data = (await research({ learnerId: run.learner_id, enrollmentId: run.enrollment_id!, conceptId: c.id, concept: c, mode: "language", language, framework, domains, emit: ctx.emit })) as LanguageData | null;
      if (!data) throw new Error("no notes saved");
      await query(`update concept_language set status = 'done', data = $4, model = $5, updated_at = now() where concept_id = $1 and language = $2 and framework = $3`,
        [c.id, language, framework ?? "", JSON.stringify(data), MODEL]);
      await query(
        `insert into language_note (concept_id, language, framework, body, content_status) values ($1, $2, $3, $4, 'generated')
         on conflict (concept_id, language, framework) do update set body = excluded.body where language_note.content_status = 'generated'`,
        [c.id, language, framework ?? "", render(data)]
      );
      for (const l of data.links) await saveResource(c.id, l.title, l.url, language, framework);
      done++;
      await ctx.emit("trace", { tool: "save_notes", label: `Saved ${language} notes for ${c.name} (${data.classes.length} APIs, ${data.links.length} links)`, concept: c.slug, saved: true });
    } catch (e) {
      failed++;
      await query(`update concept_language set status = 'failed', updated_at = now() where concept_id = $1 and language = $2 and framework = $3`, [c.id, language, framework ?? ""]);
      await ctx.emit("trace", { label: `Couldn't prepare notes for ${c.name}`, concept: c.slug, failed: true });
      if ((e as { reason?: string }).reason === "cap" || (e as { reason?: string }).reason === "config") throw e;
    }
  }
  return { language, framework, done, skipped, failed };
}

async function referencesRun(ctx: RunContext) {
  const { run } = ctx;
  const concepts = await conceptsOf(run.enrollment_id!);
  let done = 0;
  for (const c of concepts) {
    const have = await one<{ n: number }>(`select count(*)::int as n from resource where concept_id = $1 and language is null and http_status = 200 and verified_at is not null`, [c.id]);
    if ((have?.n ?? 0) >= 2) continue;
    if (!(await claim(c.id, REFS, ""))) continue;
    await ctx.emit("trace", { label: `Finding references: ${c.name}`, concept: c.slug });
    try {
      const links = (await research({ learnerId: run.learner_id, enrollmentId: run.enrollment_id!, conceptId: c.id, concept: c, mode: "references", language: null, framework: null, domains: REFERENCE_DOCS, emit: ctx.emit })) as { title: string; url: string }[] | null;
      if (!links) throw new Error("no links saved");
      for (const l of links) await saveResource(c.id, l.title, l.url, null, null);
      await query(`update concept_language set status = 'done', data = $3, updated_at = now() where concept_id = $1 and language = $2 and framework = ''`, [c.id, REFS, JSON.stringify(links)]);
      done++;
      await ctx.emit("trace", { tool: "save_links", label: `Saved ${links.length} references for ${c.name}`, concept: c.slug, saved: true });
    } catch (e) {
      await query(`update concept_language set status = 'failed', updated_at = now() where concept_id = $1 and language = $2 and framework = ''`, [c.id, REFS]);
      if ((e as { reason?: string }).reason === "cap" || (e as { reason?: string }).reason === "config") throw e;
    }
  }
  return { done };
}

registerHandler("language", languageRun);
registerHandler("references", referencesRun);

const LANGUAGE_RUNS_PER_DAY = 3;

/** Starts the language run for an enrollment, unless it is all cached or the learner hit today's limit. */
export async function startLanguageRun(learnerId: string, enrollmentId: string, language: string | null, framework: string | null) {
  if (!language || !docsFor(language, framework).length) return null;
  const active = await one<{ id: string }>(`select id from run where enrollment_id = $1 and kind = 'language' and status in ('queued', 'running') limit 1`, [enrollmentId]);
  if (active) return active.id;
  const missing = await one<{ n: number }>(
    `select count(*)::int as n from enrollment en join milestone m on m.challenge_id = en.challenge_id join milestone_concept mc on mc.milestone_id = m.id
      where en.id = $1 and not exists (select 1 from concept_language cl where cl.concept_id = mc.concept_id and cl.language = $2 and cl.framework = $3 and cl.status = 'done')`,
    [enrollmentId, language, framework ?? ""]
  );
  if (!missing?.n) return null;
  const today = await one<{ n: number }>(`select count(*)::int as n from run where learner_id = $1 and kind = 'language' and created_at > now() - interval '1 day'`, [learnerId]);
  if ((today?.n ?? 0) >= LANGUAGE_RUNS_PER_DAY) return null;
  return createRun({ kind: "language", learnerId, enrollmentId, input: { language, framework } });
}

/** Starts the reference search for a project's concepts that have fewer than 2 verified links. */
export async function startReferencesRun(learnerId: string, enrollmentId: string) {
  const active = await one(`select 1 from run where kind = 'references' and enrollment_id = $1 and status in ('queued', 'running', 'done')`, [enrollmentId]);
  if (active) return null;
  const thin = await one<{ n: number }>(
    `select count(*)::int as n from enrollment en join milestone m on m.challenge_id = en.challenge_id join milestone_concept mc on mc.milestone_id = m.id
      where en.id = $1 and (select count(*) from resource r where r.concept_id = mc.concept_id and r.language is null and r.http_status = 200) < 2
        and not exists (select 1 from concept_language cl where cl.concept_id = mc.concept_id and cl.language = '${REFS}' and cl.status in ('running', 'done'))`,
    [enrollmentId]
  );
  if (!thin?.n) return null;
  return createRun({ kind: "references", learnerId, enrollmentId, input: {} });
}
export { claim as _claim };
