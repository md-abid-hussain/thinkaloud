import Link from "next/link";
import Header from "@/components/Header";
import ProjectCard from "@/components/ProjectCard";
import { FigureDefs } from "@/components/Figure";
import HeroDemo from "@/components/landing/HeroDemo";
import HowStory from "@/components/landing/HowStory";
import WisprFlow from "@/components/landing/WisprFlow";
import { FEATURED, catalog, projectCards } from "@/lib/catalog";
import "./landing.css";

export default async function Landing() {
  const cards = projectCards(await catalog());
  const featured = FEATURED.map((s) => cards.find((c) => c.slug === s)).filter((c) => !!c);

  return (
    <div className="pg-landing">
      <FigureDefs />
      <Header variant="landing" />

      <div className="wrap" id="top">
        <main>
          <section className="hero" aria-labelledby="hero-title">
            <div>
              <p className="tagline">Learn the part AI can&apos;t fake for you</p>
              <h1 id="hero-title"><span>Build it yourself.</span><span><em>Explain it</em> out loud.</span></h1>
              <p className="lede">Pick a coding challenge and build it in your own editor and language. ThinkAloud shows you the concepts behind each step and the best places to learn them, then asks you to explain each one in your own words. The mentor helps whenever you ask.</p>
              <div className="cta">
                <Link className="btn btn-primary" href="/projects">Browse projects</Link>
                <a className="btn btn-ghost" href="#how">See how it works</a>
              </div>
              <ul className="meta">
                <li>Free, no sign-up</li>
                <li>Speak or type</li>
                <li>Never writes your code unasked</li>
              </ul>
            </div>
            <HeroDemo />
          </section>

          <div className="credit">
            <div className="src"><span className="label">Projects from</span><span className="who-cc">Coding Challenges by John Crickett</span></div>
            <p className="note">Real tools to build, each linked to its original challenge.</p>
            <div className="links"><a href="https://codingchallenges.fyi/" target="_blank" rel="noopener noreferrer">codingchallenges.fyi ↗</a><a href="https://x.com/johncrickett" target="_blank" rel="noopener noreferrer">@johncrickett ↗</a></div>
          </div>

          <section className="band" id="why" aria-labelledby="why-title">
            <div className="sec-split">
              <div>
                <p className="label kick">Why ThinkAloud</p>
                <h2 className="h2" id="why-title">AI writes the code now. Understanding it is still your job.</h2>
              </div>
              <p className="intro">Prompt, paste, run: it works until it doesn&apos;t, and then you&apos;re stuck with code you can&apos;t explain. The concepts underneath, and how your language really handles them, are what let you drive the AI instead of following it.</p>
            </div>
            <div className="why-grid">
              <div className="col-card muted">
                <h3>Prompt and paste</h3>
                <ul>
                  <li><span className="m">×</span>Eighty lines you didn&apos;t write and can&apos;t walk through</li>
                  <li><span className="m">×</span>It runs, but you can&apos;t say why</li>
                  <li><span className="m">×</span>A wrong answer looks exactly like a right one</li>
                </ul>
              </div>
              <div className="col-card">
                <h3>With ThinkAloud</h3>
                <ul>
                  <li><span className="m">→</span>You write every line, in your own editor and language</li>
                  <li><span className="m">→</span>You learn each concept from the best sources, then explain it in your own words</li>
                  <li><span className="m">→</span>The mentor tells you what&apos;s missing and where to read about it</li>
                </ul>
              </div>
            </div>

            <div className="moat">
              <figure className="qcard">
                <span className="mark" aria-hidden="true">“</span>
                <blockquote>Fundamentals aren&apos;t dead. They&apos;re your moat.</blockquote>
                <p className="ctx">His post lists what&apos;s worth learning when AI writes the code: how networks really work, why databases lock, what breaks under heavy traffic, reading logs in a crisis, and being able to say you don&apos;t know yet.</p>
                <figcaption>
                  <span className="avatar" aria-hidden="true">PG</span>
                  <span className="by"><b>Piyush Garg</b><span>@piyushgarg_dev · 28 Oct 2026</span></span>
                  <a className="view" href="https://x.com/piyushgarg_dev/status/2115347356074045483" target="_blank" rel="noopener noreferrer">Read the post on X ↗</a>
                </figcaption>
              </figure>
              <div>
                <h3 className="fund-h">The part AI can&apos;t fake, and where you&apos;ll practise it</h3>
                <p className="fine">Each one maps to projects you can start today.</p>
                <ol className="fund-list">
                  <li><span className="n">01</span><span className="what">How text really becomes bytes, emoji included</span><span className="where"><span className="chip">wc</span><span className="chip">JSON Parser</span></span></li>
                  <li><span className="n">02</span><span className="what">What memory is doing when the file is bigger than RAM</span><span className="where"><span className="chip">wc</span></span></li>
                  <li><span className="n">03</span><span className="what">How a request crosses the network, and what a status code promises</span><span className="where"><span className="chip">URL Shortener</span></span></li>
                  <li><span className="n">04</span><span className="what">Saying &quot;I&apos;m not sure yet&quot; without getting stuck</span><span className="where"><span className="chip soft">Just say it in the chat</span></span></li>
                </ol>
              </div>
            </div>
          </section>

          <section className="band" id="how" aria-labelledby="how-title">
            <p className="label kick">How it works</p>
            <h2 className="h2" id="how-title">One project, four moves.</h2>
            <HowStory />
          </section>

          <section className="band" id="mentor" aria-labelledby="mentor-title">
            <div className="sec-split">
              <div>
                <p className="label kick">The mentor</p>
                <h2 className="h2" id="mentor-title">Help when you ask for it. Never before.</h2>
              </div>
              <p className="intro">The mentor is an AI agent. It knows the project&apos;s steps and concepts, your progress, and what you&apos;ve said, then decides how to help: a question, a nudge, a link to read, a small example. You choose how far it goes.</p>
            </div>
            <div className="mentor-grid">
              <div>
                <ol className="ladder" aria-label="Help, from least to most">
                  <li><b>Hint</b><span>a nudge in words</span></li>
                  <li><b>Similar case</b><span>not your code</span></li>
                  <li><b>Talk it through</b><span>ask anything</span></li>
                  <li><b>Show me code</b><span>only when you ask</span></li>
                </ol>
                <div className="ladder-base"><span>least help</span><span>most help</span></div>
                <p className="fine" style={{ marginTop: 12 }}>Just ask in the chat. Anything beyond a hint is noted in your help log, and you still explain the idea back yourself.</p>
              </div>
              <div className="rules">
                <div>
                  <h3>It will</h3>
                  <ul>
                    <li>Explain with words, analogies and small cases</li>
                    <li>Give whatever level of help you ask for, without making you prove you tried</li>
                    <li>Point you to the right page to learn from, not rewrite it</li>
                  </ul>
                </div>
                <div>
                  <h3>It won&apos;t</h3>
                  <ul>
                    <li>Write your solution unless you ask for it</li>
                    <li>Change your code. It only sees what you paste</li>
                    <li>Count a concept as explained unless your own words show it</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      <WisprFlow />

      <div className="wrap">
        <section className="band" id="projects" aria-labelledby="projects-title" style={{ borderTop: 0 }}>
          <div className="sec-split">
            <div>
              <p className="label kick">Start with one</p>
              <h2 className="h2" id="projects-title">Real projects, not exercises.</h2>
            </div>
            <p className="intro">Each one is a tool you&apos;d recognise, built in steps of 30 to 60 minutes. Build it in Java, Python or Node.js: the concepts are the same in every language, and the mentor finds what to study in yours.</p>
          </div>
          <div className="proj-grid">
            {featured.map((p) => <ProjectCard key={p.slug} p={p} />)}
          </div>
          <p className="fine proj-note">From <a href="https://codingchallenges.fyi/" target="_blank" rel="noopener noreferrer">Coding Challenges</a> by John Crickett. {cards.length} projects are ready, with more being written.</p>
        </section>

        <section className="band" id="faq" aria-labelledby="faq-title">
          <p className="label kick">Questions</p>
          <h2 className="h2" id="faq-title">Before you start</h2>
          <div className="faq-wrap">
            <div className="faq">
              <details><summary>Do I need to know a programming language?</summary><p>Yes, the basics of one: Java, Python or Node.js. ThinkAloud is for going deeper, into the concepts underneath and how your language handles them.</p></details>
              <details><summary>Will it write my code?</summary><p>Only if you ask, in short explained parts. It never changes your code.</p></details>
              <details><summary>Who checks my explanations?</summary><p>The mentor, an AI agent. It marks a concept explained only when your own words show you understood it, and the sentence that shows it is kept as evidence. The app checks that sentence really is yours.</p></details>
              <details><summary>Do I need Wispr Flow?</summary><p>No. Everything works with typing. Flow makes long explanations quicker to give, and it has a free plan.</p></details>
              <details><summary>What do I end up with?</summary><p>A learning log: every concept you&apos;ve explained, in your own words, with the links you learned from and the help you used. Export it as Markdown and keep it next to your project.</p></details>
              <details><summary>Is it free?</summary><p>Yes, and there&apos;s no sign-up. Your progress is kept for your browser.</p></details>
            </div>
            <aside className="keep" aria-label="Example learning log">
              <div className="logcard">
                <div className="logcard-head"><span>learning-log.md</span><span>exported today</span></div>
                <div className="logcard-body">
                  <p className="h1">What I can explain</p>
                  <p className="m">2 projects · 4 concepts · 2 hints used</p>
                  <p className="h2x"><span className="dot" style={{ background: "var(--ok)" }} />Streaming in constant memory</p>
                  <p className="m" style={{ margin: 0 }}>wc · step 2</p>
                  <blockquote>&quot;One buffer is reused for every chunk, so memory stays the same for any file.&quot;</blockquote>
                  <p className="h2x"><span className="dot" style={{ background: "var(--ok)" }} />Grammar and parsing</p>
                  <p className="m" style={{ margin: 0 }}>JSON Parser · step 6</p>
                  <blockquote>&quot;Each grammar rule becomes one routine, and nesting is just those routines calling each other.&quot;</blockquote>
                  <p className="h2x"><span className="dot" style={{ background: "var(--muted)" }} />Idempotency</p>
                  <p className="m" style={{ margin: 0 }}>URL Shortener · not yet explained</p>
                </div>
              </div>
              <p className="fine keep-cap">What you keep: your own words for every concept, ready to export.</p>
            </aside>
          </div>
        </section>

        <section className="end" aria-labelledby="end-title">
          <h2 id="end-title">Pick a project. Start explaining.</h2>
          <Link className="btn btn-primary" href="/projects">Browse projects</Link>
        </section>

        <footer className="foot">
          <div>
            <p>Projects come from <a href="https://codingchallenges.fyi/" target="_blank" rel="noopener noreferrer">Coding Challenges</a> by John Crickett (<a href="https://x.com/johncrickett" target="_blank" rel="noopener noreferrer">@johncrickett</a>). ThinkAloud writes its own short notes and links every project to its original challenge. Thank you, John.</p>
            <p>Quote from <a href="https://x.com/piyushgarg_dev/status/2115347356074045483" target="_blank" rel="noopener noreferrer">Piyush Garg on X</a>.</p>
          </div>
          <div>
            <p>Voice input works with <a href="https://wisprflow.ai/r?MD13753" target="_blank" rel="sponsored noopener noreferrer">Wispr Flow</a> (referral link).</p>
            <p>ThinkAloud · 2026</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
