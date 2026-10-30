"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { TurnEvent } from "@/lib/agent/bus";
import { LANGUAGES, stepLabel, type Language } from "@/lib/progress";
import type { Intent, Message, Review, ToolLine } from "@/lib/repo";
import type { ChatView } from "@/lib/view";
import { Mark } from "../Mark";
import { CompleteCard, ReviewCard, SetupCard, Stage0Card, StepCard, WelcomeCard } from "./Cards";
import { LearnerMessage, MentorMessage, Row } from "./Messages";
import { Panel } from "./Panel";

type Live = { id: number; text: string; tools: ToolLine[]; intent: Intent | null };

const PLACEHOLDER: Record<string, string> = {
  "choose-language": "Your language…",
  stage0: "Ask about the problem…",
  "link-repo": "Paste your GitHub repo link…",
  answer: "Answer in your own words…",
  reviewing: "Ask while it runs…",
  build: "Ask the mentor anything…",
  questions: "Ask, or say “ask me”…",
  complete: "Ask anything…",
};

/** The one action the Now strip offers: it sends a message, focuses the box with a start, or links. */
type NowAction = { label: string; send?: string; prefill?: string; href?: string };

function nowAction(view: ChatView, slug: string): NowAction | null {
  const next = view.progress.next;
  const label = "step" in next ? stepLabel(view.map, next.step) : "";
  switch (next.kind) {
    case "stage0":
      return { label: "Ask me the questions", send: "I've read it. Ask me the questions about the problem." };
    case "link-repo":
      return { label: "Paste my repo link", prefill: "My repo is https://github.com/" };
    case "build":
      return { label: `Review ${label}`, send: `I pushed ${label}. Please review it.` };
    case "questions":
      return { label: `Ask me ${label}'s questions`, send: `Ask me ${label}'s questions.` };
    case "answer":
      return { label: "Answer", prefill: "" };
    case "complete":
      return { label: "Export learning log", href: `/api/p/${slug}/export` };
    default:
      return null;
  }
}

async function loadView(slug: string): Promise<ChatView> {
  const response = await fetch(`/api/p/${slug}/state`, { cache: "no-store" });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Couldn't load the project.");
  return (await response.json()) as ChatView;
}

/** The review the Now strip reports: the running one, or the latest finished one for the current step. */
function reviewStatus(view: ChatView): { review: Review; text: string; tone: string } | null {
  const running = view.reviews.find((r) => r.status === "running");
  const current = view.progress.currentStep?.id;
  const review = running ?? [...view.reviews].reverse().find((r) => r.stepId === current);
  if (!review) return null;
  const label = stepLabel(view.map, review.stepId);
  if (review.status === "running") return { review, text: `Reviewing ${label}`, tone: "running" };
  if (review.status === "passed") return { review, text: `${label} review passed`, tone: "ok" };
  if (review.status === "failed") return { review, text: `${label} review: not yet`, tone: "soft" };
  return { review, text: `${label} review couldn't run`, tone: "plain" };
}

