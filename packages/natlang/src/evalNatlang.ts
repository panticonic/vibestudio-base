import { createModelGatewayClient } from "@workspace/model-gateway/client";
import { createNatlangRecordsClient } from "@workspace/natlang-records/client";
import type { RpcCallerLike } from "@vibestudio/shared/workspaceServiceRpc";
import type { EvalNatlangCallSummary } from "@vibestudio/service-schemas/eval";
import type {
  EvalNatlang,
  NatlangLowerOptions,
  NatlangLoweredCell,
  NatlangProviderHost,
} from "@vibestudio/service-schemas/evalNatlang";
import * as core from "../vendor/workerd/natlang-workerd.js";
import type { LiveEvent, Platform } from "../vendor/workerd/natlang-workerd.js";
import { folderBash } from "./folderTools.js";
import { natlangHelp } from "./help.js";
import { ModelDirectory, modelsFor, EXECUTOR_ROLE } from "./models.js";
import { ProgramLoader, type TaskRunner, type WorkspaceFs } from "./programs.js";
import { LivePublisher, RecordsStore, type RecordingRun } from "./recordsStore.js";
import { confinedRealm } from "./realm.js";

/** The ambient names this provider injects; a cell's `declare const` for them would shadow natlang's own. */
const OWN_AMBIENT = new Set(["nl", "natlang", "__natlang"]);

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** What one eval cell's run holds while it executes. */
interface ActiveRun extends RecordingRun {
  readonly signal: AbortSignal;
  live: LivePublisher | null;
  /** The cell's preparation, started by its first natlang call. */
  prepared?: Promise<void>;
}

function requireBinding<T>(bindings: Readonly<Record<string, unknown>>, name: string): T {
  const value = bindings[name];
  if (value === undefined || value === null) {
    throw new Error(`natlang needs the eval binding \`${name}\`, which this eval does not have`);
  }
  return value as T;
}

/** The events of a stored call: ndjson or one JSON array, as an array. */
function parseEvents(text: string | null): unknown[] | null {
  if (text === null) return null;
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return JSON.parse(trimmed) as unknown[];
  return trimmed.split("\n").map((line) => JSON.parse(line) as unknown);
}

/**
 * The natlang provider for one eval owner (see `NatlangProviderHost`): the
 * ambient `nl`/`natlang`, cell lowering, and the owner's natlang runtime.
 *
 * One runtime per owner runs on a workerd platform whose realm is the eval
 * engine's confinement over the host's `UNSAFE_EVAL`. Its default model is the
 * `executor` role through the model gateway, and every call is recorded to the
 * natlang records service. Inline `nl` has no services; a workspace program
 * loaded with `natlang.load` runs as its own task with exactly its declared
 * services, taken by name from this eval's bindings.
 */
