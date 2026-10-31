import { env } from "../env";

export type SearchHit = { title: string; url: string; snippet: string };

/** Linkup Search (https://api.linkup.so/v1/search), returning plain results the agent reads itself. */
export async function linkupSearch(query: string, opts: { domains?: string[]; maxResults?: number } = {}): Promise<SearchHit[]> {
  if (!env.linkupKey) throw new Error("LINKUP_API_KEY is not set");
  const response = await fetch("https://api.linkup.so/v1/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.linkupKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      q: query,
      depth: "fast",
      outputType: "searchResults",
      maxResults: opts.maxResults ?? 6,
      ...(opts.domains?.length ? { includeDomains: opts.domains } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Linkup search failed: ${response.status}`);
  const data = (await response.json()) as { results?: { name?: string; url?: string; content?: string }[] };
  return (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({ title: r.name ?? "", url: r.url!, snippet: (r.content ?? "").slice(0, 500) }));
}

export type LinkCheck = { url: string; ok: boolean; status: number | null; finalUrl: string | null; title: string | null };

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** Opens a link the way a browser would and reports whether it answered 200, with the page title. */
export async function checkLink(url: string): Promise<LinkCheck> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    const body = response.ok ? (await response.text()).slice(0, 200_000) : "";
    const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
    return { url, ok: response.status === 200, status: response.status, finalUrl: response.url, title };
  } catch {
    return { url, ok: false, status: null, finalUrl: null, title: null };
  }
}

/**
 * Checks many links with a small concurrency limit. Links that fail for a reason other than "not found" are tried
 * again one at a time, because docs sites throttle bursts and a good link must not be dropped for that.
 */
export async function checkLinks(urls: string[], concurrency = 4): Promise<Map<string, LinkCheck>> {
  const unique = [...new Set(urls)];
  const results = new Map<string, LinkCheck>();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
      while (next < unique.length) {
        const url = unique[next++];
        results.set(url, await checkLink(url));
      }
    }),
  );
  for (const [url, result] of results) {
    if (result.ok || result.status === 404 || result.status === 410) continue;
    await new Promise((resolve) => setTimeout(resolve, 500));
    results.set(url, await checkLink(url));
  }
  return results;
}
