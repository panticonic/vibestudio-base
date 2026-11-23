import "./chunk-chunk-7XBVO5HJ.js";
import "./chunk-chunk-IEOFNLU4.js";
import "./chunk-chunk-PISWH5S4.js";
import "./chunk-chunk-FU7XTOKU.js";
import {
  FixtureObservationStore,
  validateMetrics
} from "./chunk-chunk-V72OLIJD.js";
import "./chunk-chunk-4S4AEQC2.js";
import "./chunk-chunk-KJPRUOSK.js";
import "./chunk-chunk-URFGSJ3U.js";
import {
  createNatlangRuntime,
  enterEpisodeCallStore
} from "./chunk-chunk-V5SNWGZ5.js";
import "./chunk-chunk-JJ6NRDGL.js";
import {
  NatlangCallError,
  bindAdaptation,
  cloneData,
  currentFrame,
  fingerprint,
  remoteDriver
} from "./chunk-chunk-7RHMLU3S.js";
import "./chunk-chunk-WRUGMGG2.js";
import "./chunk-chunk-Y6L7V2T3.js";
import "./chunk-chunk-YDKDWV2X.js";
import "./chunk-chunk-KX6VIJEB.js";

// src/evaluation/worker-entry.ts
import { parentPort, workerData } from "node:worker_threads";
import { dirname, resolve } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/app/event-loop.ts
var MAX_TIMER_MS = 2 ** 31 - 1;

// src/terminal/shell.ts
import { createInterface } from "node:readline/promises";

// src/native/archive.ts
import { gunzipSync, unzipSync } from "fflate";
var decoder = new TextDecoder();

// src/vite-plugin.ts
import { fileURLToPath } from "node:url";
var runtimeEntry = fileURLToPath(new URL("./index.js", import.meta.url));

// src/skills/ablation.ts
import YAML from "yaml";

// src/improvement/blind-view.ts
var FORBIDDEN_KEYS = [
  "expected",
  "expectedFiles",
  "expected_files",
  "score",
  "scores",
  "quality",
  "passed",
  "gates",
  "gatesPassed",
  "reward",
  "rewards",
  "gold",
  "judge",
  "verdict",
  "grade",
  "feedback",
  "correct",
  "label",
  "labels",
  "probabilities_gold",
  "effect_size",
  "wins",
  "losses",
  "disposition"
];
var FORBIDDEN = new Set(FORBIDDEN_KEYS);

// src/improvement/adopt-call.ts
import YAML2 from "yaml";

// src/evaluation/fixture-entry.ts
function fixtureEntryFacade(exports, binding, observe) {
  const wrap = (owner, path) => {
    if (!owner || typeof owner !== "object" && typeof owner !== "function")
      throw new Error(`fixture entry export path ${binding.export_path.join(".")} is absent`);
    const [name, ...rest] = path;
    const value = owner[name];
    const replacement = rest.length ? wrap(value, rest) : (...args) => {
      if (typeof value !== "function") throw new Error("fixture entry export is not callable");
      if (args.length > binding.input_arguments.length) throw new Error("fixture entry received undeclared arguments");
      for (const [index, argument] of binding.input_arguments.entries()) {
        if (binding.service_inputs.includes(argument)) {
          if (args[index] === null || !["object", "function"].includes(typeof args[index]))
            throw new Error(`fixture entry ${argument} must be constructed by the host fixture`);
        } else if (fingerprint(args[index]) !== fingerprint(binding.inputs[argument]))
          throw new Error(`fixture entry argument ${argument} differs from the program IR input`);
      }
      observe();
      return Reflect.apply(value, owner, args);
    };
    const facade = typeof owner === "function" ? (...args) => Reflect.apply(owner, void 0, args) : {};
    for (const key of Reflect.ownKeys(owner)) {
      if (["name", "length", "prototype", "caller", "arguments"].includes(String(key))) continue;
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      Object.defineProperty(facade, key, key === name ? { value: replacement, writable: false, enumerable: descriptor.enumerable, configurable: true } : { ...descriptor, configurable: true });
    }
    if (!Object.hasOwn(owner, name)) throw new Error(`fixture entry export ${name} is absent`);
    return facade;
  };
  return wrap(exports, binding.export_path);
}

