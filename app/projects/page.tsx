import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { FigureDefs } from "@/components/Figure";
import CatalogueBrowser from "./CatalogueBrowser";
import { LEVELS, PATHS, catalog, projectCards } from "@/lib/catalog";
import "./catalogue.css";

export const metadata: Metadata = { title: "Projects · ThinkAloud" };

export default async function Catalogue() {
  const cards = projectCards(await catalog());
  const known = new Set(cards.map((c) => c.slug));
  const paths = PATHS.map((p) => ({ t: p.t, shared: p.shared, slugs: p.slugs.filter((s) => known.has(s)) })).filter((p) => p.slugs.length);
  // A ready project that is in no path still gets shown, in a last group.
  const loose = cards.filter((c) => !PATHS.some((p) => p.slugs.includes(c.slug))).map((c) => c.slug);
  if (loose.length) paths.push({ t: "More projects", shared: [], slugs: loose });
  const levels = LEVELS.filter((l) => cards.some((c) => c.areas.includes(l.slug)));

  return (
    <div className="pg-catalogue">
      <FigureDefs />
      <Header variant="inner" current="projects" readyCount={cards.length} />
      <div className="wrap" id="top">
        <main>
          <section className="head" aria-labelledby="page-title">
            <p className="label"><b>Projects</b> · {cards.length} ready</p>
            <h1 id="page-title">Pick a project to build.</h1>
            <p className="lede">Each one is a real tool, built step by step in your own editor and language. Each step comes with the concepts it teaches and the best places to learn them.</p>
            <p className="src">From <a href="https://codingchallenges.fyi/" target="_blank" rel="noopener noreferrer">Coding Challenges</a> by <a href="https://x.com/johncrickett" target="_blank" rel="noopener noreferrer">John Crickett</a></p>
          </section>

          <CatalogueBrowser projects={cards} paths={paths} areas={levels} />

          <section className="more" aria-labelledby="more-title">
            <div>
              <p className="label">Beyond these {cards.length}</p>
              <h2 id="more-title">{109 - cards.length} more challenges are waiting on Coding Challenges.</h2>
            </div>
            <div>
              <p>John Crickett has published 109 challenges, from a shell to a BitTorrent client. These {cards.length} are the first with ThinkAloud maps, and more are being written. The rest are on the original site to build on your own.</p>
              <ul className="examples" aria-label="Some of the other challenges">
                <li>Rate Limiter</li><li>Web Server</li><li>Redis Server</li><li>Shell</li><li>Git</li><li>Docker</li>
              </ul>
              <a className="btn btn-ghost" href="https://codingchallenges.fyi/challenges/intro" target="_blank" rel="noopener noreferrer">Browse all 109 challenges ↗</a>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </div>
  );
}
