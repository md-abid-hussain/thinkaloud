// Web access for the agents: Linkup search and fetch, the official-docs allow-list, and link verification.
// Every link shown to a learner comes from an allow-listed domain and has just returned HTTP 200.
// Uses node:https rather than fetch, which could not connect to Linkup from some networks.
import "server-only";
import https from "node:https";
import http from "node:http";
import { query } from "@/lib/db";
import { ModelUnavailable } from "@/lib/llm";

// Official documentation per language and framework. A language with no entry gets no generated notes.
export const LANGUAGE_DOCS: Record<string, string[]> = {
  java: ["docs.oracle.com", "dev.java", "openjdk.org"],
  kotlin: ["kotlinlang.org"],
  scala: ["docs.scala-lang.org", "scala-lang.org"],
  python: ["docs.python.org", "peps.python.org"],
  javascript: ["developer.mozilla.org", "tc39.es", "nodejs.org"],
  typescript: ["www.typescriptlang.org", "developer.mozilla.org", "nodejs.org"],
  node: ["nodejs.org", "developer.mozilla.org"],
  go: ["go.dev", "pkg.go.dev"],
  rust: ["doc.rust-lang.org", "docs.rs"],
  "c#": ["learn.microsoft.com"],
  csharp: ["learn.microsoft.com"],
  c: ["en.cppreference.com", "man7.org", "www.gnu.org"],
  "c++": ["en.cppreference.com", "isocpp.org"],
  cpp: ["en.cppreference.com", "isocpp.org"],
  ruby: ["docs.ruby-lang.org", "ruby-doc.org"],
  php: ["www.php.net"],
  swift: ["developer.apple.com", "docs.swift.org", "www.swift.org"],
  elixir: ["hexdocs.pm", "elixir-lang.org"],
  haskell: ["hackage.haskell.org", "www.haskell.org"],
  zig: ["ziglang.org"],
  dart: ["api.dart.dev", "dart.dev"],
  // Frameworks
  spring: ["docs.spring.io", "spring.io"],
  "spring boot": ["docs.spring.io", "spring.io"],
  django: ["docs.djangoproject.com"],
  fastapi: ["fastapi.tiangolo.com"],
  flask: ["flask.palletsprojects.com"],
  express: ["expressjs.com"],
  react: ["react.dev"],
  "next.js": ["nextjs.org"],
  nextjs: ["nextjs.org"],
  ".net": ["learn.microsoft.com"],
  "asp.net": ["learn.microsoft.com"],
  rails: ["guides.rubyonrails.org", "api.rubyonrails.org"],
  laravel: ["laravel.com"],
  tokio: ["docs.rs", "tokio.rs"],
};

// Specs, RFCs and well-known references for concept links (language-free).
export const REFERENCE_DOCS = [
  "www.rfc-editor.org", "datatracker.ietf.org", "httpwg.org", "www.unicode.org", "unicode.org", "www.w3.org",
  "developer.mozilla.org", "en.wikipedia.org", "man7.org", "www.json.org", "json.org", "www.ecma-international.org",
  "www.postgresql.org", "redis.io", "www.sqlite.org", "git-scm.com", "nginx.org", "www.gnu.org", "pubs.opengroup.org",
  "docs.python.org", "docs.oracle.com", "go.dev", "doc.rust-lang.org", "learn.microsoft.com", "codingchallenges.fyi",
  "www.iana.org", "csrc.nist.gov", "www.cloudflare.com", "research.google", "martinfowler.com",
];

export const docsFor = (language: string | null, framework: string | null = null) => {
  const l = language ? LANGUAGE_DOCS[language.toLowerCase()] ?? [] : [];
  const f = framework ? LANGUAGE_DOCS[framework.toLowerCase()] ?? [] : [];
  return [...new Set([...l, ...f])];
};

/** True when the URL is https on one of the allowed hosts (exact host, or a subdomain of it). */
export function allowed(url: string, domains: string[]) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

