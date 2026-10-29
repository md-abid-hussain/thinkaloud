import { redirect } from "next/navigation";
import { one } from "@/lib/db";
import { enrollmentFor, currentLearnerId, startEnrollment } from "@/lib/learner";

// A judge-ready first minute: /try/wc starts wc as a guest (Standard support, ideas only) and opens step 1.
// An existing guest keeps their enrollment and choices.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: short } = await params;
  const slug = short.startsWith("challenge-") ? short : `challenge-${short}`;
  const ok = await one<{ content_format: number }>(`select content_format from challenge where slug = $1 and content_status <> 'listed'`, [slug]);
  if (!ok) redirect("/projects");
  const learner = await currentLearnerId();
  if (!(await enrollmentFor(learner, slug))) {
    await startEnrollment({ slug }, req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null);
  }
  redirect(ok!.content_format >= 3 ? `/projects/${slug}/home` : `/projects/${slug}/m/1/s/1`);
}
