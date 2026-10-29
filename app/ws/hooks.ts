"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { post, type RunState } from "@/lib/client/useRun";

const noop = () => () => {};

/** False during the server render and hydration, true after. Use it for anything that depends on the browser. */
export function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

function detectMac() {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = (nav.userAgentData?.platform || navigator.platform || navigator.userAgent || "").toLowerCase();
  return /mac|iphone|ipad/.test(p);
}

/** Wispr Flow's default shortcut for this OS: Mac fn, Windows Ctrl + Win. Null until mounted. */
export function useWisprKeys(): string[] | null {
  const mac = useSyncExternalStore(noop, detectMac, () => null);
  return mac === null ? null : mac ? ["fn"] : ["Ctrl", "Win"];
}

const EMPTY: RunState = { status: "idle", traces: [], text: "", result: null, error: null };
type Ev = { type: string; data: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Rebuilds the run state from every event received so far, in numeric id order. Each "queued" starts a fresh attempt. */
function reduce<R>(evs: Map<number, Ev>): RunState<R> {
  let s: RunState<R> = { ...(EMPTY as RunState<R>), status: "queued" };
  for (const [, e] of [...evs.entries()].sort((a, b) => a[0] - b[0])) {
    if (e.type === "status") {
      if (e.data.status === "queued") s = { ...(EMPTY as RunState<R>), status: "queued" };
      else s = { ...s, status: e.data.status };
    } else if (e.type === "trace") s = { ...s, traces: [...s.traces, e.data] };
    else if (e.type === "text") s = { ...s, text: e.data.reset ? "" : s.text + (e.data.delta ?? "") };
    else if (e.type === "result") s = { ...s, result: e.data };
    else if (e.type === "error") s = { ...s, error: e.data };
  }
  return s;
}

/**
 * Follows a run over the same SSE endpoint as useRun, with the same state shape, and can retry a paused or failed
 * run (POST /api/runs/{id}/retry, then follow it again from the start). Unlike useRun it orders events by their
 * numeric id and drops duplicates, because the stream can deliver them out of order (see the report on
 * eventsAfter in lib/runs.ts). onDone fires once, when the server ends the stream on a final status.
 */
export function useFollow<R = unknown>(runId: string | null, onDone?: (r: RunState<R>) => void) {
  const [gen, setGen] = useState(0);
  const [state, setState] = useState<RunState<R>>(EMPTY as RunState<R>);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!runId) { setState(EMPTY as RunState<R>); return; }
    setState({ ...(EMPTY as RunState<R>), status: "queued" });
    const evs = new Map<number, Ev>();
    let seq = 1e12; // events without an id (none expected) sort after the rest
    const es = new EventSource(`/api/runs/${runId}/events`);
    const add = (type: string) => (e: Event) => {
      const m = e as MessageEvent;
      if (!m.data) return; // a connection error, not an error event
      const id = Number(m.lastEventId) || seq++;
      evs.set(id, { type, data: JSON.parse(m.data) });
      setState(reduce<R>(evs));
    };
    for (const t of ["status", "trace", "text", "result", "error"]) es.addEventListener(t, add(t));
    es.addEventListener("end", () => {
      es.close();
      const s = reduce<R>(evs);
      setState(s);
      if (s.status === "done" || s.status === "paused" || s.status === "failed") done.current?.(s);
    });
    return () => es.close();
  }, [runId, gen]);

  const retry = useCallback(async () => {
    if (!runId) return;
    await post(`/api/runs/${runId}/retry`);
    setGen((g) => g + 1);
  }, [runId]);
  return { ...state, retry };
}

export function clock(t: number) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
