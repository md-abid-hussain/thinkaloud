import { z } from "zod";
import { one, pool } from "../db";
import type { Language } from "../progress";

/** The language layer format from PRODUCT_BRIEF.md section 5. `kind` stays loose so it fits any language. */
export const ApiItemSchema = z.object({
  name: z.string().min(1).describe("The class, interface, module, function or package name, exactly as the docs write it"),
  kind: z.string().min(1).describe("class, interface, module, function, package, or another word that fits the language"),
  why: z.string().min(1).describe("One line: what it does for this concept or step"),
  url: z.url().describe("Official documentation page for exactly this item"),
});

export const GuideSchema = z.object({
  title: z.string().min(1),
  url: z.url().describe("A guide or tutorial from the language's own documentation"),
});

/** Concepts only: how the language handles each one, and the few core pieces needed to implement it. */
export const LayerSchema = z.object({
  concepts: z.array(
    z.object({
      concept: z.string().describe("Concept id from the project map"),
      in_this_language: z.string().min(1).describe("Plain words, 2 to 3 sentences, no code: how this language represents and handles the concept"),
      study: z.array(ApiItemSchema).max(3).describe("0 to 3 core standard-library pieces central to the concept itself"),
      guides: z.array(GuideSchema).max(1),
    }),
  ),
});

export type LanguageLayer = z.infer<typeof LayerSchema>;
export type LayerStatus = "building" | "ready" | "failed";
export type LayerRecord = { status: LayerStatus; layer: LanguageLayer | null; error: string | null };

export async function getLayer(project: string, language: Language): Promise<LayerRecord | null> {
  const row = await one<{ status: LayerStatus; layer: LanguageLayer | null; error: string | null }>(
    "select status, layer, error from language_layer where project = $1 and language = $2",
    [project, language],
  );
  return row ?? null;
}

/**
 * Claims the right to build a layer: true when there was none, or the last build failed.
 * The primary key makes this safe when two learners pick the same language at once.
 */
export async function claimLayerBuild(project: string, language: Language): Promise<boolean> {
  const row = await one<{ project: string }>(
    `insert into language_layer (project, language, status) values ($1, $2, 'building')
     on conflict (project, language) do update set status = 'building', error = null, updated_at = now()
       where language_layer.status = 'failed'
          or (language_layer.status = 'building' and language_layer.updated_at < now() - interval '15 minutes')
     returning project`,
    [project, language],
  );
  return row !== null;
}

export async function saveLayer(project: string, language: Language, layer: LanguageLayer): Promise<void> {
  await pool().query(
    `update language_layer set status = 'ready', layer = $3, error = null, updated_at = now()
     where project = $1 and language = $2`,
    [project, language, JSON.stringify(layer)],
  );
}

export async function failLayer(project: string, language: Language, error: string): Promise<void> {
  await pool().query(
    `update language_layer set status = 'failed', error = $3, updated_at = now() where project = $1 and language = $2`,
    [project, language, error.slice(0, 500)],
  );
}
