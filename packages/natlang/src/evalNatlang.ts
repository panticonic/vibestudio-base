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
import { callFailure, NatlangCallFailure } from "./callFailure.js";
import { folderBash } from "./folderTools.js";
import { natlangHelp } from "./help.js";
import { ModelDirectory, modelsFor, EXECUTOR_ROLE } from "./models.js";
import { ProgramLoader, type TaskRunner, type WorkspaceFs } from "./programs.js";
import { LivePublisher, RecordsStore, parseEvents, type RecordingRun } from "./recordsStore.js";
import { confinedRealm } from "./realm.js";
import {
  CHILDREN_LISTED,
  FAILURE_ANNOTATION,
  callsFilter,
  listing,
  traceDigest,
  type NatlangCallsQuery,
} from "./traceDigest.js";

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
  const { executor, executorIdentity, pinExecutor: nameExecutor, models } = modelsFor({
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
    executorIdentity,
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
   * A call that fails reaches the cell as one typed failure (`callFailure`), recorded on the call as well.
   */
  async function inCell<T>(work: () => Promise<T>): Promise<T> {
    const run = active;
    if (run) await (run.prepared ??= prepare(run));
    let outcome: { value: T } | { error: unknown };
    try {
      outcome = { value: await work() };
    } catch (error) {
      outcome = { error };
    }
    let failure: unknown;
    if ("error" in outcome) {
      failure = callFailure(outcome.error, run?.calls);
      if (failure instanceof NatlangCallFailure && failure.callId) {
        store.annotate(failure.callId, FAILURE_ANNOTATION, { reason: failure.reason }, "vibestudio");
      }
    }
    await run?.live?.drain();
    await store.flush();
    if ("error" in outcome) throw failure;
    return outcome.value;
  }

  async function prepare(run: ActiveRun): Promise<void> {
    directory.newEpoch();
    try {
      nameExecutor(await directory.resolve(EXECUTOR_ROLE));
    } catch {
      // No usable model fills the role. A call that needs it fails with the reason (`executor-unavailable`), and a
      // cell whose calls all name another model does not need it.
      nameExecutor(null);
    }
    run.live = await livePublisher(run.runId);
  }

  const runTask: TaskRunner = async (run, { programRoot, ...task }) => {
    let taskId: string | undefined;
    try {
      return await inCell(() =>
        runtime.run(
          () => {
            // Natlang records the program's directory only when the runtime is made for one program; this runtime
            // serves every program the owner loads, so each task names its own, for the records of its calls.
            taskId = core.currentFrame()?.task.id;
            if (taskId && programRoot) store.programRoots.set(taskId, programRoot);
            return run();
          },
          {
            ...task,
            ...(active ? { signal: active.signal } : {}),
            onLive: relayLive,
          }
        )
      );
    } finally {
      // `inCell` has flushed the task's records: the name is no longer needed.
      if (taskId) store.programRoots.delete(taskId);
    }
  };

  const loader = new ProgramLoader({ platform, fs, bindings: host.bindings, runTask });

  const natlang = Object.freeze({
    /** Load a workspace natlang program (a `.nl` file, a `.ts` module, or a folder). */
    load: (path: string) => loader.load(path),
    /** A workspace program's functions with their typed signatures (from the compilation `load` runs). */
    describe: (path: string) => loader.describe(path),
    /**
     * A recorded call made readable (`traceDigest`): its turns and actions, the calls it made, the scope it ended
     * with and why. `{ raw: true }` returns the record and natlang's full event trace instead.
     */
    async trace(callId: string, options: { raw?: boolean } = {}) {
      const detail = await records.getCall(callId);
      if (!detail) throw new Error(`no natlang call ${JSON.stringify(callId)} is recorded`);
      const events = detail.events === null ? [] : parseEvents(detail.events);
      if (options.raw) {
        return {
          callId,
          name: detail.summary.definition_name,
          outcome: detail.summary.outcome,
          model: detail.summary.model_id,
          record: detail.record,
          events: detail.events === null ? null : events,
          annotations: detail.annotations,
        };
      }
      const children = await records.listCalls({ parentCallId: callId, limit: CHILDREN_LISTED });
      return traceDigest({ detail, events, children, value: (hash) => records.getValue(hash) });
    },
    /** This owner's recorded calls: a call's children (`parentCallId`), a run's calls (`run`), root calls (`roots`). */
    async calls(query: NatlangCallsQuery = {}) {
      return (await records.listCalls(callsFilter(query, host.owner.objectKey))).map(listing);
    },
    /**
     * Run a recorded workspace-program call again on its recorded inputs, on another model when `model` names one
     * (`fn.on({ model })`). The new call has its own record.
     */
    rerun: (callId: string, options: { model?: string } = {}) => rerun(callId, options),
    help: () => natlangHelp(),
  });

  async function rerun(callId: string, options: { model?: string }): Promise<unknown> {
    const detail = await records.getCall(callId);
    if (!detail?.record) throw new Error(`no natlang call ${JSON.stringify(callId)} is recorded`);
    const { definition, program_root: programRoot, inputs } = detail.record;
    const params = (definition["params"] ?? []) as Array<{ name: string; optional?: boolean }>;
    if (definition.site !== "named" || !definition.source?.endsWith(".nl") || programRoot === null) {
      throw new Error(
        `natlang.rerun replays a workspace program's function; ${definition.name} is an ${definition.site} call whose ` +
          "captures were live values of its cell: call it again from your code, with .on({ model }) for another model"
      );
    }
    const args: unknown[] = [];
    for (const param of params) {
      const ref = inputs[param.name] as { complete?: boolean; hash?: string; reason?: string } | undefined;
      if (ref === undefined) {
        if (param.optional) {
          args.push(undefined);
          continue;
        }
        throw new Error(`natlang.rerun: the record of ${callId} has no input ${param.name}`);
      }
      const text = ref.complete && ref.hash ? await records.getValue(ref.hash) : null;
      if (text === null) {
        throw new Error(
          `natlang.rerun: input ${param.name} of ${callId} was not recorded in full (${ref.reason ?? "evicted"}); ` +
            "call the function again with that input yourself"
        );
      }
      args.push(JSON.parse(text));
    }
    const loaded = (await loader.load(programRoot ? `${programRoot}/${definition.source}` : definition.source)) as ((
      ...values: unknown[]
    ) => Promise<unknown>) & { on(options: { model: string }): (...values: unknown[]) => Promise<unknown> };
    return (options.model === undefined ? loaded : loaded.on({ model: options.model }))(...args);
  }

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
      inCell(() => (callable as unknown as (...values: unknown[]) => Promise<unknown>)(...args));
    // The natlang callable's own surface (its marker, `iterateOn`, `in`, `with`) stays on the wrapper.
    for (const key of Reflect.ownKeys(callable)) {
      if (key === "length" || key === "name" || key === "prototype") continue;
      const descriptor = Reflect.getOwnPropertyDescriptor(callable, key)!;
      // A callable derived from this one (other captures, another model) runs inside the executing cell too.
      if ((key === "with" || key === "on") && typeof descriptor.value === "function") {
        const rebind = descriptor.value as (...captures: unknown[]) => F;
        Object.defineProperty(call, key, {
          ...descriptor,
          value: (...captures: unknown[]) => withinCell(rebind(...captures)),
        });
        continue;
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
