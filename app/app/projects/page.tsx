import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { FigureDefs } from "@/components/Figure";
import CatalogueBrowser from "./CatalogueBrowser";
import { PATHS, conceptAreas, learnerProgress, projectCards } from "@/lib/catalogue";
import { currentLearnerId } from "@/lib/learner";
import "./catalogue.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projects · ThinkAloud" };

export default async function Catalogue() {
  const learnerId = await currentLearnerId();
  const [cards, areas, prog] = await Promise.all([projectCards(learnerId), conceptAreas(), learnerProgress(learnerId)]);
  const known = new Set(cards.map((c) => c.slug));
  const paths = PATHS.map((p) => ({ t: p.t, shared: p.shared, slugs: p.slugs.filter((s) => known.has(s)) })).filter((p) => p.slugs.length);
  // A ready project that is in no path still gets shown, in a last group.
  const loose = cards.filter((c) => !PATHS.some((p) => p.slugs.includes(c.slug))).map((c) => c.slug);
  if (loose.length) paths.push({ t: "More projects", shared: [], slugs: loose });
  const cont = prog.cont;

  return (
    <div className="pg-catalogue">
      <FigureDefs />
      <Header variant="inner" current="projects" readyCount={cards.length} />
      <div className="wrap" id="top">
        <main>
          <section className="head" aria-labelledby="page-title">
            <p className="label"><b>Projects</b> · {cards.length} ready</p>
            <h1 id="page-title">Pick a project to build.</h1>
            <p className="lede">Each one is a real tool, split into short milestones. An idea you explain in one project counts in every project that uses it.</p>
            <p className="src">From <a href="https://codingchallenges.fyi/">Coding Challenges</a> by <a href="https://x.com/johncrickett">John Crickett</a></p>
            {cont && (
              <p className="back"><span className="dot" aria-hidden="true" />You&apos;re on {cont.short}, milestone {cont.milestone}, step {cont.step} of {cont.of}. <Link href={`/projects/${cont.slug}/home`}>Continue {cont.short} →</Link></p>
            )}
          </section>

          <CatalogueBrowser projects={cards} paths={paths} areas={areas} />

          <section className="more" aria-labelledby="more-title">
            <div>
              <p className="label">Beyond these {cards.length}</p>
              <h2 id="more-title">{109 - cards.length} more challenges are waiting on Coding Challenges.</h2>
            </div>
            <div>
              <p>John Crickett has published 109 challenges, from a shell to a BitTorrent client. These {cards.length} are the first with ThinkAloud steps and checks. The rest are on the original site to build on your own.</p>
              <ul className="examples" aria-label="Some of the other challenges">
                <li>Shell</li><li>Load Balancer</li><li>Git</li><li>Docker</li><li>Lisp Interpreter</li><li>BitTorrent Client</li>
              </ul>
              <a className="btn btn-ghost" href="https://codingchallenges.fyi/challenges/intro">Browse all 109 challenges ↗</a>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </div>
  );
}
