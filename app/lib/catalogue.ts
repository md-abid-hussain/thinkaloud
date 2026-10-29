// Catalogue, landing and overview queries, plus the small UI constants that have no stored field
// (challenge numbers, short card titles, the five learning paths, and the figure data for `net` and `tokens`).
import "server-only";
import { rows, one } from "@/lib/db";
import { figureSvg, type FigureData } from "@/components/Figure";
import type { CardProject } from "@/components/ProjectCard";

export interface Meta { n: number; short: string; data?: FigureData }

/** Challenge number on Coding Challenges, the short name used on cards, and figure data where the kind takes it. */
export const META: Record<string, Meta> = {
  "challenge-wc": { n: 1, short: "wc" },
  "challenge-cut": { n: 4, short: "cut" },
  "challenge-sort": { n: 6, short: "Sort Tool" },
  "challenge-grep": { n: 9, short: "grep" },
  "challenge-diff": { n: 13, short: "diff" },
  "challenge-code-comment-remover": { n: 87, short: "Code Comment Remover" },
  "challenge-json-parser": { n: 2, short: "JSON Parser", data: { src: '{"ok": [1, 2]}', tok: [["{", "k-box"], ['"ok"', "k-fill"], [":", "k-box"], ["[", "k-box"], ["1", "k-fill"], [",", "k-box"], ["2", "k-fill"], ["]", "k-box"], ["}", "k-box"]], cap: "text in, tokens out" } },
  "challenge-calculator": { n: 7, short: "Calculator", data: { src: "(1 + 2) × 3", tok: [["(", "k-soft"], ["1", "k-fill"], ["+", "k-box"], ["2", "k-fill"], [")", "k-soft"], ["×", "k-box"], ["3", "k-fill"]], cap: "numbers, operators, brackets" } },
  "challenge-brainfuck": { n: 81, short: "Brainfuck Interpreter" },
  "challenge-huffman": { n: 3, short: "Compression Tool" },
  "challenge-bloom": { n: 53, short: "Spell Checker with a Bloom Filter" },
  "challenge-duplicate-files": { n: 75, short: "Duplicate File Finder" },
  "challenge-echo": { n: 100, short: "Echo Server", data: { l: "client", r: "echo server", q: "hello", a: "hello", cap: "bytes in, the same bytes back" } },
  "challenge-webserver": { n: 11, short: "Web Server", data: { l: "browser", r: "your server", q: "GET /", a: "200 OK", cap: "one request, one response" } },
  "challenge-curl": { n: 40, short: "curl", data: { l: "your curl", r: "a server", q: "request", a: "headers", cap: "this time you are the client" } },
  "challenge-dns-resolver": { n: 22, short: "DNS Resolver", data: { l: "resolver", r: "DNS server", q: "query", a: "answer", cap: "one small UDP packet each way" } },
  "challenge-url-shortener": { n: 12, short: "URL Shortener" },
  "challenge-ssg": { n: 77, short: "Static Site Generator" },
  "challenge-rate-limiter": { n: 27, short: "Rate Limiter" },
  "challenge-redis": { n: 8, short: "Redis Server" },
  "challenge-bitcask": { n: 96, short: "Bitcask" },
};

/** The five learning paths: a UI grouping with no stored field (see design/FIX_LIST.md). */
export const PATHS: { t: string; shared: string[]; slugs: string[] }[] = [
  { t: "Text and streams", shared: ["streaming in constant memory", "line handling", "exit codes", "testing against the real tool"],
    slugs: ["challenge-wc", "challenge-cut", "challenge-sort", "challenge-grep", "challenge-diff", "challenge-code-comment-remover"] },
  { t: "Parsing and interpreters", shared: ["tokenising", "recursive descent", "clear error messages"],
    slugs: ["challenge-json-parser", "challenge-calculator", "challenge-brainfuck"] },
  { t: "Bits and hashing", shared: ["bits and bytes", "hash functions", "reading files in chunks"],
    slugs: ["challenge-huffman", "challenge-bloom", "challenge-duplicate-files"] },
  { t: "Networking and the web", shared: ["sockets", "partial reads", "HTTP by hand", "path safety"],
    slugs: ["challenge-echo", "challenge-webserver", "challenge-curl", "challenge-dns-resolver", "challenge-url-shortener", "challenge-ssg"] },
  { t: "Storage and traffic", shared: ["append-only writes", "in-memory indexes", "many clients at once"],
    slugs: ["challenge-rate-limiter", "challenge-redis", "challenge-bitcask"] },
];

