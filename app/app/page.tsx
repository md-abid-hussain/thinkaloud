import Link from "next/link";
import Header from "@/components/Header";
import ProjectCard from "@/components/ProjectCard";
import { FigureDefs } from "@/components/Figure";
import HeroDemo from "@/components/landing/HeroDemo";
import HowStory from "@/components/landing/HowStory";
import WisprFlow from "@/components/landing/WisprFlow";
import { FEATURED, projectCards, readyCount } from "@/lib/catalogue";
import { currentLearnerId } from "@/lib/learner";
import "./landing.css";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const learnerId = await currentLearnerId();
  const [cards, ready] = await Promise.all([projectCards(learnerId, FEATURED), readyCount()]);
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
              <p className="lede">Pick a coding challenge. ThinkAloud breaks it into the ideas behind it, asks you to explain each one in your own words, and checks that you understood. You write the code. The mentor helps only when you ask.</p>
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
            <div className="links"><a href="https://codingchallenges.fyi/">codingchallenges.fyi ↗</a><a href="https://x.com/johncrickett">@johncrickett ↗</a></div>
          </div>

          <section className="band" id="why" aria-labelledby="why-title">
            <div className="sec-split">
              <div>
                <p className="label kick">Why ThinkAloud</p>
                <h2 className="h2" id="why-title">AI writes the code now. Understanding it is still your job.</h2>
              </div>
              <p className="intro">Prompt, paste, run: it works until it doesn&apos;t, and then you&apos;re stuck with code you can&apos;t explain. The fundamentals are what let you drive the AI instead of following it.</p>
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
                  <li><span className="m">→</span>You write every line, in your own editor</li>
                  <li><span className="m">→</span>You explain each idea in your own words before you move on</li>
                  <li><span className="m">→</span>A check tells you when you&apos;re wrong, and the mentor helps you see why</li>
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
                  <a className="view" href="https://x.com/piyushgarg_dev/status/2115347356074045483">Read the post on X ↗</a>
                </figcaption>
              </figure>
              <div>
                <h3 className="fund-h">The part AI can&apos;t fake, and where you&apos;ll practise it</h3>
                <p className="fine">Each one maps to projects you can start today.</p>
                <ol className="fund-list">
                  <li><span className="n">01</span><span className="what">How a request actually crosses the network</span><span className="where"><span className="chip">Web Server</span><span className="chip">Echo Server</span><span className="chip">curl</span></span></li>
                  <li><span className="n">02</span><span className="what">What happens when traffic jumps tenfold</span><span className="where"><span className="chip">Rate Limiter</span><span className="chip">Redis Server</span></span></li>
                  <li><span className="n">03</span><span className="what">What memory and disk are really doing</span><span className="where"><span className="chip">wc</span><span className="chip">Bitcask</span><span className="chip">Duplicate File Finder</span></span></li>
                  <li><span className="n">04</span><span className="what">Saying &quot;I&apos;m not sure yet&quot; without getting stuck</span><span className="where"><span className="chip soft">Every step has a button for it</span></span></li>
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
              <p className="intro">The mentor is an AI agent. It reads your answers, the project&apos;s notes and what you&apos;ve already learned, then decides how to help: a question, a nudge, a small example. You choose how far it goes.</p>
            </div>
            <div className="mentor-grid">
              <div>
                <ol className="ladder" aria-label="Help, from least to most">
                  <li><b>Hint</b><span>a nudge in words</span></li>
                  <li><b>Similar case</b><span>not your code</span></li>
                  <li><b>Ask the mentor</b><span>talk it through</span></li>
                  <li><b>Show me code</b><span>only when you ask</span></li>
                </ol>
                <div className="ladder-base"><span>least help</span><span>most help</span></div>
                <p className="fine" style={{ marginTop: 12 }}>Anything beyond a hint is noted in your help log. You still explain the idea back yourself.</p>
              </div>
              <div className="rules">
                <div>
                  <h3>It will</h3>
                  <ul>
                    <li>Explain with words, analogies and small cases</li>
                    <li>Give whatever level of help you ask for, without making you prove you tried</li>
                    <li>Offer more help when you&apos;re stuck, and take no for an answer</li>
                  </ul>
                </div>
                <div>
                  <h3>It won&apos;t</h3>
                  <ul>
                    <li>Write your solution unless you ask for it</li>
                    <li>Change your code. It can only read your repo</li>
                    <li>Mark anything done. Only the checks can</li>
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
            <p className="intro">Each one is a tool you&apos;d recognise, broken into milestones of 30 to 60 minutes. Work through the ideas only, or build it in the language you choose.</p>
          </div>
          <div className="proj-grid">
            {featured.map((p) => <ProjectCard key={p.slug} p={p} />)}
          </div>
          <p className="fine proj-note">From <a href="https://codingchallenges.fyi/">Coding Challenges</a> by John Crickett. {ready} projects are ready, with more being written.</p>
        </section>

        <section className="band" id="faq" aria-labelledby="faq-title">
          <p className="label kick">Questions</p>
          <h2 className="h2" id="faq-title">Before you start</h2>
          <div className="faq-wrap">
            <div className="faq">
              <details><summary>Do I need to know a programming language?</summary><p>No. You can work through the ideas only. Pick a language when you want to build it, and you can link a public GitHub repo for ThinkAloud to read.</p></details>
              <details><summary>Will it write my code?</summary><p>Only if you ask, from More help, in short explained parts. It never changes your code.</p></details>
              <details><summary>Who checks my answers?</summary><p>Answers that are a number or a short fact are checked against a stored key. Explanations are graded by AI against a fixed list of points, and every point it marks as covered quotes your own words. If a grade looks wrong, you can flag it.</p></details>
              <details><summary>Do I need Wispr Flow?</summary><p>No. Everything works with typing. Flow makes long explanations quicker to give, and it has a free plan.</p></details>
              <details><summary>What do I end up with?</summary><p>A learning log: every idea you&apos;ve explained, in your own words, with the help you used. Export it as Markdown or JSON and keep it, share it, or put it next to your project on GitHub.</p></details>
              <details><summary>Is it free?</summary><p>Yes, and there&apos;s no sign-up. Your progress stays in your browser unless you choose to save it.</p></details>
            </div>
            <aside className="keep" aria-label="Example learning log">
              <div className="logcard">
                <div className="logcard-head"><span>learning-log.md</span><span>exported today</span></div>
                <div className="logcard-body">
                  <p className="h1">What I can explain</p>
                  <p className="m">3 projects · 7 ideas · 2 hints used</p>
                  <p className="h2x"><span className="dot" style={{ background: "var(--ok)" }} />Streaming in constant memory</p>
                  <p className="m" style={{ margin: 0 }}>wc · milestone 1</p>
                  <blockquote>&quot;One buffer is reused for every chunk, so memory stays the same for any file.&quot;</blockquote>
                  <p className="h2x"><span className="dot" style={{ background: "var(--ok)" }} />Token bucket</p>
                  <p className="m" style={{ margin: 0 }}>Rate Limiter · milestone 1</p>
                  <blockquote>&quot;A burst gets through, a flood doesn&apos;t, because tokens only drip back at a fixed rate.&quot;</blockquote>
                  <p className="h2x"><span className="dot" style={{ background: "var(--muted)" }} />Path safety</p>
                  <p className="m" style={{ margin: 0 }}>Web Server · not yet explained</p>
                </div>
              </div>
              <p className="fine keep-cap">What you keep: your own words for every idea, ready to export.</p>
            </aside>
          </div>
        </section>

        <section className="end" aria-labelledby="end-title">
          <h2 id="end-title">Pick a project. Start explaining.</h2>
          <Link className="btn btn-primary" href="/projects">Browse projects</Link>
        </section>

        <footer className="foot">
          <div>
            <p>Projects come from <a href="https://codingchallenges.fyi/">Coding Challenges</a> by John Crickett (<a href="https://x.com/johncrickett">@johncrickett</a>). ThinkAloud writes its own short briefs and links every project to its original challenge. Thank you, John.</p>
            <p>Quote from <a href="https://x.com/piyushgarg_dev/status/2115347356074045483">Piyush Garg on X</a>.</p>
          </div>
          <div>
            <p>Voice input works with <a href="https://wisprflow.ai/r?MD13753" rel="sponsored noopener">Wispr Flow</a> (referral link).</p>
            <p>ThinkAloud · 2026</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