export function ChatApp({ slug, title, level, sourceUrl }: { slug: string; title: string; level: string; sourceUrl: string }) {
  const [view, setView] = useState<ChatView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [tab, setTab] = useState<"chat" | "progress">("chat");
  const following = useRef<EventSource | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(
    () =>
      loadView(slug).then(
        (next) => {
          setView(next);
          setLoadError(null);
        },
        (error: unknown) => setLoadError(error instanceof Error ? error.message : "Couldn't load the project."),
      ),
    [slug],
  );

  /** Streams one mentor reply. A reconnect replays from the start, so the text resets on every open. */
  const follow = useCallback(
    (id: number) => {
      following.current?.close();
      const source = new EventSource(`/api/messages/${id}/stream`);
      following.current = source;
      source.onopen = () => setLive({ id, text: "", tools: [], intent: null });
      source.onmessage = (e) => {
        const event = JSON.parse(e.data) as TurnEvent;
        setLive((cur) => {
          const base = cur && cur.id === id ? cur : { id, text: "", tools: [], intent: null };
          switch (event.type) {
            case "intent":
              return { ...base, intent: event.intent };
            case "tool":
              return { ...base, tools: [...base.tools, event.line] };
            case "delta":
              return { ...base, text: base.text + event.text };
            case "reset":
              return { ...base, text: "" };
            default:
              return base;
          }
        });
        if (event.type === "done") {
          source.close();
          following.current = null;
          void refresh().then(() => setLive(null));
        }
      };
    },
    [refresh],
  );

  useEffect(() => {
    let active = true;
    loadView(slug).then(
      (next) => active && setView(next),
      (error: unknown) => active && setLoadError(error instanceof Error ? error.message : "Couldn't load the project."),
    );
    return () => {
      active = false;
      following.current?.close();
    };
  }, [slug]);

  // Pick up a reply that was still running when the page loaded.
  useEffect(() => {
    if (view?.pending && !following.current) follow(view.pending);
  }, [view?.pending, follow]);

  // While a review runs or the language notes are being looked up, check back every few seconds.
  const waiting = view?.reviewing || view?.layer?.status === "building";
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void refresh(), 4000);
    return () => clearInterval(timer);
  }, [waiting, refresh]);

  // Keep the newest message in view, unless the learner has scrolled up to read.
  useLayoutEffect(() => {
    const el = thread.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [view?.messages.length, live?.text, live?.tools.length]);

  const send = useCallback(
    async (text: string) => {
      const body = text.trim();
      if (!body || sending || view?.pending || live) return;
      setSending(true);
      setSendError(null);
      setTab("chat");
      stick.current = true;
      try {
        const response = await fetch(`/api/p/${slug}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: body }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Couldn't send your message.");
        const pending: Message = { id: data.mentorId, role: "mentor", intent: null, text: "", status: "pending", meta: {}, createdAt: new Date().toISOString() };
        setView((cur) => (cur ? { ...cur, messages: [...cur.messages, data.learner as Message, pending], pending: data.mentorId } : cur));
        setDraft("");
        follow(data.mentorId);
      } catch (error) {
        setSendError(error instanceof Error ? error.message : "Couldn't send your message.");
      } finally {
        setSending(false);
        input.current?.focus();
      }
    },
    [slug, sending, view?.pending, live, follow],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
  };

  const busy = sending || !!view?.pending || !!live;
  const next = view?.progress.next;
  const status = view ? reviewStatus(view) : null;
  const action = view ? nowAction(view, slug) : null;

  const runAction = (a: NowAction) => {
    if (a.send) return void send(a.send);
    setTab("chat");
    if (a.prefill !== undefined && !draft) setDraft(a.prefill);
    requestAnimationFrame(() => input.current?.focus());
  };

  /** From the rail: show the chat and scroll its card into view, if it's there yet. */
  const jump = (cardId: string) => {
    setTab("chat");
    stick.current = false;
    // Only the conversation scrolls; scrollIntoView would also move the page under the sticky header.
    requestAnimationFrame(() => {
      const card = document.getElementById(cardId);
      if (card && thread.current) thread.current.scrollTo({ top: card.offsetTop - 16, behavior: "smooth" });
    });
  };

  const tabKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const to = tab === "chat" ? "progress" : "chat";
    setTab(to);
    document.getElementById(`tab-${to}`)?.focus();
  };

  return (
    <div className={`chat-page tab-${tab}`}>
      <header className="chat-top">
        <Mark />
        <div className="project-id">
          <h1 className="ptitle-top">{title}</h1>
          <span className="pill plain">{level}</span>
        </div>
        <nav aria-label="Project">
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="hide-sm">
            Original challenge ↗
          </a>
        </nav>
      </header>

      <div className="now-bar">
        <p className="now" aria-live="polite">
          <span className="label">
            <b>Now</b>
          </span>
          <span className="now-text">{next?.text ?? "Opening the project"}</span>
        </p>
        <div className="now-side">
          {status && (
            <span className={`rstatus rs-${status.tone}`}>
              {status.tone === "running" && <i className="dot" aria-hidden="true" />}
              {status.text}
            </span>
          )}
          {action &&
            (action.href ? (
              <a className="btn btn-sm btn-primary" href={action.href}>
                {action.label}
              </a>
            ) : (
              <button type="button" className="btn btn-sm btn-primary" disabled={!!action.send && busy} onClick={() => runAction(action)}>
                {action.label}
              </button>
            ))}
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="View" onKeyDown={tabKeys}>
        <button type="button" role="tab" id="tab-chat" aria-controls="panel-chat" aria-selected={tab === "chat"} tabIndex={tab === "chat" ? 0 : -1} onClick={() => setTab("chat")}>
          Chat
        </button>
        <button type="button" role="tab" id="tab-progress" aria-controls="panel-progress" aria-selected={tab === "progress"} tabIndex={tab === "progress" ? 0 : -1} onClick={() => setTab("progress")}>
          Progress {view ? `${view.progress.counts.stepsDone}/${view.progress.counts.stepsRequired}` : ""}
        </button>
      </div>

      <main className="chat-main">
        <div className="thread-col" id="panel-chat" aria-label="Conversation">
          <div
            className="thread"
            ref={thread}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
          >
            <div className="thread-inner">
              {!view && !loadError && <p className="quiet loading">Opening the project</p>}
              {loadError && (
                <div className="error-box">
                  <p>{loadError}</p>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => void refresh()}>
                    Try again
                  </button>
                </div>
              )}
              {view?.messages.map((m, index) => {
                if (m.role === "card") {
                  const card = m.meta.card;
                  let body: ReactNode = null;
                  if (card?.kind === "welcome") {
                    body = <WelcomeCard map={view.map} language={view.language} onPickLanguage={(l: Language) => void send(`I'm building it in ${LANGUAGES[l]}.`)} />;
                  } else if (card?.kind === "stage0") {
                    body = <Stage0Card view={view} onSend={(t) => void send(t)} />;
                  } else if (card?.kind === "setup") {
                    body = view.map.steps[0] ? <SetupCard view={view} step={view.map.steps[0]} /> : null;
                  } else if (card?.kind === "step") {
                    const step = view.map.steps.find((s) => s.id === card.step);
                    body = step ? <StepCard view={view} step={step} language={view.language} layer={view.layer} onSend={(t) => void send(t)} /> : null;
                  } else if (card?.kind === "review") {
                    const review = view.reviews.find((r) => r.id === card.review);
                    body = review ? <ReviewCard map={view.map} review={review} /> : null;
                  } else if (card?.kind === "complete") {
                    body = <CompleteCard slug={slug} progress={view.progress} />;
                  }
                  // Anchors for the rail: stage 0, setup (the first step) and each step card.
                  const anchor =
                    card?.kind === "stage0" ? "card-stage0" : card?.kind === "setup" ? `card-${view.map.steps[0]?.id}` : card?.kind === "step" ? `card-${card.step}` : undefined;
                  return body ? (
                    <Row key={m.id} at={m.createdAt} kind="card" id={anchor}>
                      {body}
                    </Row>
                  ) : null;
                }
                if (m.role === "learner") {
                  const nextMessage = view.messages[index + 1];
                  const liveIntent = live && nextMessage?.id === live.id ? live.intent : null;
                  return (
                    <LearnerMessage
                      key={m.id}
                      message={m}
                      intent={m.intent ?? liveIntent}
                      quotes={view.answers.filter((a) => a.messageId === m.id).map((a) => a.quote)}
                    />
                  );
                }
                const isLive = live?.id === m.id;
                const previous = view.messages[index - 1];
                return (
                  <MentorMessage
                    key={m.id}
                    at={m.createdAt}
                    text={isLive ? live.text : m.text}
                    tools={isLive ? live.tools : (m.meta.tools ?? [])}
                    status={isLive ? "pending" : m.status}
                    onRetry={m.status === "failed" && previous?.role === "learner" && !busy ? () => void send(previous.text) : undefined}
                  />
                );
              })}
              {view?.reviewing && (
                <Row at={null} kind="card">
                  <p className="quiet loading review-wait">The sandbox is building and checking your code</p>
                </Row>
              )}
            </div>
          </div>

          <div className="dock">
            <div className="dock-inner">
              {sendError && (
                <p className="send-error" role="alert">
                  {sendError}
                </p>
              )}
              <form className="composer" onSubmit={onSubmit}>
                <label htmlFor="composer-input" className="sr">
                  Message the mentor
                </label>
                <textarea
                  id="composer-input"
                  ref={input}
                  rows={1}
                  value={draft}
                  maxLength={8000}
                  placeholder={busy ? "The mentor is replying…" : PLACEHOLDER[next?.kind ?? "build"]}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`;
                  }}
                  onKeyDown={onKeyDown}
                />
                <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>
                  Send
                </button>
              </form>
              <p className="keys-hint">Enter sends · Shift + Enter for a new line</p>
            </div>
          </div>
        </div>

        {view && <Panel slug={slug} view={view} onJump={jump} />}
      </main>
    </div>
  );
}
