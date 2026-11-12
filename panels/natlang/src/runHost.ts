import type { NatlangLiveDelivery, LiveEventJson } from "@workspace/natlang-records/contract";
import type { NatlangLiveSubscription } from "@workspace/natlang-records/client";
import type { LiveEvent, RunChunk, RunKind, RunObserver, RunRecord, RunSpec } from "@workspace/natlang/dashboard/types.js";
import { askCell, callCell } from "./runCells.js";
import { ObservedRuns } from "./observedRuns.js";
import type { NatlangPanelPorts } from "./ports.js";

/** What a run host delivers to a page: the run so far, its output, and the runtime's live events. */
export type RunHostApi = ReturnType<typeof createRunHost>;

/** The event the panel publishes to its own live subscription when a run ends: everything published before it has arrived. */
const FLUSH_EVENT = "panel_flush";

interface OwnRun {
  run: RunRecord;
  stdout: string;
  stderr: string;
  live: LiveEvent[];
  watchers: Set<RunObserver>;
  controller: AbortController;
}

const printed = (value: unknown): string => {
  const out = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return out === undefined ? "" : out.endsWith("\n") ? out : `${out}\n`;
};

const specTitle = (spec: RunSpec): string =>
  `${spec.kind} ${"function" in spec ? spec.function : "instruction" in spec ? spec.instruction.slice(0, 60) : ""}`.trim();

function specMeta(spec: RunSpec): Record<string, unknown> | undefined {
  if (spec.kind === "call")
    return { path: spec.function, inputs: spec.inputs ?? {}, profile: spec.profile, program: spec.program };
  if (spec.kind === "ask")
    return { instruction: spec.instruction, input: spec.input ?? "", returns: spec.returns ?? null, profile: spec.profile };
  return undefined;
}

/** Keep the history a late watcher replays compact: consecutive text deltas of one turn are one event. */
function retain(history: LiveEvent[], event: LiveEvent): void {
  const last = history.at(-1) as any;
  const next = event as any;
  if (
    next.type === "model_delta" &&
    (next.delta.type === "text" || next.delta.type === "reasoning") &&
    last?.type === "model_delta" &&
    last.callId === next.callId &&
    last.turn === next.turn &&
    last.delta.type === next.delta.type
  )
    history[history.length - 1] = { ...last, delta: { type: next.delta.type, text: last.delta.text + next.delta.text } };
  else history.push(event);
}

/**
 * The dashboard's `RunHost`. Each run is an eval cell in this panel's own eval session, so it uses the same
 * `@workspace/natlang` provider, gateway executor and records as every agent's eval; its live events arrive from the
 * records service's subscriber fan-out (a subscription held only for the run's lifetime). Stopping a run cancels the eval.
 * Natlang calls other owners started (agents' evals, headless programs) are listed too, observed from the same records.
 */
