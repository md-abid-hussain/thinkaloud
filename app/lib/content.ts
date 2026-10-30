import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { Db } from "./db";
import { pool } from "./db";
import { env } from "./env";
import type { Generated } from "./gen/schema";

/** The project map format from PRODUCT_BRIEF.md section 4. */
const Resource = z.object({ title: z.string().min(1), url: z.url() });

const Concept = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  covers: z.array(z.string().min(1)).default([]),
  explanation: z.string().min(1),
  why_here: z.string().min(1),
  origin: z.enum(["step", "beyond"]),
  resources: z.array(Resource).min(1).max(3),
});

const Step = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  objective: z.string().min(1),
  check: z.string().min(1),
  concepts: z.array(z.string()).default([]),
  optional: z.boolean().default(false),
});

export const ProjectMapSchema = z
  .object({
    project: z.object({
      slug: z.string().regex(/^[a-z0-9-]+$/),
      title: z.string().min(1),
      source_url: z.url(),
      level: z.enum(["beginner", "intermediate", "advanced"]),
      summary: z.string().min(1),
    }),
    concepts: z.array(Concept).min(1),
    steps: z.array(Step).min(1),
  })
  .superRefine((map, ctx) => {
    const ids = new Set(map.concepts.map((c) => c.id));
    if (ids.size !== map.concepts.length) ctx.addIssue({ code: "custom", message: "duplicate concept id" });
    const used = new Set<string>();
    for (const step of map.steps) {
      for (const id of step.concepts) {
        if (!ids.has(id)) ctx.addIssue({ code: "custom", message: `step ${step.id} uses unknown concept ${id}` });
        used.add(id);
      }
    }
    for (const id of ids) {
      if (!used.has(id)) ctx.addIssue({ code: "custom", message: `concept ${id} is used by no step` });
    }
  });

export type ProjectMap = z.infer<typeof ProjectMapSchema>;
export type Concept = ProjectMap["concepts"][number];
export type Step = ProjectMap["steps"][number];

/** Reads and validates every map in the content folder. Throws with the file name on the first bad map. */
export async function readMaps(dir: string = env.contentDir): Promise<ProjectMap[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".yaml")).sort();
  const maps: ProjectMap[] = [];
  for (const file of files) {
    const raw = parse(await readFile(path.join(dir, file), "utf8"));
    const result = ProjectMapSchema.safeParse(raw);
    if (!result.success) throw new Error(`${file}: ${z.prettifyError(result.error)}`);
    maps.push(result.data);
  }
  return maps;
}

/**
 * Reads the generated layer for a project (content/generated/<slug>.yaml: profile, stage 0, step questions, checks),
 * or null when there is none yet. It must fit its map: every question names a step and concept the map has.
 */
export async function readGenerated(slug: string, map: ProjectMap, dir: string = env.contentDir): Promise<Generated | null> {
  let raw: string;
  try {
    raw = await readFile(path.join(dir, "generated", `${slug}.yaml`), "utf8");
  } catch {
    return null;
  }
  const generated = parse(raw) as Generated;
  const steps = new Map(map.steps.map((s) => [s.id, s]));
  for (const q of generated.questions) {
    if (!steps.get(q.step)?.concepts.includes(q.concept)) throw new Error(`generated/${slug}.yaml: question ${q.id} doesn't fit the map`);
  }
  return generated;
}

/** Upserts the maps (and their generated layers) into the project table, so the database always matches content/. */
export async function loadMaps(maps: ProjectMap[], db: Db = pool(), dir: string = env.contentDir): Promise<void> {
  for (const map of maps) {
    const generated = await readGenerated(map.project.slug, map, dir);
    await db.query(
      `insert into project (slug, title, source_url, level, map, generated) values ($1, $2, $3, $4, $5, $6)
       on conflict (slug) do update
         set title = excluded.title, source_url = excluded.source_url, level = excluded.level,
             map = excluded.map, generated = excluded.generated, loaded_at = now()`,
      [map.project.slug, map.project.title, map.project.source_url, map.project.level, JSON.stringify(map), generated ? JSON.stringify(generated) : null],
    );
  }
}

export async function getMap(slug: string, db: Db = pool()): Promise<ProjectMap | null> {
  const result = await db.query<{ map: ProjectMap }>("select map from project where slug = $1", [slug]);
  return result.rows[0]?.map ?? null;
}

export async function getGenerated(slug: string, db: Db = pool()): Promise<Generated | null> {
  const result = await db.query<{ generated: Generated | null }>("select generated from project where slug = $1", [slug]);
  return result.rows[0]?.generated ?? null;
}
