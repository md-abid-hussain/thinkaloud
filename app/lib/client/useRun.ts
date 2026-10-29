"use client";
// Follows one run (a grade or a mentor turn) over server-sent events. EventSource reconnects on its own and
// sends Last-Event-ID, so a dropped connection or a reload carries on where it stopped. Leaving the page
// never cancels the run; coming back with the same run id replays everything from the start.
import { useCallback, useEffect, useRef, useState } from "react";

export type RunStatus = "idle" | "queued" | "running" | "done" | "failed" | "paused";
export interface TraceLine {
  tool?: string;
  label: string;
  mermaid?: string;
  caption?: string;
}
export interface RunState<R = any> {
  status: RunStatus;
  traces: TraceLine[];
  text: string;
  result: R | null;
  error: { reason: string; message: string } | null;
}

const EMPTY: RunState = { status: "idle", traces: [], text: "", result: null, error: null };

export function useRun<R = any>(runId: string | null, onDone?: (r: RunState<R>) => void) {
  const [state, setState] = useState<RunState<R>>(EMPTY as RunState<R>);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!runId) {
      setState(EMPTY as RunState<R>);
      return;
    }
    setState({ ...(EMPTY as RunState<R>), status: "queued" });
    const es = new EventSource(`/api/runs/${runId}/events`);
    let acc: RunState<R> = { ...(EMPTY as RunState<R>), status: "queued" };
    const set = (patch: Partial<RunState<R>>) => {
      acc = { ...acc, ...patch };
      setState(acc);
    };
    es.addEventListener("status", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      set({ status: d.status });
      if (d.status === "done" || d.status === "failed" || d.status === "paused") done.current?.(acc);
    });
    es.addEventListener("trace", (e) => set({ traces: [...acc.traces, JSON.parse((e as MessageEvent).data)] }));
    es.addEventListener("text", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      set({ text: d.reset ? "" : acc.text + (d.delta ?? "") });
    });
    es.addEventListener("result", (e) => set({ result: JSON.parse((e as MessageEvent).data) }));
    es.addEventListener("error", (e) => {
      const data = (e as MessageEvent).data;
      if (data) set({ error: JSON.parse(data) });
    });
    es.addEventListener("end", () => es.close());
    return () => es.close();
  }, [runId]);

  return state;
}

/** POST JSON and return the parsed body, throwing the server's error message on failure. */
export async function post<T = any>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Something went wrong."), { status: res.status, data });
  return data as T;
}

/** Retries a paused run. */
export function useRetry() {
  return useCallback((runId: string) => post(`/api/runs/${runId}/retry`), []);
}
