import { Fragment, type ReactNode } from "react";

/**
 * A small, safe Markdown renderer for mentor replies: paragraphs, lists, fenced code, inline code, bold and links.
 * It builds React elements and never injects HTML.
 */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={blocks.length}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={blocks.length}>
          {items.map((item, n) => (
            <li key={n}>{inline(item)}</li>
          ))}
        </List>,
      );
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith("```") && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
      para.push(lines[i++]);
    }
    const heading = para.length === 1 && /^#{1,4}\s+/.test(para[0]);
    blocks.push(
      heading ? (
        <p key={blocks.length} className="md-h">
          {inline(para[0].replace(/^#{1,4}\s+/, ""))}
        </p>
      ) : (
        <p key={blocks.length}>{inline(para.join(" "))}</p>
      ),
    );
  }
  return <div className="md">{blocks}</div>;
}

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s)]+)/g;

function inline(text: string): ReactNode {
  return text.split(INLINE).map((part, n) => {
    if (!part) return null;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={n}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={n}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <a key={n} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    if (/^https?:\/\//.test(part)) return <a key={n} href={part} target="_blank" rel="noopener noreferrer">{part}</a>;
    return <Fragment key={n}>{part}</Fragment>;
  });
}
