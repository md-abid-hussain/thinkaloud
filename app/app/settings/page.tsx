import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { currentLearnerId } from "@/lib/learner";
import { one, rows } from "@/lib/db";
import SettingsForms from "./SettingsForms";
import "../learning/inner.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · ThinkAloud" };

export default async function Settings() {
  const l = await currentLearnerId();
  const me = l ? await one<{ display_name: string | null; email: string | null }>(`select display_name, email from learner where id = $1`, [l]) : null;
  const projects = l
    ? await rows<{ slug: string; title: string; support_level: string }>(
        `select c.slug, c.title, en.support_level from enrollment en join challenge c on c.id = en.challenge_id where en.learner_id = $1 order by en.started_at`, [l]
      )
    : [];
  return (
    <>
      <Header variant="inner" />
      <div className="wrap pg-inner">
        <main>
          <section className="head">
            <p className="label"><b>Settings</b> · {me ? (me.display_name ?? "guest") : "not started"}</p>
            <h1>Your data, your choices.</h1>
            <p className="lede">You're a guest unless you add a name and email. Your progress is tied to this browser.</p>
          </section>
          <SettingsForms me={me ?? null} projects={projects} />
        </main>
        <Footer />
      </div>
    </>
  );
}
