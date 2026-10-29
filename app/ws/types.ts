// Shapes of the server view models, for the client components. Type-only imports: nothing server-side is bundled.
import type { projectHome, stepView, teachBackView, GradedView } from "@/lib/views";

export type StepData = NonNullable<Awaited<ReturnType<typeof stepView>>>;
export type TeachData = NonNullable<Awaited<ReturnType<typeof teachBackView>>>;
export type HomeData = NonNullable<Awaited<ReturnType<typeof projectHome>>>;
export type Milestones = StepData["milestones"];
export type { GradedView };

export type Grade = "met" | "partial" | "not_yet";
export interface ResultPoint { id: string; point: string; concept: string | null; met: boolean; quote: string | null; why?: string | null }
export interface GradeResult {
  target?: string;
  grade: Grade;
  answerId: string;
  attempt: number;
  points: ResultPoint[];
  feedback: string | null;
  followup: string | null;
  explained?: string[];
  understood?: boolean;
}

/** What the transcript shows for one graded answer, from a fresh result or from the stored latest answer. */
export interface Shown {
  body: string;
  grade: Grade | "ungraded";
  by: "key" | "model" | null;
  points: ResultPoint[] | null;
  feedback: string | null;
  followup: string | null;
  answerId: string;
  disputed: boolean;
  at: number;
  spoke: number;
}

export function shownFromLatest(l: GradedView | null): Shown | null {
  if (!l) return null;
  return {
    body: l.body, grade: l.grade, by: l.gradedBy, points: l.points, feedback: l.feedback ?? null, followup: l.followup ?? null,
    answerId: l.answerId, disputed: l.disputed, at: new Date(l.createdAt).getTime(), spoke: 0,
  };
}

export const SUPPORT_NAMES: Record<string, string> = { guided: "Guided", standard: "Standard", independent: "Independent" };
export const STATUS_WORD: Record<string, string> = { new: "New", seen: "Seen", explained: "Explained", applied: "Applied" };