// src/evaluation/worker-entry.ts
var input = workerData;
enterEpisodeCallStore(workerData.episodeCallStore);
var abort = new AbortController();
var sequence = 0;
var pending = /* @__PURE__ */ new Map();
parentPort.on("message", (message) => {
  if (message.type === "cancel") {
    abort.abort(new Error("evaluation cancelled"));
    for (const p of pending.values()) p.reject(abort.signal.reason);
    pending.clear();
  }
  if (message.type === "response") {
    const p = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) p?.reject(new Error(message.error));
    else p?.resolve(message.value);
  }
});
async function run() {
  const suite = (await import(input.moduleURL)).default;
  const traces = [];
  const modelTurns = [];
  const counters = /* @__PURE__ */ new Map();
  let captureError;
  let fixtureEntryCalls = 0;
  const requestModel = async (role, call) => {
    if (input.capture && role === "executor" && call.kind !== "turn") {
      captureError = new Error("teacher capture needs generated executor turns; use a teacher driver without decision scoring");
      abort.abort(captureError);
      throw captureError;
    }
    const frame = currentFrame(), invocation = frame?.parentCallId ?? null;
    const capture = input.capture && role === "executor";
    const request = capture ? structuredClone(call.request) : void 0;
    const turn = (counters.get(invocation ?? "") ?? 0) + 1;
    if (capture) counters.set(invocation ?? "", turn);
    const reply = await new Promise((resolve2, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve: resolve2, reject });
      parentPort.postMessage({ type: "request", id, role, call });
    });
    if (capture) modelTurns.push({
      invocation_id: invocation,
      parent_call_id: null,
      turn,
      request,
      reply: structuredClone(reply)
    });
    return reply;
  };
  const executorIdentity = input.executorIdentity ?? suite.executorIdentity;
  const runtime = createNatlangRuntime({
    program: input.program,
    adaptation: input.artifact ? bindAdaptation(input.artifact, input.program, suite.executorIdentity) : null,
    ...input.calls === false ? { calls: false } : {},
    limits: suite.policy?.limits,
    systemPrompt: suite.systemPrompt,
    evaluation: { id: input.id, caseId: input.testCase.id, replicate: input.replicate },
    executorIdentity,
    serviceDeclarations: suite.services?.declarations,
    serviceScopes: suite.services?.scopes,
    signal: abort.signal,
    isolateModules: true,
    codeEdits: suite.policy?.codeEdits ?? "deny",
    trace: (trace) => traces.push(trace),
    seed: { mode: "derived", root: input.seed },
    model: { ...suite.policy?.settings, driver: remoteDriver((call) => requestModel("executor", call), input.decisions === true, input.continuesReplies === true) }
  });
  let fixture;
  let outcome = { kind: "returned" };
  let result;
  const start = Date.now();
  const observations = new FixtureObservationStore();
  try {
    fixture = await suite.fixture.create(input.testCase, {
      runtime,
      program: input.program,
      programRoot: input.programRoot ?? resolve(dirname(fileURLToPath2(input.moduleURL)), suite.program.root),
      seed: input.seed,
      signal: abort.signal,
      observations,
      judge: (request) => requestModel("judge", { kind: "turn", request }),
      loadFreshProgram: async () => {
        const exports = await import(input.compiledEntry);
        return input.fixtureEntry ? fixtureEntryFacade(exports, input.fixtureEntry, () => fixtureEntryCalls++) : exports;
      }
    });
    if (input.preflight) {
      if (typeof fixture?.execute !== "function") throw new Error("fixture must provide execute()");
      parentPort.postMessage({ type: "result", result: {
        id: input.id,
        caseId: input.testCase.id,
        split: input.testCase.split,
        status: "scored",
        quality: 0,
        gates: {},
        metrics: {},
        feedback: "",
        outcome: { kind: "returned" },
        coverage: [],
        latencyMs: Date.now() - start,
        traces
      } });
      return;
    }
    try {
      result = await fixture.execute();
      outcome = { kind: "returned", value: result };
    } catch (error) {
      abort.signal.throwIfAborted();
      outcome = { kind: "threw", error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
        ...error instanceof NatlangCallError ? { outcome: error.outcome } : {}
      } };
    }
    abort.signal.throwIfAborted();
    if (captureError) throw captureError;
    const observation = fixture.observe ? await fixture.observe(result, outcome) : { ...result === void 0 ? {} : { result }, outcome };
    const metric = validateMetrics(await suite.score(input.testCase, observation, outcome), suite.requiredGates);
    try {
      const store = runtime.callStore();
      for (const trace of traces.filter((item) => !item.parentCallId))
        store?.annotate?.(trace.callId, "evaluation", {
          evaluation: input.id,
          case: input.testCase.id,
          quality: metric.quality,
          gates: metric.gates ?? {},
          feedback: metric.feedback ?? ""
        }, "evaluation", false);
    } catch {
    }
    let captured;
    try {
      captured = cloneData(observation);
    } catch {
      throw new Error("fixture observation must be finite JSON; supply observe() to project live handles and captures");
    }
    let portableOutcome = outcome;
    try {
      portableOutcome = cloneData(outcome);
    } catch {
      portableOutcome = { kind: outcome.kind, ...outcome.error ? { error: outcome.error } : {} };
    }
    const coverage = [...new Set(traces.flatMap((trace) => [trace.adaptation?.component, trace.adaptation?.guidanceComponent]).filter((key) => typeof key === "string"))].sort();
    if (input.capture) for (const turn of modelTurns)
      turn.parent_call_id = traces.find((trace) => trace.callId === turn.invocation_id)?.parentCallId ?? null;
    parentPort.postMessage({ type: "result", result: {
      id: input.id,
      caseId: input.testCase.id,
      split: input.testCase.split,
      status: "scored",
      quality: metric.quality,
      gates: { ...metric.gates ?? {}, ...metric.judge ? { judge: metric.judge === "accepted" } : {} },
      metrics: metric.metrics ?? {},
      feedback: metric.feedback ?? "",
      outcome: portableOutcome,
      observation: captured,
      observations: observations.snapshot(),
      coverage,
      latencyMs: Date.now() - start,
      traces,
      ...input.fixtureEntry ? { fixtureEntry: { calls: fixtureEntryCalls, inputs: input.fixtureEntry.inputs, service_inputs: input.fixtureEntry.service_inputs } } : {},
      ...input.capture ? { modelTurns } : {}
    } });
  } finally {
    await fixture?.dispose?.();
    runtime.close();
  }
}
run().then(() => parentPort.postMessage({ type: "disposed" }), (error) => parentPort.postMessage({ type: "error", error: error instanceof Error ? error.message : String(error), cancelled: abort.signal.aborted }));