export const FEATURED = ["challenge-wc", "challenge-rate-limiter", "challenge-webserver"];

export const shortName = (slug: string, title: string) => META[slug]?.short ?? title.replace(/^Build your own /i, "");

export type ConceptStatus = "new" | "seen" | "explained" | "applied";

export interface Idea { id: string; slug: string; name: string; brief: string | null; area: string }
interface ChallengeRow {
  id: string; slug: string; title: string; summary: string | null; figure_kind: string | null;
  content_status: "listed" | "generated" | "reviewed"; level: string | null; source_url: string;
}

// ---------------------------------------------------------------------------
// Ordering ideas by prerequisite
// ---------------------------------------------------------------------------

type Edges = Map<string, string[]>; // concept id -> concept ids it is a prerequisite of

async function prerequisiteEdges(): Promise<Edges> {
  const es = await rows<{ f: string; t: string }>(`select from_concept_id as f, to_concept_id as t from concept_edge where type = 'prerequisite'`);
  const m: Edges = new Map();
  for (const e of es) (m.get(e.f) ?? m.set(e.f, []).get(e.f)!).push(e.t);
  return m;
}

/** True when `a` is a prerequisite of `b`, directly or through other concepts. */
function reaches(edges: Edges, a: string, b: string, memo: Map<string, Set<string>>): boolean {
  let down = memo.get(a);
  if (!down) {
    down = new Set();
    const stack = [...(edges.get(a) ?? [])];
    while (stack.length) {
      const x = stack.pop()!;
      if (down.has(x)) continue;
      down.add(x);
      stack.push(...(edges.get(x) ?? []));
    }
    memo.set(a, down);
  }
  return down.has(b);
}

