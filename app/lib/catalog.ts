import { figureSvg, type FigureData } from "@/components/Figure";
import type { CardProject } from "@/components/ProjectCard";
import { readMaps, type ProjectMap } from "./content";

/** The project maps, read from content/ at build time. They only change when the content files do. */
export async function catalog(): Promise<ProjectMap[]> {
  "use cache";
  return readMaps();
}

/** UI constants with no field in the maps: the challenge number on Coding Challenges, a short card title, and the card figure. */
const META: Record<string, { n: number; short: string; figure: string; data?: FigureData }> = {
  wc: { n: 1, short: "wc", figure: "stream" },
  "json-parser": {
    n: 2,
    short: "JSON Parser",
    figure: "tokens",
    data: {
      src: '{"ok": [1, 2]}',
      tok: [["{", "k-box"], ['"ok"', "k-fill"], [":", "k-box"], ["[", "k-box"], ["1", "k-fill"], [",", "k-box"], ["2", "k-fill"], ["]", "k-box"], ["}", "k-box"]],
      cap: "text in, tokens out",
    },
  },
  "url-shortener": { n: 12, short: "URL Shortener", figure: "short" },
};

/** The landing page's featured projects: the ones with maps, in this order. */
export const FEATURED = ["wc", "json-parser", "url-shortener"];

export const LEVELS = [
  { slug: "beginner", name: "Beginner" },
  { slug: "intermediate", name: "Intermediate" },
  { slug: "advanced", name: "Advanced" },
];

/** The learning paths: a grouping for the catalogue, with no field in the maps. Only projects with a map are shown. */
export const PATHS: { t: string; shared: string[]; slugs: string[] }[] = [
  { t: "Text and streams", shared: ["text encoding", "streaming in constant memory", "the command-line contract"], slugs: ["wc", "cut", "sort", "grep", "diff"] },
  { t: "Parsing and interpreters", shared: ["grammars", "lexing", "recursive descent"], slugs: ["json-parser", "calculator", "brainfuck"] },
  { t: "Networking and the web", shared: ["HTTP", "status codes", "idempotency"], slugs: ["url-shortener", "webserver", "echo", "curl"] },
];

export const shortName = (map: ProjectMap) => META[map.project.slug]?.short ?? map.project.title.replace(/^Build your own /i, "");
export const challengeNumber = (slug: string) => META[slug]?.n ?? 0;
export const figureFor = (slug: string) => figureSvg(META[slug]?.figure, META[slug]?.data);

/** A concept name as it reads inside a sentence: the part before any colon, lower-cased at the start. */
export function inSentence(name: string): string {
  const head = name.split(":")[0].trim();
  return /^[A-Z][a-z]/.test(head) ? head[0].toLowerCase() + head.slice(1) : head;
}

export type CatalogueProject = CardProject & { areas: string[]; hay: string };

/** Project cards for the landing page and the catalogue. Every map is unreviewed until Abid checks it. */
export function projectCards(maps: ProjectMap[]): CatalogueProject[] {
  return maps.map((map) => {
    const slug = map.project.slug;
    return {
      slug,
      n: challengeNumber(slug),
      short: shortName(map),
      summary: map.project.summary,
      figure: figureFor(slug),
      learn: map.concepts.slice(0, 3).map((c) => inSentence(c.name)).join(", "),
      checked: false,
      areas: [map.project.level],
      hay: [shortName(map), `#${challengeNumber(slug)}`, map.project.title, map.project.summary, map.project.level, ...map.concepts.flatMap((c) => [c.name, ...c.covers])].join(" "),
    };
  });
}
