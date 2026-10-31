import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { TYPES, type ProjectType } from "./schema";

export type Playbook = { id: ProjectType; name: string; teaches: string; runsAs: string; oracle: string; body: string };

/** Reads content/playbooks: the shared rules and one playbook per type, each with a small front-matter header. */
export async function readPlaybooks(contentDir: string): Promise<{ rules: string; playbooks: Map<ProjectType, Playbook> }> {
  const dir = path.join(contentDir, "playbooks");
  const rules = await readFile(path.join(dir, "_rules.md"), "utf8");
  const playbooks = new Map<ProjectType, Playbook>();
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md")) {
    // A checkout on Windows can have CRLF line endings.
    const raw = (await readFile(path.join(dir, file), "utf8")).replace(/\r\n/g, "\n");
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) throw new Error(`${file}: missing front matter`);
    const head = parse(match[1]) as Record<string, string>;
    if (!TYPES.includes(head.id as ProjectType)) throw new Error(`${file}: unknown type ${head.id}`);
    playbooks.set(head.id as ProjectType, {
      id: head.id as ProjectType,
      name: head.name,
      teaches: head.teaches,
      runsAs: head.runs_as,
      oracle: head.oracle,
      body: match[2].trim(),
    });
  }
  for (const type of TYPES) if (!playbooks.has(type)) throw new Error(`no playbook for ${type}`);
  return { rules, playbooks };
}

/** The parts of a project's playbooks that steer other agents: what the type teaches, and what isn't wanted. */
export async function typeGuide(contentDir: string, types: ProjectType[]): Promise<string> {
  const { playbooks } = await readPlaybooks(contentDir);
  const section = (body: string, heading: string) => body.match(new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`))?.[1].trim() ?? "";
  return types
    .map((t) => playbooks.get(t)!)
    .map((p) => `${p.name}\nTeaches:\n${section(p.body, "What this type teaches")}\nNot this:\n${section(p.body, "Not this")}`)
    .join("\n\n");
}

export type ChallengePage = { url: string; text: string; downloads: string[] };

/** The URL that returns the file itself: Dropbox share links (dl=0) open a preview page, dl=1 downloads. */
export function downloadUrl(source: string): string {
  const url = new URL(source);
  if (url.hostname.endsWith("dropbox.com")) url.searchParams.set("dl", "1");
  return url.toString();
}

/**
 * The file paths inside a zip fixture, as the sandbox extracts them (runner.py puts each member under the fixtures
 * folder by its own path). Null when the download isn't a zip. Reads only the zip's central directory.
 */
export async function zipEntries(source: string): Promise<string[] | null> {
  let data: Buffer | null = null;
  for (let i = 1; i <= 5 && !data; i++) {
    try {
      const response = await fetch(downloadUrl(source), { headers: { "User-Agent": "Mozilla/5.0 ThinkAloud" }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) data = Buffer.from(await response.arrayBuffer());
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000 * i));
    }
  }
  if (!data || data.readUInt32LE(0) !== 0x04034b50) return null;
  const eocd = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  const count = data.readUInt16LE(eocd + 10);
  let at = data.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let i = 0; i < count && data.readUInt32LE(at) === 0x02014b50; i++) {
    const nameLength = data.readUInt16LE(at + 28);
    const name = data.toString("utf8", at + 46, at + 46 + nameLength);
    if (!name.endsWith("/") && !name.startsWith("__MACOSX") && !name.includes("/.") && !name.startsWith(".")) names.push(name);
    at += 46 + nameLength + data.readUInt16LE(at + 30) + data.readUInt16LE(at + 32);
  }
  return names;
}

/** Whether a fixture downloads now. Tries a few times, because a slow connect is not a dead link. */
export async function fixtureDownloads(source: string, attempts = 5): Promise<boolean> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const response = await fetch(downloadUrl(source), { headers: { "User-Agent": "Mozilla/5.0 ThinkAloud" }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return true;
      if (response.status === 404 || response.status === 410) return false;
    } catch {
      // try again
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * i));
  }
  return false;
}

/** Fetches a challenge page and keeps its readable text and the download links it offers (test files, zips). */
export async function readChallengePage(url: string, attempts = 3): Promise<ChallengePage> {
  for (let i = 1; ; i++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 ThinkAloud" }, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return pageFromHtml(url, await response.text());
    } catch (e) {
      if (i >= attempts) throw new Error(`${url}: ${e instanceof Error ? e.message : e}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * i));
    }
  }
}

export function pageFromHtml(url: string, html: string): ChallengePage {
  const downloads = [...html.matchAll(/href="([^"]+)"/g)]
    .map((m) => m[1].replace(/&amp;/g, "&"))
    .filter((href) => /dropbox\.com|\.zip(\?|$)|\.txt(\?|$)|\.tar\.gz(\?|$)/i.test(href));
  const body = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;
  const text = body
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(br|\/p|\/h\d|\/li|\/pre|\/div|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
  return { url, text, downloads: [...new Set(downloads)] };
}
