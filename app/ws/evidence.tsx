// Grader evidence inside the learner's own words: each met point's quote is marked with mark.ev and its number.
// Quotes match case-insensitively, ignoring runs of whitespace. The server guarantees each quote is a substring.
import type { ReactNode } from "react";

function normalise(s: string) {
  const map: number[] = [];
  let out = "";
  let ws = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/\s/.test(c)) {
      if (!ws) { out += " "; map.push(i); ws = true; }
    } else {
      const l = c.toLowerCase();
      out += l.length === 1 ? l : c;
      map.push(i);
      ws = false;
    }
  }
  return { out, map };
}

/** The [start, end) range of `quote` inside `body`, or null. */
export function findQuote(body: string, quote: string): [number, number] | null {
  const q = normalise(quote.trim()).out;
  if (!q) return null;
  const b = normalise(body);
  const at = b.out.indexOf(q);
  if (at < 0) return null;
  return [b.map[at], b.map[at + q.length - 1] + 1];
}

export function Evidence({ body, points }: { body: string; points: { met: boolean; quote: string | null }[] | null }) {
  if (!points?.length) return <>{body}</>;
  const ranges: { s: number; e: number; n: number }[] = [];
  points.forEach((p, i) => {
    if (!p.met || !p.quote) return;
    const r = findQuote(body, p.quote);
    if (r) ranges.push({ s: r[0], e: r[1], n: i + 1 });
  });
  ranges.sort((a, b) => a.s - b.s);
  const out: ReactNode[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.s < at) continue; // overlapping quotes: the first one wins
    if (r.s > at) out.push(body.slice(at, r.s));
    out.push(<mark className="ev" key={`${r.n}-${r.s}`}>{body.slice(r.s, r.e)}<sup>{r.n}</sup></mark>);
    at = r.e;
  }
  if (at < body.length) out.push(body.slice(at));
  return <>{out}</>;
}