interface Raw { status: number; headers: http.IncomingHttpHeaders; body: string }

function request(url: string, o: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number; maxBytes?: number } = {}): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { host: u.hostname, path: u.pathname + u.search, method: o.method ?? "GET", family: 4, headers: o.headers, timeout: o.timeoutMs ?? 15000 },
      (res) => {
        let body = "";
        let size = 0;
        res.setEncoding("utf8");
        res.on("data", (c: string) => {
          size += c.length;
          if (size <= (o.maxBytes ?? 4_000_000)) body += c;
          else res.destroy();
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
        res.on("close", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (o.body) req.write(o.body);
    req.end();
  });
}

/**
 * Checks a link right now: follows up to 5 redirects, and every hop must stay on the allow-list.
 * Returns the final URL when it answers 200, otherwise null.
 */
export async function verifyLink(url: string, domains: string[], fetcher: typeof request = request): Promise<string | null> {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    if (!allowed(current, domains)) return null;
    try {
      const r = await fetcher(current, { method: "GET", headers: { "user-agent": "ThinkAloud link check (+https://codingchallenges.fyi/)", accept: "text/html,*/*" }, timeoutMs: 10000, maxBytes: 20_000 });
      if (r.status === 200) return current;
      if (r.status >= 300 && r.status < 400 && r.headers.location) {
        current = new URL(String(r.headers.location), current).toString();
        continue;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

// Linkup bills per call: a standard search and a fetch cost about half a cent each.
const LINKUP_COST = { search: 0.0055, fetch: 0.0055 };

async function linkup(path: "search" | "fetch", body: Record<string, unknown>, who: { learnerId: string | null; enrollmentId: string | null; purpose: "tutor" | "generate" }) {
  const key = process.env.LINKUP_API_KEY;
  if (!key) throw new ModelUnavailable("Search needs the server's Linkup key, which isn't set.", "config");
  const r = await request(`https://api.linkup.so/v1/${path}`, {
    method: "POST", body: JSON.stringify(body), timeoutMs: 45000,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
  });
  await query(
    `insert into llm_usage (learner_id, enrollment_id, purpose, provider, model, input_tokens, output_tokens, cost_usd)
     values ($1, $2, $3, 'linkup', $4, 0, 0, $5)`,
    [who.learnerId, who.enrollmentId, who.purpose, path === "search" ? "linkup-search-standard" : "linkup-fetch", LINKUP_COST[path]]
  );
  if (r.status === 429 || r.status >= 500) throw Object.assign(new Error(`linkup ${path} ${r.status}`), { status: r.status });
  if (r.status !== 200) throw new Error(`linkup ${path} ${r.status}: ${r.body.slice(0, 200)}`);
  return JSON.parse(r.body);
}

export interface SearchHit { title: string; url: string; snippet: string }

/** Linkup search limited to the given domains. Results off the allow-list are dropped. */
export async function searchDocs(q: string, domains: string[], who: Parameters<typeof linkup>[2], max = 6): Promise<SearchHit[]> {
  if (!domains.length) return [];
  const j = await linkup("search", { q, depth: "standard", outputType: "searchResults", includeDomains: domains, maxResults: max }, who);
  const results: { name?: string; url?: string; content?: string }[] = j.results ?? [];
  return results
    .filter((x) => x.url && allowed(x.url, domains))
    .map((x) => ({ title: (x.name ?? x.url!).slice(0, 200), url: x.url!, snippet: (x.content ?? "").slice(0, 1200) }));
}

/** Linkup fetch of one allow-listed page, as markdown, trimmed for the model. */
export async function fetchDoc(url: string, domains: string[], who: Parameters<typeof linkup>[2], maxChars = 14000) {
  if (!allowed(url, domains)) throw new Error("That page is not on the official-docs list.");
  const j = await linkup("fetch", { url }, who);
  return String(j.markdown ?? j.content ?? "").slice(0, maxChars);
}

export { request as _request };