export function createRunHost(ports: NatlangPanelPorts) {
  const runs = new Map<string, OwnRun>();
  const subscribers = new Set<{ listener: (runs: RunRecord[]) => void; error?: (error: Error) => void }>();
  const observed = new ObservedRuns({
    records: ports.records,
    isOwn: (runId) => runs.has(runId),
    changed: () => notify(),
    failed: (error) => {
      for (const subscriber of [...subscribers]) subscriber.error?.(error);
    },
  });

  const snapshot = (state: OwnRun): RunRecord => ({ ...state.run });
  const list = async (): Promise<RunRecord[]> => {
    const own = [...runs.values()].map(snapshot);
    return [...own, ...(await observed.list())].sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
  };
  function notify(): void {
    if (subscribers.size === 0) return;
    void list().then(
      (all) => {
        for (const subscriber of [...subscribers]) subscriber.listener(all);
      },
      (error) => {
        for (const subscriber of [...subscribers]) subscriber.error?.(error as Error);
      }
    );
  }
  const publish = (state: OwnRun, chunk: Partial<RunChunk>) => {
    for (const watcher of [...state.watchers])
      watcher.update({ run: snapshot(state), stdout: "", stderr: "", live: [], drained: false, ...chunk });
  };
  const write = (state: OwnRun, stream: "stdout" | "stderr", text: string) => {
    state[stream] += text;
    publish(state, { [stream]: text });
  };
  const find = (id: string): OwnRun | undefined => runs.get(id);

  function finish(state: OwnRun, status: RunRecord["status"], exitCode: number | null): void {
    state.run = {
      ...state.run,
      status: state.run.status === "stopped" ? "stopped" : status,
      exitCode,
      endedAt: new Date().toISOString(),
    };
    publish(state, { drained: true });
    notify();
  }

  /** Run one cell, relay its live events, and settle the run. */
  async function execute(state: OwnRun, source: string, subscription: NatlangLiveSubscription): Promise<void> {
    const { run, controller } = state;
    let sawFlush!: () => void;
    let lostLive!: (error: unknown) => void;
    const flushed = new Promise<void>((resolve, reject) => {
      sawFlush = resolve;
      lostLive = reject;
    });
    // A lost stream is reported on the run, and never leaves it waiting for a flush that cannot arrive.
    flushed.catch(() => undefined);
    void (async () => {
      try {
        for await (const delivery of subscription.deliveries as AsyncIterable<NatlangLiveDelivery>) {
          for (const event of delivery.events as LiveEventJson[]) {
            if (event.type === FLUSH_EVENT) {
              sawFlush();
              continue;
            }
            const stamped = { at: Date.now(), ...event } as unknown as LiveEvent;
            retain(state.live, stamped);
            publish(state, { live: [stamped] });
          }
        }
      } catch (error) {
        lostLive(error);
      }
    })();

    let status: RunRecord["status"] = "done";
    let exitCode: number | null = 0;
    try {
      const outcome = await ports.evaluate(source, {
        runId: run.id,
        signal: controller.signal,
        syntax: run.kind === "ask" ? "typescript" : "javascript",
      });
      if (outcome.console) write(state, "stderr", outcome.console.endsWith("\n") ? outcome.console : `${outcome.console}\n`);
      if (outcome.success) {
        if (outcome.returnValue !== undefined) write(state, "stdout", printed(outcome.returnValue));
      } else {
        write(state, "stderr", `${outcome.error ?? "The run failed."}\n`);
        status = "failed";
        exitCode = 1;
      }
    } catch (error) {
      if (controller.signal.aborted) {
        status = "stopped";
        exitCode = null;
      } else {
        write(state, "stderr", `${error instanceof Error ? error.message : String(error)}\n`);
        status = "failed";
        exitCode = 1;
      }
    }
    // Everything the run published has been delivered once its flush event comes back; then the subscription ends.
    try {
      await ports.records.publishLive({
        owner: ports.owner,
        runId: run.id,
        events: [{ type: FLUSH_EVENT, callId: `flush-${run.id}` }],
      });
      await flushed;
    } catch (error) {
      write(state, "stderr", `Live events were lost: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    try {
      await subscription.close();
    } catch (error) {
      write(state, "stderr", `The live subscription did not close cleanly: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    finish(state, status, exitCode);
  }

  return {
    kinds: ["call", "ask"] as readonly RunKind[],
    list,

    async start(spec: RunSpec): Promise<RunRecord> {
      const source = spec.kind === "call" ? callCell(spec) : spec.kind === "ask" ? askCell(spec) : undefined;
      if (source === undefined) throw new Error(`This host cannot start a ${spec.kind} run.`);
      if (spec.kind === "call" && !/\.nl$/.test(spec.function))
        throw new Error(`A call needs the path of a .nl function; ${JSON.stringify(spec.function)} is not one (a run another owner started cannot be run again from here).`);
      const id = ports.newId();
      // Subscribe before the cell starts: the provider forwards live events only while something watches the run.
      const subscription = await ports.records.subscribeLive({ runId: id });
      const meta = specMeta(spec);
      const state: OwnRun = {
        run: {
          id,
          kind: spec.kind,
          title: specTitle(spec),
          status: "running",
          exitCode: null,
          startedAt: new Date().toISOString(),
          endedAt: null,
          interactive: false,
          ...(meta ? { meta } : {}),
        },
        stdout: "",
        stderr: "",
        live: [],
        watchers: new Set(),
        controller: new AbortController(),
      };
      runs.set(id, state);
      void execute(state, source, subscription);
      notify();
      return snapshot(state);
    },

    async stop(id: string): Promise<RunRecord> {
      const state = find(id);
      if (!state) return observed.stop(id);
      if (state.run.status === "running") {
        state.run = { ...state.run, status: "stopped" };
        state.controller.abort();
        publish(state, {});
        notify();
      }
      return snapshot(state);
    },

    async remove(id: string): Promise<void> {
      const state = find(id);
      if (!state) return observed.remove(id);
      if (state.run.status === "running") throw new Error("stop the run before removing it");
      runs.delete(id);
      notify();
    },

    async input(): Promise<void> {
      throw new Error("the run does not read input");
    },

    subscribe(listener: (runs: RunRecord[]) => void, error?: (error: Error) => void): () => void {
      const subscriber = { listener, ...(error ? { error } : {}) };
      subscribers.add(subscriber);
      const detach = observed.attach();
      return () => {
        subscribers.delete(subscriber);
        detach();
      };
    },

    watch(id: string, observer: RunObserver): () => void {
      const state = find(id);
      if (!state) return observed.watch(id, observer);
      // Everything so far is delivered before anything new, within this call: no event falls between replay and watch.
      state.watchers.add(observer);
      observer.update({
        run: snapshot(state),
        stdout: state.stdout,
        stderr: state.stderr,
        live: [...state.live],
        drained: state.run.status !== "running" && state.run.endedAt !== null,
      });
      return () => {
        state.watchers.delete(observer);
      };
    },

    /** The last successful call of each function, by its path: what the Programs page restores into a form. */
    lastCalls(): Record<string, Record<string, unknown>> {
      const last: Record<string, Record<string, unknown>> = {};
      // Oldest first, so a later call of the same function replaces an earlier one.
      for (const state of runs.values())
        if (state.run.kind === "call" && state.run.status === "done" && state.run.meta)
          last[String(state.run.meta["path"])] = state.run.meta;
      return last;
    },

    running: () => ({ running: [...runs.values()].filter((state) => state.run.status === "running").length, total: runs.size }),
  };
}