export function createEvalNatlang(host: NatlangProviderHost): EvalNatlang {
  const rpc = requireBinding<RpcCallerLike>(host.bindings, "rpc");
  const fs = requireBinding<WorkspaceFs>(host.bindings, "fs");
  const gateway = createModelGatewayClient(rpc);
  const records = createNatlangRecordsClient(rpc);
  const directory = new ModelDirectory(rpc);
  const { executor, pinExecutor: nameExecutor, models } = modelsFor({
    gateway,
    directory,
    turnPrefix: crypto.randomUUID().slice(0, 8),
  });
  const store = new RecordsStore(records, host.owner, (message) => console.error(message));
  const platform: Platform = {
    ...core.workerdPlatform({ realm: confinedRealm(host.newFunction), callStore: () => store }),
    runFolderBash: folderBash,
  };
  const runtime = core.createNatlangRuntime({
    platform,
    model: executor,
    models,
    calls: store,
    network: false,
  });

  let active: ActiveRun | null = null;
  let closed = false;

  /**
   * Live events go to the records service only while it reports a watcher. Whether it does is known once the
   * cell is executing, after its ambient task exists, so the task's sink is always this relay.
   */
  const relayLive = (event: LiveEvent): void => active?.live?.sink(event);

  /**
   * Run `work` for a natlang call of the executing cell. The eval's `rpc` serves only while a cell is
   * executing, so everything that talks to other services happens here, inside it: the cell's preparation
   * before its first call (the executor role resolves from current readiness; the records service says
   * whether anything watches live), and, before the call's result reaches the cell, the writes of its record.
   */
  async function inCell<T>(work: () => Promise<T>): Promise<T> {
    const run = active;
    if (run) await (run.prepared ??= prepare(run));
    try {
      return await work();
    } finally {
      await run?.live?.drain();
      await store.flush();
    }
  }

  async function prepare(run: ActiveRun): Promise<void> {
    directory.newEpoch();
    try {
      nameExecutor((await directory.resolve(EXECUTOR_ROLE)).ref);
    } catch (error) {
      // No usable model fills the role: a call that needs one fails with the reason.
      store.fail("natlang: the executor role does not resolve", error);
      nameExecutor(EXECUTOR_ROLE);
    }
    run.live = await livePublisher(run.runId);
  }

  const runTask: TaskRunner = (run, task) =>
    inCell(() =>
      runtime.run(run, {
        ...task,
        ...(active ? { signal: active.signal } : {}),
        onLive: relayLive,
      })
    );

  const loader = new ProgramLoader({ platform, fs, bindings: host.bindings, runTask });

  const natlang = Object.freeze({
    /** Load a workspace natlang program (a `.nl` file, a `.ts` module, or a folder). */
    load: (path: string) => loader.load(path),
    /** A recorded call's record and trace. */
    async trace(callId: string) {
      const detail = await records.getCall(callId);
      if (!detail) throw new Error(`no natlang call ${JSON.stringify(callId)} is recorded`);
      return {
        callId,
        name: detail.summary.definition_name,
        outcome: detail.summary.outcome,
        model: detail.summary.model_id,
        record: detail.record,
        events: parseEvents(detail.events),
        annotations: detail.annotations,
      };
    },
    help: () => natlangHelp(),
  });

  async function livePublisher(runId: string): Promise<LivePublisher | null> {
    try {
      if (!(await records.liveInterest()).subscribed) return null;
    } catch (error) {
      store.fail("natlang records: live subscription check failed", error);
      return null;
    }
    return new LivePublisher(records, host.owner, runId, (prefix, error) =>
      store.fail(prefix, error)
    );
  }

  /**
   * `nl` as cells see it. A lowered cell reaches natlang only through `nl.__inline(plan, ...)(args)`; each such
   * call runs inside the executing cell (`inCell`), and so do the callables `.with(...)` derives from them.
   */
  const withinCell = <F extends (...args: never[]) => unknown>(callable: F): F => {
    const call = (...args: unknown[]) =>
      inCell(() => (callable as (...values: unknown[]) => Promise<unknown>)(...args));
    // The natlang callable's own surface (its marker, `iterateOn`, `in`, `with`) stays on the wrapper.
    for (const key of Reflect.ownKeys(callable)) {
      if (key === "length" || key === "name" || key === "prototype") continue;
      const descriptor = Reflect.getOwnPropertyDescriptor(callable, key)!;
      if (key === "with" && typeof descriptor.value === "function") {
        const rebind = descriptor.value as (...captures: unknown[]) => F;
        descriptor.value = (...captures: unknown[]) => withinCell(rebind(...captures));
      }
      Object.defineProperty(call, key, descriptor);
    }
    Object.defineProperty(call, "name", { value: callable.name });
    return call as unknown as F;
  };
  const inline = (core.nl as unknown as { __inline(...plan: unknown[]): (...args: never[]) => unknown })
    .__inline;
  const ambientNl = Object.defineProperties(
    (...args: unknown[]) => (core.nl as unknown as (...values: unknown[]) => unknown)(...args),
    {
      with: { value: core.nl.with, enumerable: true },
      __inline: { value: (...plan: unknown[]) => withinCell(inline(...plan)) },
    }
  );

  return {
    ambient: { nl: ambientNl, natlang, __natlang: core.__natlang },

    lowerCell(source: string, options: NatlangLowerOptions): NatlangLoweredCell {
      const declared = options.ambientNames
        .filter((name) => IDENTIFIER.test(name) && !OWN_AMBIENT.has(name) && name !== "scope")
        .map((name) => `declare const ${name}: any;`);
      const lowered = core.lowerHostCell(source, {
        fileName: options.fileName,
        jsx: options.jsx,
        ambientDeclarations: [
          ...declared,
          core.declarationsForValues({ scope: options.scopeValues }),
        ].join("\n"),
      });
      return {
        usesNl: lowered.usesNl,
        code: lowered.code,
        diagnostics: lowered.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          message: diagnostic.message,
          line: diagnostic.line,
          column: diagnostic.column,
          severity: diagnostic.severity,
        })),
      };
    },

    async runCell<T>(
      execute: () => Promise<T>,
      options: { runId: string; signal: AbortSignal }
    ): Promise<{ value: T; calls: EvalNatlangCallSummary[] }> {
      if (closed) throw new Error("natlang: this owner's natlang instance is closed");
      options.signal.throwIfAborted();
      const run: ActiveRun = { runId: options.runId, calls: [], signal: options.signal, live: null };
      active = run;
      store.attach(run);
      try {
        const value = await runtime.run(execute, {
          signal: options.signal,
          name: options.runId,
          onLive: relayLive,
        });
        return { value, calls: run.calls };
      } finally {
        // Whatever a detached call still had queued; the calls the cell awaited are durable already.
        await run.live?.drain();
        await store.flush();
        store.attach(null);
        active = null;
      }
    },

    close(): void {
      closed = true;
      runtime.close();
    },
  };
}
