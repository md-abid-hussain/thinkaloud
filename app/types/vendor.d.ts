// Types for the shared JavaScript modules copied from ../db by scripts/sync-db.mjs.
declare module "@/vendor/db/support/recipes.mjs" {
  import type { Q } from "@/lib/db";
  export function keyMatches(key: { match: string; expected: unknown }, text: string, context?: string): boolean;
  export function numbersIn(text: string): { value: number; start: number; end: number }[];
  export function recipes(db: Q): {
    log(l: string, e: string | null, type: string, o?: Record<string, unknown>): Promise<unknown>;
    enroll(l: string, slug: string, o?: { language?: string | null; framework?: string | null; supportLevel?: string }): Promise<string>;
    setLanguage(l: string, e: string, language: string | null, framework?: string | null): Promise<void>;
    setSupportLevel(l: string, e: string, level: string): Promise<void>;
    seen(l: string, e: string | null, conceptId: string): Promise<void>;
    startStep(l: string, e: string, stepId: string): Promise<void>;
    setHelp(l: string, e: string, stepId: string, level: string): Promise<void>;
    thinkAnswer(l: string, e: string, stepId: string, body: string, o?: Record<string, unknown>): Promise<string>;
    refreshMilestone(l: string, e: string, milestoneId: string): Promise<boolean>;
    reflect(l: string, e: string, body: string): Promise<boolean>;
    explainBack(l: string, e: string, projectConceptId: string, body: string, o?: Record<string, unknown>): Promise<{ grade: "met" | "partial" | "not_yet"; answerId: string; attempt: number; conceptId: string; understood: string[] }>;
    outcomeMet(l: string, e: string, stepId: string): Promise<{ built: boolean }>;
  };
}
declare module "@/vendor/db/support/matching.mjs" {
  export function keyMatches(key: { match: string; expected: unknown }, text: string, context?: string): boolean;
}
