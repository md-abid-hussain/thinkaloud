// Project figures, ported from FIG in design/catalogue.html. Each kind draws an SVG body for viewBox 0 0 280 112.
// The output is our own static markup, so it is rendered with dangerouslySetInnerHTML.

export type FigureKind =
  | "stream" | "columns" | "match" | "sort" | "diff" | "states" | "tokens" | "tape" | "tree"
  | "bits" | "hash" | "net" | "bucket" | "log" | "kv" | "short" | "pages";

export interface NetData { l: string; r: string; q: string; a: string; cap: string }
export interface TokensData { src: string; tok: [string, string][]; cap: string }
export type FigureData = NetData | TokensData | undefined;

const A = (n: string, d: number, dl?: number) => ` data-anim style="--anim:${n} ${d}s ${dl || 0}s infinite ease-in-out"`;
const M = (d: number, dl: number, dx: number, dy: number) => ` data-anim style="--anim:ta-move ${d}s ${dl || 0}s infinite linear;--dx:${dx}px;--dy:${dy}px"`;
const T = (x: number, y: number, s: string, c?: string, a?: string) => `<text x="${x}" y="${y}" class="${c || "k-t"}" text-anchor="${a || "middle"}" dominant-baseline="central">${s}</text>`;
const R = (x: number, y: number, w: number, h: number, c: string, at?: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" class="${c}"${at || ""}/>`;
const L = (a: number, b: number, c: number, d: number, k?: string) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" class="${k || "k-ink"}"/>`;
const P = (d: string, k?: string) => `<path d="${d}" class="${k || "k-ink"}"/>`;
const W = (s: string) => Math.max(40, Math.round(s.length * 6.7 + 14));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each figure kind takes its own data shape
const FIG: Record<FigureKind, (d?: any) => string> = {
  stream() { const segs = [8192, 8192, 3616]; let x = 14, o = T(14, 8, "stdin · any size", "k-m", "start");
    segs.forEach((s, i) => { const w = 252 * s / 20000; o += R(x, 16, w, 20, "k-soft") + R(x, 16, w, 20, "k-fill", A("ta-blink", 2.4, i * 0.8)) + T(x + w / 2, 26, i < 2 ? "chunk" : "rest", "k-tf"); x += w; });
    o += "<g" + M(0.8, 0, 0, 22) + ">" + R(132, 40, 16, 10, "k-fill") + "</g>" + R(84, 66, 112, 32, "k-box") + T(140, 82, "buffer · 8 KB");
    return o + L(196, 82, 210, 82) + R(210, 62, 60, 42, "k-box") + T(240, 73, "memory", "k-m") + T(240, 91, "flat"); },
  columns() { const rows = [["id", "name", "city"], ["1", "Ada", "Leeds"], ["2", "Lin", "Pune"]]; let o = T(14, 7, "one line at a time, split on tabs", "k-m", "start");
    rows.forEach((r, i) => { const y = 18 + i * 26;
      r.forEach((c, j) => { const x = 14 + j * 52;
        o += j === 1 ? R(x, y, 48, 20, "k-soft") + R(x, y, 48, 20, "k-fill", A("ta-blink", 2.4, i * 0.3)) + T(x + 24, y + 10, c, "k-tf") : R(x, y, 48, 20, "k-box") + T(x + 24, y + 10, c); }); });
    return o + L(170, 54, 198, 54, "k-arrow") + R(206, 18, 62, 72, "k-box") + T(237, 31, "name") + T(237, 54, "Ada") + T(237, 77, "Lin") + T(237, 104, "field 2 only", "k-m"); },
  match() { const lines = ["GET /home 200", "POST /login 500", "GET /about 200", "GET /api 500"]; let o = R(14, 2, 56, 18, "k-fill") + T(42, 11, "500", "k-tf") + T(78, 11, "pattern", "k-m", "start"), hit = 0;
    lines.forEach((s, i) => { const y = 28 + i * 20, h = /500/.test(s);
      o += R(14, y, 140, 16, h ? "k-soft" : "k-box") + T(22, y + 8, s, h ? "k-t" : "k-m", "start");
      if (h) { o += '<circle cx="164" cy="' + (y + 8) + '" r="4" class="k-dot"' + A("ta-blink", 2, hit * 0.5) + "/>" + L(172, y + 8, 196, 56 + hit * 14, "k-dash"); hit++; } });
    return o + R(198, 40, 70, 48, "k-box") + T(233, 30, "printed", "k-m") + R(206, 50, 54, 10, "k-soft") + R(206, 66, 54, 10, "k-soft"); },
  sort() { const h = [30, 62, 18, 48, 40], s = h.slice().sort((a, b) => a - b); let o = T(14, 8, "lines in", "k-m", "start") + T(266, 8, "in order", "k-m", "end");
    h.forEach((v, i) => { o += R(14 + i * 20, 96 - v, 14, v, "k-box"); });
    s.forEach((v, i) => { o += R(166 + i * 20, 96 - v, 14, v, "k-fill", A("ta-blink", 2.6, i * 0.25)); });
    return o + L(118, 60, 154, 60, "k-arrow") + T(136, 48, "compare", "k-m") + L(10, 97, 112, 97) + L(162, 97, 264, 97); },
  diff() { const old = ["a", "b", "c", "d"], neu = ["a", "c", "d", "e"]; let o = T(60, 8, "old file", "k-m") + T(220, 8, "new file", "k-m");
    old.forEach((s, i) => { const y = 18 + i * 22; o += s === "b" ? R(20, y, 80, 16, "k-dash") + T(30, y + 8, "−", "k-m", "start") + T(60, y + 8, s, "k-m") : R(20, y, 80, 16, "k-box") + T(60, y + 8, s); });
    neu.forEach((s, i) => { const y = 18 + i * 22; o += s === "e" ? R(180, y, 80, 16, "k-fill", A("ta-blink", 2.4, 0)) + T(190, y + 8, "+", "k-tf", "start") + T(220, y + 8, s, "k-tf") : R(180, y, 80, 16, "k-box") + T(220, y + 8, s); });
    [[0, 0], [2, 1], [3, 2]].forEach((m) => { o += L(100, 26 + m[0] * 22, 180, 26 + m[1] * 22, "k-dash"); });
    return o + T(140, 106, "keep what matches, mark the rest", "k-m"); },
  states() { let o = "";
    ([[42, "string", "k-box"], [140, "code", "k-fill"], [238, "comment", "k-soft"]] as [number, string, string][]).forEach((s, i) => { o += '<circle cx="' + s[0] + '" cy="56" r="27" class="' + s[2] + '"' + (i === 2 ? A("ta-blink", 2.6, 0) : "") + "/>" + T(s[0], 56, s[1], i === 1 ? "k-tf" : "k-t"); });
    o += P("M162 42 Q189 14 214 40", "k-arrow") + T(189, 18, "/*") + P("M214 72 Q189 100 164 72", "k-arrow") + T(189, 98, "*/");
    return o + P("M118 42 Q91 14 66 40", "k-arrow") + T(91, 18, '"') + P("M66 72 Q91 100 116 72", "k-arrow") + T(91, 98, '"'); },
  tokens(d: TokensData) { const ws = d.tok.map((t) => Math.round(t[0].length * 7 + 12)), tw = ws.reduce((a, b) => a + b, 0) + 5 * (ws.length - 1); let o = R(14, 6, 252, 24, "k-box") + T(140, 18, d.src), x = 140 - tw / 2;
    o += L(140, 32, 140, 50, "k-arrow");
    d.tok.forEach((t, i) => { const w = ws[i]; o += R(x, 56, w, 22, t[1], t[1] === "k-fill" ? A("ta-blink", 2.4, i * 0.18) : "") + T(x + w / 2, 67, t[0], t[1] === "k-fill" ? "k-tf" : "k-t"); x += w + 5; });
    return o + T(140, 98, d.cap, "k-m"); },
  tape() { const prog = "++>++[<+>-]"; let o = T(14, 8, "program", "k-m", "start");
    prog.split("").forEach((c, i) => { o += R(72 + i * 16, 2, 14, 14, i === 5 ? "k-fill" : "k-box", i === 5 ? A("ta-blink", 2, 0) : "") + T(79 + i * 16, 9, c === "<" ? "&lt;" : c === ">" ? "&gt;" : c, i === 5 ? "k-tf" : "k-t"); });
    for (let i = 0; i < 8; i++) o += R(22 + i * 30, 44, 26, 26, i === 1 ? "k-soft" : "k-box") + T(35 + i * 30, 57, "0");
    o += T(14, 34, "tape: every cell starts at 0", "k-m", "start");
    return o + "<g" + A("ta-blink", 2, 0.4) + ">" + P("M65 74 L59 84 L71 84 Z", "k-fill") + "</g>" + T(80, 92, "pointer", "k-m", "start"); },
  tree() { let o = L(140, 21, 82, 38) + L(140, 21, 198, 37) + L(198, 55, 166, 70) + L(198, 55, 232, 70);
    o += T(104, 24, "0", "k-m") + T(176, 24, "1", "k-m") + T(174, 58, "0", "k-m") + T(222, 58, "1", "k-m");
    o += '<circle cx="140" cy="12" r="9" class="k-box"/><circle cx="198" cy="46" r="9" class="k-box"/>';
    o += R(66, 38, 32, 20, "k-fill", A("ta-blink", 2.4, 0)) + T(82, 48, "e", "k-tf") + T(82, 68, "frequent", "k-m");
    o += R(150, 70, 32, 20, "k-soft") + T(166, 80, "t") + R(216, 70, 32, 20, "k-soft") + T(232, 80, "q") + T(252, 80, "rare", "k-m", "start");
    return o + T(14, 104, "short codes for common letters", "k-m", "start"); },
  bits() { const set = [2, 7, 12]; let o = R(112, 2, 56, 22, "k-fill") + T(140, 13, "cat", "k-tf") + T(176, 13, "three hashes", "k-m", "start");
    set.forEach((b) => { o += L(140, 26, 20 + b * 16, 70, "k-arrow"); });
    for (let i = 0; i < 16; i++) { const on = set.indexOf(i) > -1; o += R(13 + i * 16, 74, 14, 18, on ? "k-fill" : "k-box", on ? A("ta-blink", 2.4, set.indexOf(i) * 0.3) : "") + T(20 + i * 16, 83, on ? "1" : "0", on ? "k-tf" : "k-m"); }
    return o + T(13, 104, "bit array", "k-m", "start"); },
  hash() { const f: [string, string, number][] = [["a.jpg", "9f2c…", 1], ["b.jpg", "41ab…", 0], ["c.jpg", "9f2c…", 1]]; let o = "";
    f.forEach((r, i) => { const y = 8 + i * 34; o += P("M14 " + y + " h44 l10 10 v16 h-54 Z", "k-box") + T(37, y + 14, r[0]) + L(70, y + 13, 104, y + 13, "k-arrow") + R(110, y + 2, 66, 22, r[2] ? "k-fill" : "k-box", r[2] ? A("ta-blink", 2.4, i * 0.3) : "") + T(143, y + 13, r[1], r[2] ? "k-tf" : "k-t"); });
    return o + P("M182 21 H200 V89 H182", "k-dash") + T(208, 49, "same", "k-t", "start") + T(208, 63, "content", "k-t", "start"); },
  net(d: NetData) { let o = R(6, 30, 80, 50, "k-box") + T(46, 55, d.l) + R(194, 30, 80, 50, "k-box") + T(234, 55, d.r); const wq = W(d.q), wa = W(d.a);
    o += L(86, 42, 194, 42, "k-dash") + L(86, 68, 194, 68, "k-dash");
    o += "<g" + M(2.4, 0, 100 - wq, 0) + ">" + R(90, 33, wq, 18, "k-fill") + T(90 + wq / 2, 42, d.q, "k-tf") + "</g>";
    o += "<g" + M(2.4, 1.2, -(100 - wa), 0) + ">" + R(190 - wa, 59, wa, 18, "k-soft") + T(190 - wa / 2, 68, d.a) + "</g>";
    return o + T(140, 100, d.cap, "k-m"); },
  short() { let o = T(14, 6, "long link", "k-m", "start") + R(14, 14, 252, 22, "k-box") + T(22, 25, "example.com/blog/2026/how-dns-works", "k-t", "start");
    o += R(14, 64, 62, 24, "k-box") + T(45, 76, "visitor") + L(76, 76, 112, 76, "k-arrow") + R(118, 64, 70, 24, "k-fill", A("ta-blink", 2.4, 0)) + T(153, 76, "/x7Kq", "k-tf");
    return o + P("M188 70 Q236 66 232 40", "k-arrow") + T(198, 92, "redirect", "k-m", "start") + T(153, 102, "short code", "k-m"); },
  pages() { let o = R(14, 12, 74, 26, "k-box") + T(51, 25, "about.md") + R(14, 64, 74, 26, "k-soft") + T(51, 77, "theme");
    o += L(88, 25, 118, 46, "k-arrow") + L(88, 77, 118, 60, "k-arrow") + R(122, 38, 54, 30, "k-fill", A("ta-blink", 2.4, 0)) + T(149, 53, "build", "k-tf") + L(176, 53, 192, 53, "k-arrow");
    o += R(206, 28, 68, 38, "k-box") + R(201, 33, 68, 38, "k-box") + R(196, 38, 68, 38, "k-box") + T(230, 57, "about.html", "k-m");
    return o + T(230, 96, "public/", "k-m"); },
  bucket() { let o = '<path d="M104 30 L112 96 H168 L176 30" class="k-ink"/>';
    [[124, 86], [140, 86], [156, 86], [132, 74]].forEach((c) => { o += '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="6" class="k-fill"/>'; });
    o += "<g" + M(1.6, 0, 0, 34) + '><circle cx="140" cy="10" r="5" class="k-dot"/></g>' + T(150, 12, "refill", "k-m", "start");
    [0, 1, 2].forEach((i) => { o += "<g" + M(1.8, i * 0.6, 70, 0) + ">" + R(12, 40 + i * 16, 18, 10, "k-box") + "</g>"; });
    return o + T(40, 100, "requests", "k-m") + L(176, 54, 214, 54) + T(240, 54, "allowed") + L(176, 76, 214, 92, "k-dash") + T(244, 94, "429", "k-m"); },
  kv() { let o = R(10, 30, 64, 50, "k-box") + T(42, 55, "client") + R(196, 14, 74, 84, "k-box") + T(233, 26, "in memory", "k-m");
    o += R(204, 38, 58, 20, "k-soft") + T(233, 48, "name ada") + R(204, 64, 58, 20, "k-box") + T(233, 74, "hits 41");
    o += L(74, 42, 196, 42, "k-dash") + L(74, 68, 196, 68, "k-dash");
    o += "<g" + M(2.4, 0, 52, 0) + ">" + R(80, 33, 62, 18, "k-fill") + T(111, 42, "GET name", "k-tf") + "</g>";
    o += "<g" + M(2.4, 1.2, -60, 0) + ">" + R(150, 59, 40, 18, "k-soft") + T(170, 68, "ada") + "</g>";
    return o + T(135, 100, "commands in, replies out", "k-m"); },
  log() { const recs: [string, number][] = [["city", 0], ["name", 1], ["age", 0], ["name", 0]]; let o = R(14, 14, 96, 44, "k-box") + T(14, 6, "index in memory", "k-m", "start");
    o += T(24, 28, "name", "k-t", "start") + T(24, 46, "age", "k-t", "start");
    recs.forEach((r, i) => { const x = 14 + i * 50; o += r[1] ? R(x, 70, 46, 22, "k-dash") + T(x + 23, 81, r[0], "k-m") : R(x, 70, 46, 22, "k-box") + T(x + 23, 81, r[0]); });
    o += R(214, 70, 46, 22, "k-fill", A("ta-blink", 2.4, 0)) + T(237, 81, "new", "k-tf");
    return o + L(110, 28, 187, 68, "k-arrow") + L(110, 46, 137, 68, "k-arrow") + T(14, 104, "log on disk · only appended to", "k-m", "start"); },
};

/** Default data for the two kinds that take it, so a missing table entry still draws something sensible. */
const DEFAULTS: Partial<Record<FigureKind, FigureData>> = {
  net: { l: "browser", r: "your server", q: "GET /", a: "200 OK", cap: "one request, one response" },
  tokens: { src: '{"ok": [1, 2]}', tok: [["{", "k-box"], ['"ok"', "k-fill"], [":", "k-box"], ["[", "k-box"], ["1", "k-fill"], [",", "k-box"], ["2", "k-fill"], ["]", "k-box"], ["}", "k-box"]], cap: "text in, tokens out" },
};

export function isFigureKind(k: unknown): k is FigureKind {
  return typeof k === "string" && k in FIG;
}

/** The SVG body for one figure kind, or an empty string for an unknown kind. */
export function figureSvg(kind: string | null | undefined, data?: FigureData): string {
  if (!isFigureKind(kind)) return "";
  return FIG[kind](data ?? DEFAULTS[kind]);
}

/** The shared arrowhead marker used by .k-arrow. Render once on any page that draws figures. */
export function FigureDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <marker id="ta-ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" className="k-head" />
        </marker>
      </defs>
    </svg>
  );
}

export default function Figure({ kind, data, label, html }: { kind?: string | null; data?: FigureData; label: string; html?: string }) {
  const body = html ?? figureSvg(kind, data);
  if (!body) return null;
  return <svg viewBox="0 0 280 112" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: body }} />;
}
