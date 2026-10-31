"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { TurnEvent } from "@/lib/agent/bus";
import { LANGUAGES, stepLabel, type Language } from "@/lib/progress";
import type { Intent, Message, ToolLine } from "@/lib/repo";
import type { ChatView } from "@/lib/view";
import { Mark } from "../Mark";
import { CompleteCard, ReviewCard, SetupCard, Stage0Card, StepCard, WelcomeCard } from "./Cards";
import { DayDivider, LearnerMessage, MentorMessage } from "./Messages";
import { Panel } from "./Panel";

type Live = { id: number; text: string; tools: ToolLine[]; intent: Intent | null };

const PLACEHOLDER: Record<string, string> = {
  "choose-language": "Your language…",
  stage0: "Ask about the problem…",
  "link-repo": "Paste your GitHub repo link…",
  answer: "Answer in your own words, or speak it with Wispr Flow…",
  reviewing: "Ask while it runs…",
  build: "Ask the mentor, or explain out loud with Wispr Flow…",
  questions: "Ask, or say “ask me”…",
  complete: "Ask anything…",
};

/** Phones: the box is about 270px wide, so the Wispr Flow option gets a shorter line that still shows it. */
const PLACEHOLDER_NARROW: Record<string, string> = {
  answer: "Answer, or speak with Wispr Flow…",
  build: "Ask, or explain with Wispr Flow…",
};

const NARROW = "(max-width: 640px)";

function useNarrow(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(NARROW);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}

/** A suggestion above the box: it sends a message, focuses the box with a start, or links. */
type Suggestion = { label: string; send?: string; prefill?: string; href?: string };

/** The one thing to do now, and at most one other useful move. */
function suggestions(view: ChatView, slug: string): Suggestion[] {
  const next = view.progress.next;
  const label = "step" in next ? stepLabel(view.map, next.step) : "";
  switch (next.kind) {
    case "stage0":
      return [{ label: "Ask me the questions", send: "I've read it. Ask me the questions about the problem." }];
    case "link-repo":
      return [{ label: "Paste my repo link", prefill: "My repo is https://github.com/" }];
    case "build": {
      const step = view.progress.steps.find((s) => s.id === next.step);
      const open = step?.questions.some((q) => !q.answered);
      return [
        { label: "Review my code", send: `I pushed ${label}. Please review it.` },
        ...(open ? [{ label: "Ask me the questions", send: `Ask me ${label}'s questions.` }] : []),
      ];
    }
    case "questions":
      return [{ label: "Ask me the questions", send: `Ask me ${label}'s questions.` }];
    case "answer":
      return [{ label: "Answer the question", prefill: "" }];
    case "complete":
      return [{ label: "Export learning log", href: `/api/p/${slug}/export` }];
    default:
      return [];
  }
}

/** Where the learner is, in a few words, for the header: "Before you build", "Step 2 of 7" or "All steps done". */
function position(view: ChatView): string {
  const { progress, map } = view;
  if (progress.complete) return "All steps done";
  const current = progress.currentStep;
  const before = progress.next.kind === "choose-language" || (progress.next.kind === "stage0" && !progress.steps.some((s) => s.done));
  if (!current || before) return "Before you build";
  const label = stepLabel(map, current.id);
  return current.optional ? label : `${label} of ${progress.counts.stepsRequired}`;
}

/**
 * The card for where the learner is now. Everything before it folds behind "Show earlier", so the page opens on the
 * current step instead of the whole history.
 */
function currentCardIndex(view: ChatView): number {
  const { messages, progress, map } = view;
  const kind = progress.next.kind;
  if (kind === "choose-language") return 0;
  const current = progress.currentStep?.id;
  const matches = (m: Message) => {
    const card = m.meta.card;
    if (m.role !== "card" || !card) return false;
    if (kind === "complete") return card.kind === "complete";
    if (kind === "stage0") return card.kind === "stage0";
    if (current && current === map.steps[0]?.id) return card.kind === "setup";
    return card.kind === "step" && card.step === current;
  };
  for (let i = messages.length - 1; i >= 0; i--) if (matches(messages[i])) return i;
  return 0;
}