/** A topological order of one milestone's ideas by prerequisite, stable by name. */
export function orderIdeas<T extends { id: string; name: string }>(ideas: T[], edges: Edges, memo = new Map<string, Set<string>>()): T[] {
  const left = [...ideas].sort((x, y) => x.name.localeCompare(y.name));
  const out: T[] = [];
  while (left.length) {
    let i = left.findIndex((c) => !left.some((o) => o !== c && reaches(edges, o.id, c.id, memo)));
    if (i < 0) i = 0; // a cycle cannot be stored, but never loop forever
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}

/** Each challenge's milestones with their ideas in teaching order. */
async function ideasByChallenge(ids: string[]) {
  if (!ids.length) return new Map<string, { position: number; ideas: Idea[] }[]>();
  const [list, edges] = await Promise.all([
    rows<Idea & { challenge_id: string; position: number }>(
      `select m.challenge_id, m.position, c.id, c.slug, c.name, c.brief, c.area_slug as area
         from milestone m join milestone_concept mc on mc.milestone_id = m.id join concept c on c.id = mc.concept_id
        where m.challenge_id = any($1::uuid[]) order by m.position`, [ids]),
    prerequisiteEdges(),
  ]);
  const memo = new Map<string, Set<string>>();
  const by = new Map<string, Map<number, Idea[]>>();
  for (const r of list) {
    const ms = by.get(r.challenge_id) ?? by.set(r.challenge_id, new Map()).get(r.challenge_id)!;
    (ms.get(r.position) ?? ms.set(r.position, []).get(r.position)!).push({ id: r.id, slug: r.slug, name: r.name, brief: r.brief, area: r.area });
  }
  const out = new Map<string, { position: number; ideas: Idea[] }[]>();
  for (const [cid, ms] of by) {
    out.set(cid, [...ms.entries()].sort((a, b) => a[0] - b[0]).map(([position, ideas]) => ({ position, ideas: orderIdeas(ideas, edges, memo) })));
  }
  return out;
}

/** "Streaming in constant memory" reads as "streaming in constant memory" inside a sentence; "HTTP by hand" stays. */
const PROPER = /^(Huffman|Bloom|Redis|Unix|Linux|Windows|Git|Bitcask|Brainfuck|Markdown)\b/;
const inSentence = (s: string) => (/^[A-Z][a-z]/.test(s) && !PROPER.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

// ---------------------------------------------------------------------------
// Learner state
// ---------------------------------------------------------------------------

export interface Progress { slug: string; milestone: number; done: number; total: number }
export interface Continue { slug: string; short: string; milestone: number; step: number; of: number }

export async function conceptStates(learnerId: string | null): Promise<Map<string, ConceptStatus>> {
  if (!learnerId) return new Map();
  const r = await rows<{ concept_id: string; status: ConceptStatus }>(`select concept_id, status from concept_state where learner_id = $1`, [learnerId]);
  return new Map(r.map((x) => [x.concept_id, x.status]));
}

/** Per enrolled project: the current milestone and how many of its steps are done, plus where to continue. */
export async function learnerProgress(learnerId: string | null): Promise<{ bySlug: Map<string, Progress>; cont: Continue | null }> {
  const bySlug = new Map<string, Progress>();
  if (!learnerId) return { bySlug, cont: null };
  const [steps, last] = await Promise.all([
    rows<{ enrollment_id: string; slug: string; title: string; mpos: number; spos: number; step_id: string; status: string }>(
      `select en.id as enrollment_id, c.slug, c.title, m.position as mpos, s.position as spos, s.id as step_id, coalesce(ss.status, 'not_started') as status
         from enrollment en join challenge c on c.id = en.challenge_id
         join milestone m on m.challenge_id = c.id join step s on s.milestone_id = m.id
         left join step_state ss on ss.enrollment_id = en.id and ss.step_id = s.id
        where en.learner_id = $1 order by en.id, m.position, s.position`, [learnerId]),
    one<{ enrollment_id: string; step_id: string | null }>(
      `select enrollment_id, step_id from event where learner_id = $1 and enrollment_id is not null order by id desc limit 1`, [learnerId]),
  ]);
  const byEnr = new Map<string, typeof steps>();
  for (const s of steps) (byEnr.get(s.enrollment_id) ?? byEnr.set(s.enrollment_id, []).get(s.enrollment_id)!).push(s);
  for (const list of byEnr.values()) {
    const cur = list.find((s) => s.status !== "done") ?? list[list.length - 1];
    const inMile = list.filter((s) => s.mpos === cur.mpos);
    bySlug.set(cur.slug, { slug: cur.slug, milestone: cur.mpos, done: inMile.filter((s) => s.status === "done").length, total: inMile.length });
  }
  let cont: Continue | null = null;
  const list = last && byEnr.get(last.enrollment_id);
  if (list?.length) {
    // The step of the latest event, or the next one still to do after it.
    const at = Math.max(0, list.findIndex((s) => s.step_id === last!.step_id));
    const cur = list.slice(at).find((s) => s.status !== "done") ?? list.find((s) => s.status !== "done") ?? list[at];
    cont = { slug: cur.slug, short: shortName(cur.slug, cur.title), milestone: cur.mpos, step: cur.spos, of: list.filter((s) => s.mpos === cur.mpos).length };
  }
  return { bySlug, cont };
}

// ---------------------------------------------------------------------------
// Catalogue and landing
// ---------------------------------------------------------------------------

export interface CatalogueProject extends CardProject { areas: string[]; hay: string }

async function readyChallenges(slugs?: string[]) {
  return rows<ChallengeRow>(
    `select id, slug, title, summary, figure_kind, content_status, level, source_url from challenge
      where source = 'coding_challenges' and content_status <> 'listed' ${slugs ? "and slug = any($1::text[])" : ""}`,
    slugs ? [slugs] : []
  );
}

export async function readyCount() {
  return (await one<{ n: number }>(`select count(*)::int as n from challenge where source = 'coding_challenges' and content_status <> 'listed'`))?.n ?? 0;
}

/** Cards for the given slugs (or every ready project), with the learner's progress when there is one. */
export async function projectCards(learnerId: string | null, slugs?: string[]): Promise<CatalogueProject[]> {
  const chs = await readyChallenges(slugs);
  const [ideas, states, prog, areas] = await Promise.all([
    ideasByChallenge(chs.map((c) => c.id)),
    conceptStates(learnerId),
    learnerProgress(learnerId),
    rows<{ slug: string; name: string }>(`select slug, name from concept_area`),
  ]);
  const areaName = new Map(areas.map((a) => [a.slug, a.name]));
  return chs.map((c) => {
    const ms = ideas.get(c.id) ?? [];
    const flat: Idea[] = [];
    for (const m of ms) for (const i of m.ideas) if (!flat.some((x) => x.id === i.id)) flat.push(i);
    const meta = META[c.slug];
    const short = shortName(c.slug, c.title);
    const learn = flat.slice(0, 3).map((i) => inSentence(i.name)).join(", ");
    const ar = [...new Set(flat.map((i) => i.area))];
    const path = PATHS.find((p) => p.slugs.includes(c.slug));
    const mine = flat.filter((i) => ["explained", "applied"].includes(states.get(i.id) ?? "")).length;
    const g = prog.bySlug.get(c.slug);
    return {
      slug: c.slug, n: meta?.n ?? 0, short, summary: c.summary ?? "", figure: figureSvg(c.figure_kind, meta?.data),
      learn, checked: c.content_status === "reviewed",
      going: g ? { milestone: g.milestone, done: g.done, total: g.total } : undefined,
      mine: mine || undefined,
      areas: ar,
      hay: [short, `#${meta?.n ?? ""}`, c.title, c.summary ?? "", flat.map((i) => i.name).join(" "), path?.t ?? "", path?.shared.join(" ") ?? "",
        ar.map((a) => areaName.get(a) ?? "").join(" ")].join(" "),
    };
  });
}

export async function conceptAreas() {
  return rows<{ slug: string; name: string }>(`select slug, name from concept_area order by sort_order`);
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export interface OverviewMilestone { position: number; title: string; steps: number; minutes: number; ideas: (Idea & { status: ConceptStatus })[] }
export interface Overview {
  slug: string; title: string; short: string; n: number; summary: string; level: string | null; sourceUrl: string; reviewed: boolean;
  requirements: string[]; primer: { what: string; why: string; example: string } | null; milestones: OverviewMilestone[];
}

export async function overview(slug: string, learnerId: string | null): Promise<Overview | null> {
  const c = await one<ChallengeRow & { requirements: string[]; primer: { what: string; why: string; example: string } | null }>(
    `select id, slug, title, summary, figure_kind, content_status, level, source_url, requirements, primer from challenge
      where source = 'coding_challenges' and slug = $1 and content_status <> 'listed'`, [slug]);
  if (!c) return null;
  const [ms, ideas, states] = await Promise.all([
    rows<{ position: number; title: string; steps: number; est_minutes: number }>(
      `select m.position, m.title, coalesce(e.steps, 0)::int as steps, coalesce(e.est_minutes, 0)::int as est_minutes
         from milestone m left join v_milestone_estimate e on e.milestone_id = m.id where m.challenge_id = $1 order by m.position`, [c.id]),
    ideasByChallenge([c.id]),
    conceptStates(learnerId),
  ]);
  const byPos = new Map((ideas.get(c.id) ?? []).map((m) => [m.position, m.ideas]));
  return {
    slug: c.slug, title: c.title, short: shortName(c.slug, c.title), n: META[c.slug]?.n ?? 0, summary: c.summary ?? "", level: c.level,
    sourceUrl: c.source_url, reviewed: c.content_status === "reviewed", requirements: c.requirements ?? [],
    primer: c.primer ? { what: c.primer.what, why: c.primer.why, example: c.primer.example } : null,
    milestones: ms.map((m) => ({
      position: m.position, title: m.title, steps: m.steps, minutes: m.est_minutes,
      ideas: (byPos.get(m.position) ?? []).map((i) => ({ ...i, status: states.get(i.id) ?? "new" })),
    })),
  };
}
