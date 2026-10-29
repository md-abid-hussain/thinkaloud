// Light markdown for mentor replies: paragraphs, lists, bold and inline code, built as React elements (no HTML
// is ever injected). Fenced code blocks render as code only when the learner unlocked code for that turn.
import type { ReactNode } from "react";

function inline(s: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let at = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > at) out.push(s.slice(at, m.index));
    const t = m[0];
    out.push(t.startsWith("**") ? <b key={`${key}-${i++}`}>{t.slice(2, -2)}</b> : <code key={`${key}-${i++}`}>{t.slice(1, -1)}</code>);
    at = m.index + t.length;
  }
  if (at < s.length) out.push(s.slice(at));
  return out;
}

type Block = { t: "p"; text: string } | { t: "ul"; items: string[] } | { t: "ol"; items: string[] } | { t: "code"; lang: string; text: string };

const ITEM = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/;

export function parse(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ t: "p", text: para.join(" ") }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```\s*([\w+-]*)/);
    if (fence) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      blocks.push({ t: "code", lang: fence[1] ?? "", text: body.join("\n") });
      continue;
    }
    const item = line.match(ITEM);
    if (item) {
      flush();
      const t: "ol" | "ul" = item[1] ? "ol" : "ul";
      const last = blocks[blocks.length - 1];
      if (last && last.t === t) last.items.push(item[2]);
      else blocks.push({ t, items: [item[2]] });
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    const last = blocks[blocks.length - 1];
    // A wrapped line straight after a list item continues that item.
    if (!para.length && last && (last.t === "ul" || last.t === "ol") && /^\s+/.test(line)) { last.items[last.items.length - 1] += " " + line.trim(); continue; }
    para.push(line.trim());
  }
  flush();
  return blocks;
}

export default function Markdown({ text, allowCode }: { text: string; allowCode: boolean }) {
  return (
    <>
      {parse(text).map((b, i) => {
        if (b.t === "p") return <p key={i}>{inline(b.text, String(i))}</p>;
        if (b.t === "ul") return <ul key={i}>{b.items.map((x, j) => <li key={j}>{inline(x, `${i}-${j}`)}</li>)}</ul>;
        if (b.t === "ol") return <ol key={i}>{b.items.map((x, j) => <li key={j}>{inline(x, `${i}-${j}`)}</li>)}</ol>;
        if (!allowCode) return <p key={i}>{b.text}</p>;
        return (
          <figure className="code" key={i}>
            {b.lang && <figcaption className="label">{b.lang}</figcaption>}
            <pre><code>{b.text}</code></pre>
          </figure>
        );
      })}
    </>
  );
}