async function loadView(slug: string): Promise<ChatView> {
  const response = await fetch(`/api/p/${slug}/state`, { cache: "no-store" });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Couldn't load the project.");
  return (await response.json()) as ChatView;
}

export function ChatApp({ slug, title, sourceUrl }: { slug: string; title: string; sourceUrl: string }) {
  const [view, setView] = useState<ChatView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [tab, setTab] = useState<"chat" | "progress">("chat");
  const narrow = useNarrow();
  const [showEarlier, setShowEarlier] = useState(false);
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
  const moves = view ? suggestions(view, slug) : [];
  const reviewing = !!view?.reviewing;
  const where = view ? position(view) : "";
  const anchor = view ? currentCardIndex(view) : 0;
  // Fold only when there's more than one earlier message to hide.
  const folded = !showEarlier && anchor > 1;

  const runMove = (m: Suggestion) => {
    if (m.send) return void send(m.send);
    setTab("chat");
    if (m.prefill !== undefined && !draft) setDraft(m.prefill);
    requestAnimationFrame(() => input.current?.focus());
  };

  /** From the outline: show the chat, unfold the history if the card is in it, and scroll the card into view. */
  const jump = (cardId: string) => {
    setTab("chat");
    setShowEarlier(true);
    stick.current = false;
    // Only the conversation scrolls; scrollIntoView would also move the page under the sticky header.
    requestAnimationFrame(() => {
      const card = document.getElementById(cardId);
      if (card && thread.current) thread.current.scrollTo({ top: card.offsetTop - 24, behavior: "smooth" });
    });
  };

  // The messages that open a new day get a divider above them.
  const dayStarts = new Set<number>();
  view?.messages.forEach((m, index) => {
    if (folded && index < anchor) return;
    const previous = index > (folded ? anchor : 0) ? view.messages[index - 1] : null;
    if (!previous || new Date(previous.createdAt).toDateString() !== new Date(m.createdAt).toDateString()) dayStarts.add(m.id);
  });

  return (
    <div className={`chat-page tab-${tab}`}>
      <header className="chat-top">
        <Mark />
        <h1 className="ptitle-top">{title}</h1>
        <div className="top-end">
          {view && (
            <div className="meter">
              <span>{where}</span>
              <span className="segs" aria-hidden="true">
                {view.progress.steps
                  .filter((s) => !s.optional)
                  .map((s) => (
                    <i key={s.id} className={s.done ? "d" : s.current && where !== "Before you build" ? "n" : ""} />
                  ))}
              </span>
            </div>
          )}
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="toplink">
            Original challenge ↗
          </a>
          {view && (
            <button type="button" className="pathbtn" aria-controls="panel-progress" aria-expanded={tab === "progress"} onClick={() => setTab(tab === "chat" ? "progress" : "chat")}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d={tab === "chat" ? "M3 4h10M3 8h10M3 12h6" : "M4 4l8 8M12 4l-8 8"} />
              </svg>
              {tab === "chat" ? where : "Back to the chat"}
            </button>
          )}
        </div>
      </header>

      <main className="chat-main">
        {view && <Panel slug={slug} view={view} onJump={jump} />}

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
              {folded && (
                <button type="button" className="earlier" onClick={() => setShowEarlier(true)}>
                  Show the earlier conversation
                </button>
              )}
              {view?.messages.map((m, index) => {
                if (folded && index < anchor) return null;
                let body: ReactNode = null;
                if (m.role === "card") {
                  const card = m.meta.card;
                  let content: ReactNode = null;
                  if (card?.kind === "welcome") {
                    content = <WelcomeCard map={view.map} language={view.language} onPickLanguage={(l: Language) => void send(`I'm building it in ${LANGUAGES[l]}.`)} />;
                  } else if (card?.kind === "stage0") {
                    content = <Stage0Card view={view} onSend={(t) => void send(t)} />;
                  } else if (card?.kind === "setup") {
                    content = view.map.steps[0] ? <SetupCard view={view} step={view.map.steps[0]} /> : null;
                  } else if (card?.kind === "step") {
                    const step = view.map.steps.find((s) => s.id === card.step);
                    content = step ? <StepCard view={view} step={step} language={view.language} layer={view.layer} /> : null;
                  } else if (card?.kind === "review") {
                    const review = view.reviews.find((r) => r.id === card.review);
                    content = review ? <ReviewCard map={view.map} review={review} /> : null;
                  } else if (card?.kind === "complete") {
                    content = <CompleteCard slug={slug} progress={view.progress} />;
                  }
                  // Anchors for the outline: stage 0, setup (the first step) and each step card.
                  const id =
                    card?.kind === "stage0" ? "card-stage0" : card?.kind === "setup" ? `card-${view.map.steps[0]?.id}` : card?.kind === "step" ? `card-${card.step}` : undefined;
                  body = content ? (
                    <div className="turn card" id={id}>
                      {content}
                    </div>
                  ) : null;
                } else if (m.role === "learner") {
                  const nextMessage = view.messages[index + 1];
                  const liveIntent = live && nextMessage?.id === live.id ? live.intent : null;
                  body = (
                    <LearnerMessage message={m} intent={m.intent ?? liveIntent} quotes={view.answers.filter((a) => a.messageId === m.id).map((a) => a.quote)} />
                  );
                } else {
                  const isLive = live?.id === m.id;
                  const previous = view.messages[index - 1];
                  body = (
                    <MentorMessage
                      at={m.createdAt}
                      text={isLive ? live.text : m.text}
                      tools={isLive ? live.tools : (m.meta.tools ?? [])}
                      status={isLive ? "pending" : m.status}
                      onRetry={m.status === "failed" && previous?.role === "learner" && !busy ? () => void send(previous.text) : undefined}
                    />
                  );
                }
                return body ? (
                  <Fragment key={m.id}>
                    {dayStarts.has(m.id) && <DayDivider at={m.createdAt} />}
                    {body}
                  </Fragment>
                ) : null;
              })}
              {reviewing && <p className="quiet loading review-wait">The sandbox is building and checking your code</p>}
            </div>
          </div>

          <div className="dock">
            <div className="dock-inner">
              {next && (
                <div className="next">
                  <p className="next-line" aria-live="polite">
                    <span className={`next-l${reviewing ? " is-running" : ""}`}>
                      {reviewing && <i className="dot" aria-hidden="true" />}
                      {reviewing ? "Reviewing" : "Next"}
                    </span>
                    <span className="next-t">{next.text}</span>
                  </p>
                  {moves.length > 0 && (
                    <div className="sugs">
                      {moves.map((m, i) =>
                        m.href ? (
                          <a key={m.label} className={`sug${i === 0 ? " primary" : ""}`} href={m.href}>
                            {m.label}
                          </a>
                        ) : (
                          <button key={m.label} type="button" className={`sug${i === 0 ? " primary" : ""}`} disabled={!!m.send && busy} onClick={() => runMove(m)}>
                            {m.label}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </div>
              )}
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
                  placeholder={busy ? "The mentor is replying…" : ((narrow && PLACEHOLDER_NARROW[next?.kind ?? "build"]) || PLACEHOLDER[next?.kind ?? "build"])}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`;
                  }}
                  onKeyDown={onKeyDown}
                />
                <div className="c-bar">
                  <span className="keys-hint">Enter sends · Shift + Enter for a new line</span>
                  <button type="submit" className="send" aria-label="Send" disabled={busy || !draft.trim()}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 14V4M4.5 8.5 9 4l4.5 4.5" />
                    </svg>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
