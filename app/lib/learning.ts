// Read models for Your learning, Concept and Settings.
import "server-only";
import { one, rows } from "@/lib/db";

export async function yourLearning(learnerId: string) {
  const me = await one<{ display_name: string | null; email: string | null; created_at: string }>(
    `select display_name, email, created_at from learner where id = $1`, [learnerId]
  );
  const projects = await rows<{ slug: string; title: string; support_level: string; language: string | null; status: string; milestones_total: number; milestones_understood: number; steps_total: number; steps_done: number }>(
    `select c.slug, c.title, en.support_level, en.language, en.status, p.milestones_total, p.milestones_understood,
            (select count(*) from step s join milestone m on m.id = s.milestone_id where m.challenge_id = c.id)::int as steps_total,
            (select count(*) from step_state ss where ss.enrollment_id = en.id and ss.status = 'done')::int as steps_done
       from enrollment en join challenge c on c.id = en.challenge_id join v_enrollment_progress p on p.enrollment_id = en.id
      where en.learner_id = $1 order by en.started_at desc`, [learnerId]
  );
  // Every concept in the learner's projects, by area, with their status and their own words.
  const concepts = await rows<{ slug: string; name: string; area: string; area_order: number; status: string; quote: string | null; project: string | null }>(
    `select distinct on (c.id) c.slug, c.name, a.name as area, a.sort_order as area_order, coalesce(cs.status, 'new') as status,
            ev.quote, ch.title as project
       from enrollment en join v_challenge_concept vc on vc.challenge_id = en.challenge_id join concept c on c.id = vc.concept_id
       join concept_area a on a.slug = c.area_slug
       left join concept_state cs on cs.concept_id = c.id and cs.learner_id = en.learner_id
       left join lateral (select e.quote, e.answer_id from evidence e where e.learner_id = en.learner_id and e.concept_id = c.id and e.kind = 'answer' order by e.created_at limit 1) ev on true
       left join answer an on an.id = ev.answer_id left join enrollment en2 on en2.id = an.enrollment_id left join challenge ch on ch.id = en2.challenge_id
      where en.learner_id = $1 order by c.id`, [learnerId]
  );
  concepts.sort((x, y) => x.area_order - y.area_order || x.name.localeCompare(y.name));
  const misconceptions = await rows<{ note: string; concept: string | null; created_at: string }>(
    `select m.note, c.name as concept, m.created_at from misconception m left join concept c on c.id = m.concept_id where m.learner_id = $1 order by m.created_at desc`, [learnerId]
  );
  const help = await rows<{ project: string; slug: string; milestone: number; step: number; title: string; level: string; n: number }>(
    `select ch.title as project, ch.slug, m.position as milestone, s.position as step, s.title, e.payload->>'level' as level, count(*)::int as n
       from event e join step s on s.id = e.step_id join milestone m on m.id = s.milestone_id join enrollment en on en.id = e.enrollment_id
       join challenge ch on ch.id = en.challenge_id where e.learner_id = $1 and e.type = 'help_given'
      group by 1, 2, 3, 4, 5, 6 order by 1, 3, 4`, [learnerId]
  );
  const later = await rows<{ prompt: string; project: string; created_at: string }>(
    `select si.prompt, ch.title as project, si.created_at from side_item si join enrollment en on en.id = si.enrollment_id
       join challenge ch on ch.id = en.challenge_id where en.learner_id = $1 and si.kind = 'later' order by si.created_at desc`, [learnerId]
  );
  return { me, projects, concepts, misconceptions, help, later };
}

export async function conceptPage(slug: string, learnerId: string | null) {
  const c = await one<{ id: string; slug: string; name: string; brief: string; area: string; content_status: string }>(
    `select c.id, c.slug, c.name, c.brief, a.name as area, c.content_status from concept c join concept_area a on a.slug = c.area_slug where c.slug = $1`, [slug]
  );
  if (!c) return null;
  const link = await one<{ title: string; url: string }>(
    `select title, url from resource where concept_id = $1 and http_status = 200 and verified_at is not null and language is null order by verified_at desc limit 1`, [c.id]
  );
  const projects = await rows<{ slug: string; title: string; milestone: number; milestone_title: string }>(
    `select ch.slug, ch.title, min(m.position) as milestone, min(m.title) as milestone_title from milestone_concept mc join milestone m on m.id = mc.milestone_id
       join challenge ch on ch.id = m.challenge_id where mc.concept_id = $1 and ch.content_status <> 'listed' group by ch.slug, ch.title order by ch.title`, [c.id]
  );
  const prereqs = await rows<{ slug: string; name: string }>(
    `select p.slug, p.name from concept_edge e join concept p on p.id = e.from_concept_id where e.to_concept_id = $1 and e.type = 'prerequisite' order by p.name`, [c.id]
  );
  let mine: { status: string; quote: string | null; languages: string[]; notes: { language: string; body: string }[] } | null = null;
  if (learnerId) {
    const st = await one<{ status: string }>(`select status from concept_state where learner_id = $1 and concept_id = $2`, [learnerId, c.id]);
    const ev = await one<{ quote: string }>(`select quote from evidence where learner_id = $1 and concept_id = $2 and kind = 'answer' order by created_at limit 1`, [learnerId, c.id]);
    const langs = (await rows<{ language: string }>(`select distinct language from enrollment where learner_id = $1 and language is not null`, [learnerId])).map((r) => r.language);
    // Language notes come only from the content; nothing is generated at runtime.
    const notes = langs.length
      ? await rows<{ language: string; body: string }>(`select language, body from language_note where concept_id = $1 and language = any($2) and framework = ''`, [c.id, langs])
      : [];
    mine = { status: st?.status ?? "new", quote: ev?.quote ?? null, languages: langs, notes };
  }
  return { concept: c, link, projects, prereqs, mine };
}
