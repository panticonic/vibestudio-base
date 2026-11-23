import {
  defaultNatlangCacheDirectory,
  defaultNatlangConfigDirectory,
  defaultNatlangDataDirectory,
  defaultNatlangStateDirectory
} from "./chunk-chunk-URFGSJ3U.js";
import {
  episodeCallStoreRoot
} from "./chunk-chunk-V5SNWGZ5.js";
import {
  acquireSharedServer,
  sharedIdleSeconds,
  sharedServerKey,
  sharedServersDirectory,
  sharingEnabled
} from "./chunk-chunk-JJ6NRDGL.js";
import {
  ADAPTATION_SCHEMA,
  BudgetExhausted,
  DECISION_REPLY_SETTINGS,
  UsageGateway,
  artifactDigest,
  autoFramedScores,
  cloneData,
  decisionDeclined,
  decisionReplySetting,
  decisionUsage,
  fingerprint,
  immutable,
  validateCandidate
} from "./chunk-chunk-7RHMLU3S.js";
import {
  activeNativeAdapters,
  chatCompletionModelTurn,
  coalescingScorer,
  concurrentScoreMany,
  explicitBatchScoreMany,
  fetchModel,
  httpChatTransport,
  limitedTransport,
  nativeStateSentinelIds,
  neuraleseServerModelTurn,
  openAIEndpointRoot,
  promptLogprobDecider,
  requestLimit,
  runtimeTextToParts,
  scoreAll
} from "./chunk-chunk-Y6L7V2T3.js";

// src/evaluation/metrics.ts
function validateMetrics(input, required = []) {
  if (!input || !Number.isFinite(input.quality) || input.quality < 0 || input.quality > 1) throw new Error("quality must be finite and in [0,1]");
  if (Object.values(input.gates ?? {}).some((value) => typeof value !== "boolean")) throw new Error("gates must be boolean");
  if (Object.values(input.metrics ?? {}).some((value) => !Number.isFinite(value))) throw new Error("metrics must be finite");
  if (required.some((key) => !Object.hasOwn(input.gates ?? {}, key))) throw new Error("required regression gate missing");
  if (input.feedback !== void 0 && typeof input.feedback !== "string") throw new Error("feedback must be text");
  if (input.judge && !["accepted", "rejected", "uncertain", "unavailable"].includes(input.judge)) throw new Error("malformed judge verdict");
  return input;
}
function summarize(results) {
  const sorted = [...results].sort((a, b) => a.id.localeCompare(b.id));
  const valid = sorted.length > 0 && sorted.every((result) => result.status === "scored" && result.quality !== null);
  return {
    results: sorted,
    quality: valid ? sorted.reduce((sum, result) => sum + result.quality, 0) / sorted.length : null,
    gatesPassed: valid && sorted.every((result) => Object.values(result.gates).every(Boolean)),
    digest: fingerprint(sorted)
  };
}

// src/evaluation/worker.ts
import { Worker } from "node:worker_threads";
function runWorker(input, driver, gateway, signal, timeoutMs = 12e4, judge) {
  return new Promise((resolve6, reject) => {
    const lifetime = new AbortController();
    const requestSignal = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
    const worker = new Worker(new URL("./worker-entry.js", import.meta.url), { workerData: {
      ...input,
      episodeCallStore: episodeCallStoreRoot(),
      decisions: typeof driver.decide === "function",
      continuesReplies: driver.continuesReplies === true
    } });
    let result, finished = false, transportError;
    const usage = { modelCalls: 0, inputTokens: 0, outputTokens: 0, cost: gateway.limits.pricing ? 0 : null };
    const fail = (error) => {
      if (finished) return;
      finished = true;
      lifetime.abort(error);
      cleanup();
      void worker.terminate();
      reject(error);
    };
    const onAbort = () => {
      worker.postMessage({ type: "cancel" });
      fail(signal?.reason instanceof Error ? signal.reason : new Error("evaluation cancelled"));
    };
    const timer = setTimeout(() => fail(new Error("evaluation worker timed out")), timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    worker.on("message", async (message) => {
      if (message.type === "request") {
        try {
          const role = message.role === "judge" ? "judge" : "executor";
          const selectedDriver = role === "judge" ? judge : driver;
          if (!selectedDriver) throw new Error("fixture requested a judge but no judge driver is configured");
          const before = gateway.ledger.usage.modelCalls;
          const call = message.call;
          const scorer = call.kind === "decision" ? selectedDriver.decide : void 0;
          if (call.kind === "decision" && !scorer) throw new Error("worker requested a decision readout from a driver that cannot score replies");
          const response = scorer ? gateway.score(scorer, call.request, requestSignal, role) : gateway.request(selectedDriver, call.request, requestSignal, role);
          if (gateway.ledger.usage.modelCalls > before) usage.modelCalls++;
          const value = await response;
          const reported = scorer ? decisionUsage(value) : value;
          if (reported.prompt_tokens === void 0) usage.inputTokens = null;
          else if (usage.inputTokens !== null) usage.inputTokens += reported.prompt_tokens;
          if (reported.completion_tokens === void 0) usage.outputTokens = null;
          else if (usage.outputTokens !== null) usage.outputTokens += reported.completion_tokens;
          const pricing = gateway.limits.pricing;
          if (!pricing || reported.prompt_tokens === void 0 || reported.completion_tokens === void 0) usage.cost = null;
          else if (usage.cost !== null) usage.cost += (reported.prompt_tokens * pricing.inputPerMillion + reported.completion_tokens * pricing.outputPerMillion) / 1e6;
          if (!finished) worker.postMessage({ type: "response", id: message.id, value });
        } catch (error) {
          const failure = error instanceof Error ? error : new Error(String(error));
          if (decisionDeclined(failure)) usage.modelCalls--;
          else transportError = failure;
          if (!finished) worker.postMessage({ type: "response", id: message.id, error: failure.message });
        }
      } else if (message.type === "result") result = message.result;
      else if (message.type === "error") fail(transportError ?? new Error(message.error));
      else if (message.type === "disposed") {
        if (transportError) {
          fail(transportError);
          return;
        }
        if (!result) {
          fail(new Error("worker disposed without evaluation result"));
          return;
        }
        if (finished) return;
        finished = true;
        cleanup();
        void worker.terminate();
        result.usage = usage;
        resolve6(result);
      }
    });
    worker.on("error", fail);
    worker.on("exit", (code) => {
      if (!finished) fail(new Error("evaluation worker exited before disposal: " + code));
    });
  });
}

// src/evaluation/runner.ts
var EvaluationInfrastructureError = class extends Error {
  constructor(caseId, attempt, cause, ledger) {
    super("evaluation infrastructure failure for " + caseId + ": " + (cause instanceof Error ? cause.message : String(cause)), { cause });
    this.caseId = caseId;
    this.attempt = attempt;
    this.ledger = ledger;
    this.name = "EvaluationInfrastructureError";
  }
  caseId;
  attempt;
  ledger;
};
async function preflightEvaluation(prepared) {
  const gateway = new UsageGateway({ maxRollouts: prepared.cases.length, maxProposals: 0, maxModelCalls: 0 });
  for (const testCase of prepared.cases) {
    await runWorker(
      {
        moduleURL: prepared.moduleURL,
        compiledEntry: prepared.compiledEntry,
        program: prepared.program,
        programRoot: prepared.programRoot,
        testCase,
        artifact: null,
        seed: 0,
        replicate: 0,
        id: "preflight:" + testCase.id,
        preflight: true
      },
      () => {
        throw new Error("paid inference is unavailable during fixture preflight");
      },
      gateway
    );
  }
  return { cases: prepared.cases.length, suiteHash: prepared.suiteHash };
}
function candidateArtifact(prepared, candidate, runId = "evaluation") {
  const components = prepared.program.components.filter((component) => prepared.components.includes(component.key));
  const validated = validateCandidate(candidate, components);
  const artifact = {
    schema: ADAPTATION_SCHEMA,
    digest: "",
    program: {
      id: prepared.program.id,
      buildHash: prepared.program.buildHash,
      protocol: prepared.program.protocol,
      guidanceScope: prepared.program.guidanceScope
    },
    executor: prepared.suite.executorIdentity,
    policy: prepared.suite.policy ?? { codeEdits: "deny", settings: {} },
    components: components.map((component) => ({ key: component.key, baselineHash: component.baselineHash, contractHash: component.contractHash, value: validated[component.key] })),
    provenance: { runId, strategy: "evaluation", engine: "natlang/v1", suiteHash: prepared.suiteHash, seed: 0, promotion: "selected", evidence: {} }
  };
  artifact.digest = artifactDigest(artifact);
  return artifact;
}
async function evaluate(prepared, options) {
  if (options.executorIdentity && options.candidate)
    throw new Error("executorIdentity override cannot be combined with an adaptation candidate");
  const cases = prepared.cases.filter((testCase) => options.caseIds ? options.caseIds.includes(testCase.id) : testCase.split === (options.split ?? "validation"));
  if (!cases.length || options.caseIds?.some((id) => !cases.some((testCase) => testCase.id === id))) throw new Error("requested evaluation cases are missing");
  const candidate = options.candidate;
  const artifact = candidate ? candidateArtifact(prepared, candidate, options.runId) : null;
  const gateway = options.gateway ?? new UsageGateway(prepared.suite.budget);
  const results = [];
  for (const testCase of cases.sort((a, b) => a.id.localeCompare(b.id))) {
    const seed = parseInt(fingerprint({ seed: options.seed ?? 0, case: testCase.id, replicate: options.replicate ?? 0 }).slice(0, 8), 16) >>> 0;
    const id = fingerprint({
      suite: prepared.suiteHash,
      case: testCase.id,
      candidate: candidate ?? null,
      seed,
      replicate: options.replicate ?? 0,
      policy: prepared.suite.policy ?? null,
      ...options.executorIdentity ? { executorIdentity: options.executorIdentity } : {}
    });
    let attempt = 0;
    while (true) {
      gateway.reserve("rollouts", 1, options.signal);
      try {
        results.push(await runWorker(
          {
            moduleURL: prepared.moduleURL,
            compiledEntry: prepared.compiledEntry,
            program: prepared.program,
            programRoot: prepared.programRoot,
            testCase,
            artifact,
            ...options.calls === false ? { calls: false } : {},
            ...options.fixtureEntry ? { fixtureEntry: options.fixtureEntry } : {},
            seed,
            replicate: options.replicate ?? 0,
            id,
            ...options.capture ? { capture: true } : {},
            ...options.executorIdentity ? { executorIdentity: options.executorIdentity } : {}
          },
          options.driver,
          gateway,
          options.signal,
          options.timeoutMs,
          options.judge
        ));
        break;
      } catch (error) {
        if (error instanceof BudgetExhausted || options.signal?.aborted) throw error;
        if (attempt++ < (options.retries ?? 0)) continue;
        throw new EvaluationInfrastructureError(testCase.id, attempt, error, gateway.snapshot());
      }
    }
  }
  return summarize(results);
}

// src/evaluation/fixtures.ts
var FixtureObservationStore = class {
  values = /* @__PURE__ */ Object.create(null);
  put(key, value) {
    if (!key || Object.hasOwn(this.values, key)) throw new Error("observation needs a unique nonempty key: " + key);
    this.values[key] = immutable(cloneData(value));
  }
  get(key) {
    return this.values[key];
  }
  snapshot() {
    return immutable(cloneData(this.values));
  }
};

// src/adaptation/weights/manifest.ts
var WEIGHTS_SCHEMA = "natlang.adapters/v1";
var DIGEST_DOMAIN = "natlang.adapters/v1";
var WeightManifestError = class extends Error {
  constructor(message) {
    super(`weights-manifest: ${message}`);
    this.name = "WeightManifestError";
  }
};
function manifestDigest(manifest) {
  const { digest: _digest, ...rest } = manifest;
  return fingerprint(rest, DIGEST_DOMAIN);
}
function sealManifest(manifest) {
  const sealed = { ...manifest, digest: manifestDigest(manifest) };
  validateManifest(sealed);
  return immutable(sealed);
}
var isString = (value) => typeof value === "string" && value.length > 0;
var IDENTITY_KEYS = ["architecture", "checkpoint_sha256", "embedding_weight_sha256", "tokenizer_fingerprint"];
function validateManifest(value) {
  const fail = (message) => {
    throw new WeightManifestError(message);
  };
  if (!value || typeof value !== "object") fail("not an object");
  const manifest = value;
  if (manifest.schema !== WEIGHTS_SCHEMA) fail(`schema must be ${WEIGHTS_SCHEMA}`);
  if (!isString(manifest.program?.id) || !isString(manifest.program?.buildHash)) fail("program needs id and buildHash");
  if (!manifest.base || IDENTITY_KEYS.some((key) => !isString(manifest.base[key])) || Object.keys(manifest.base).length !== IDENTITY_KEYS.length)
    fail("base must be an exact native model identity");
  const nodes = /* @__PURE__ */ new Map();
  for (const node of manifest.tree ?? fail("tree missing")) {
    if (!isString(node.id) || !["tree", "folder", "lambda"].includes(node.level) || typeof node.path !== "string") fail(`bad scope node ${node?.id}`);
    if (nodes.has(node.id)) fail(`duplicate scope node ${node.id}`);
    nodes.set(node.id, node);
  }
  const roots = [...nodes.values()].filter((node) => node.parent === null);
  if (nodes.size && (roots.length !== 1 || roots[0].level !== "tree")) fail("the scope tree needs exactly one program root of level tree");
  for (const node of nodes.values()) if (node.parent !== null && !nodes.has(node.parent)) fail(`scope node ${node.id} has unknown parent`);
  const bindings = /* @__PURE__ */ new Set(), definitions = /* @__PURE__ */ new Set();
  for (const binding of manifest.bindings ?? fail("bindings missing")) {
    if (!isString(binding.id) || !isString(binding.component) || !isString(binding.semanticHash)) fail("binding needs id, component, semanticHash");
    if (bindings.has(binding.id)) fail(`duplicate binding ${binding.id}`);
    bindings.add(binding.id);
    const key = JSON.stringify([binding.definitionId ?? binding.component, binding.contextId]);
    if (definitions.has(key)) fail(`two bindings for definition ${binding.definitionId ?? binding.component} in one context`);
    definitions.add(key);
    const ancestry = binding.ancestry ?? [];
    if (!ancestry.length) fail(`binding ${binding.id} has no scope ancestry`);
    ancestry.forEach((id, index) => {
      const node = nodes.get(id) ?? fail(`binding ${binding.id} names unknown scope node ${id}`);
      if (node.parent !== (index ? ancestry[index - 1] : null)) fail(`binding ${binding.id} ancestry is not a root-to-leaf path at ${id}`);
    });
    if (nodes.get(ancestry.at(-1)).level !== "lambda") fail(`binding ${binding.id} must end at its lambda node`);
  }
  const byNode = /* @__PURE__ */ new Set(), artifacts = /* @__PURE__ */ new Set();
  for (const artifact of manifest.artifacts ?? fail("artifacts missing")) {
    if (!nodes.has(artifact.node)) fail(`artifact for unknown node ${artifact.node}`);
    if (byNode.has(artifact.node)) fail(`node ${artifact.node} has two artifacts`);
    if (!isString(artifact.artifact) || !Number.isInteger(artifact.rank) || artifact.rank < 1) fail(`artifact on ${artifact.node} needs id and positive rank`);
    if (!["native-subspace", "free-lora"].includes(artifact.parameterization)) fail(`artifact on ${artifact.node} has unknown parameterization`);
    const gguf = artifact.exports?.gguf, peft = artifact.exports?.peft;
    const relativePath = (path) => isString(path) && !path.startsWith("/") && !path.split(/[\\/]/).includes("..");
    if (gguf && (!relativePath(gguf.file) || !/^[0-9a-f]{64}$/.test(gguf.sha256) || !/^[0-9a-f]{64}$/.test(gguf.baseGgufSha256)))
      fail(`gguf export of ${artifact.node} needs a release-relative file, its sha256 and the base GGUF sha256`);
    if (peft && (!relativePath(peft.directory) || !/^[0-9a-f]{64}$/.test(peft.sha256))) fail(`peft export of ${artifact.node} is malformed`);
    byNode.add(artifact.node);
    artifacts.add(artifact.artifact);
  }
  for (const artifact of manifest.artifacts) for (const parent of artifact.requires ?? fail("requires missing"))
    if (!artifacts.has(parent)) fail(`artifact on ${artifact.node} requires ${parent}, which this release does not carry`);
  const families = /* @__PURE__ */ new Set();
  for (const family of manifest.families ?? fail("families missing")) {
    if (!isString(family.family) || !isString(family.version) || !isString(family.artifact)) fail("family version needs family, version, artifact");
    if (typeof family.amplitudeHex !== "string" || !/^0x[01]\.[0-9a-f]+p[+-]\d+$/i.test(family.amplitudeHex) || /^0x0\.0+p/i.test(family.amplitudeHex))
      fail(`family ${family.family} amplitude must be a positive float.hex() value`);
    const key = family.family + "@" + family.version;
    if (families.has(key)) fail(`duplicate family version ${key}`);
    families.add(key);
  }
  for (const membership of manifest.memberships ?? fail("memberships missing")) {
    if (!bindings.has(membership.binding)) fail(`membership for unknown binding ${membership.binding}`);
    if (!families.has(membership.family + "@" + membership.version)) fail(`membership names unpublished family ${membership.family}@${membership.version}`);
    if (!Number.isFinite(membership.gate) || membership.gate < 0) fail(`family gate for ${membership.binding} must be finite and nonnegative`);
  }
  const softKeys = /* @__PURE__ */ new Set();
  for (const soft of manifest.softStates ?? fail("softStates missing")) {
    if (!bindings.has(soft.binding)) fail(`soft state for unknown binding ${soft.binding}`);
    if (soft.kind !== "instructions" && soft.kind !== "skill") fail(`soft state kind ${soft.kind} is unknown`);
    if (soft.kind === "skill" !== (typeof soft.target === "string" && soft.target.startsWith("skills.")))
      fail("a skill soft state names its skills.<name> target; an instruction state has none");
    if (!/^nzs1_[a-z2-7]{52}$/.test(soft.state) || !/^[0-9a-f]{64}$/.test(soft.textSha256) || !Number.isInteger(soft.tokens) || soft.tokens < 1)
      fail(`soft state of ${soft.binding} needs an nzs1 state ID, its text sha256 and token count`);
    const key = JSON.stringify([soft.binding, soft.kind, soft.target]);
    if (softKeys.has(key)) fail(`two soft states for ${soft.binding} ${soft.kind} ${soft.target ?? ""}`);
    softKeys.add(key);
  }
  for (const [node, scale] of Object.entries(manifest.scales ?? fail("scales missing")))
    if (!nodes.has(node) || !Number.isFinite(scale)) fail(`scale for ${node} must name a node and be finite`);
  if (manifest.fallback !== "base") fail("fallback must be base");
  if (!Array.isArray(manifest.validatedReductions)) fail("validatedReductions missing");
  if (manifest.digest !== manifestDigest(manifest)) fail("digest does not match content");
}
function parseManifest(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new WeightManifestError(`not JSON: ${error.message}`);
  }
  validateManifest(value);
  return immutable(value);
}

// src/model/config.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { join as join2 } from "node:path";

// src/model-catalog.ts
var LFM3_REPOSITORY = "LiquidAI/LFM3-1.7B-GGUF";
var LFM3_REVISION = "b3f2ae5d73cd3c91bf40e8ba752c648aa05dffdf";
var lfm3 = (quant, bytes, sha256) => Object.freeze({
  id: `lfm3-1.7b-${quant.toLowerCase()}`,
  label: `LFM3 1.7B \xB7 ${quant}`,
  family: "lfm3",
  file: `LFM3-1.7B-${quant}.gguf`,
  quant,
  bytes,
  sha256,
  // Most layers are short convolutions or 256-token windows. Measured on llama.cpp 0.8 at 163,840 tokens of Q8_0: 3,809 MiB
  // resident (12,800 bytes per token over the weights) with the default window cache, 5,380 MiB (about 23,000) with --swa-full,
  // which the server needs to reuse a cached prompt prefix at all.
  contextTokens: 32768,
  kvBytesPerToken: 23e3,
  fullSlidingWindowCache: true,
  template: "LFM3-1.7B.jinja",
  downloadUrl: `https://huggingface.co/${LFM3_REPOSITORY}/resolve/${LFM3_REVISION}/LFM3-1.7B-${quant}.gguf`,
  source: Object.freeze({ repository: LFM3_REPOSITORY, revision: LFM3_REVISION }),
  // Greedy, with reasoning kept in the history: the settings of the base evaluation.
  request: Object.freeze({ temperature: 0, chat_template_kwargs: Object.freeze({ preserve_thinking: true }) })
});
var STOCK_MODELS = Object.freeze([
  lfm3("Q4_K_M", 1099627808, "3793e1e6e2266919d6e015287221b41100175a98eddaba92e111aed3b05c93c4"),
  lfm3("Q5_K_M", 1258663200, "41e51fb0be5f472d323055f2734d986d5a2429570973508fa6322f3f07f6d7f3"),
  lfm3("Q6_K", 1427638304, "54e1bd947c77167823d45bf495f1c3e2d226ca7fb242f83cfa141ee3a6ab55c6"),
  lfm3("Q8_0", 1846238496, "8f6b24182258205e9e01e21f1f24a1f208c1e8115578825d202ce39976af20b6"),
  lfm3("BF16", 3466626336, "39158a79f56edb85e0c4252ce6447b8d7883ef82ffedd02f0cda7c84da5e9f68")
]);
var DEFAULT_LOCAL_MODEL = STOCK_MODELS.find((model) => model.quant === "Q8_0");
function stockModel(id) {
  const found = STOCK_MODELS.find((model) => model.id === id);
  if (!found) throw new Error(`unknown stock model ${id}; choose ${STOCK_MODELS.map((model) => model.id).join(", ")}`);
  return found;
}

// src/model/native-managed.ts
import { spawn, spawnSync } from "node:child_process";
import { connect } from "node:net";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var SHA256 = /^[0-9a-f]{64}$/;
function validateNativeSettings(native) {
  if (!native || typeof native !== "object" || Array.isArray(native)) throw new TypeError("native must be an object");
  if (typeof native.checkpoint !== "string" || !native.checkpoint) throw new Error("native.checkpoint must name the pinned checkpoint; run natlang setup --native SOURCE");
  if (native.base !== void 0 && (typeof native.base !== "string" || !native.base)) throw new Error("native.base must name a local base snapshot");
  if (typeof native.sha256 !== "string" || !SHA256.test(native.sha256)) throw new Error("native.sha256 must be the checkpoint SHA-256");
  if (native.actorView !== void 0 && (typeof native.actorView?.path !== "string" || !SHA256.test(native.actorView.sha256 ?? "")))
    throw new Error("native.actorView must be the {path, sha256, bytes} receipt natlang setup --native wrote");
  if (native.port !== void 0 && (!Number.isSafeInteger(native.port) || native.port < 1 || native.port > 65535))
    throw new Error("native.port must be a port number");
  if (native.dtype !== void 0 && !["float32", "bfloat16"].includes(native.dtype)) throw new Error("native.dtype must be float32 or bfloat16");
  if (native.prefixCacheGb !== void 0 && !(Number.isFinite(native.prefixCacheGb) && native.prefixCacheGb >= 0))
    throw new Error("native.prefixCacheGb must be a number >= 0");
  for (const key of ["memoryGb", "contextTokens", "startTimeoutMs"])
    if (native[key] !== void 0 && !(Number.isFinite(native[key]) && native[key] > 0)) throw new Error(`native.${key} must be positive`);
  for (const key of ["args", "launcher", "stop", "pythonPath"])
    if (native[key] !== void 0 && (!Array.isArray(native[key]) || native[key].some((value) => typeof value !== "string")))
      throw new Error(`native.${key} must be an array of strings`);
  if (native.stop && !native.launcher) throw new Error("native.stop requires native.launcher");
}
function nativePort(native) {
  return native.port ?? 2e4 + parseInt(native.sha256.slice(0, 8), 16) % 1e4;
}
var nativeEndpoint = (native) => `http://127.0.0.1:${nativePort(native)}`;
var unitName = (native) => `natlang-native-${native.sha256.slice(0, 12)}-${nativePort(native)}`;
var substitute = (values, native) => values.map((value) => value.replaceAll("{port}", String(nativePort(native))).replaceAll("{unit}", unitName(native)));
function checkoutRoot() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  return existsSync(join(root, "training", "neuralese", "natlang_neuralese")) ? root : void 0;
}
function defaultNativePython(environment = process.env) {
  if (environment.NATLANG_NATIVE_PYTHON) return { python: environment.NATLANG_NATIVE_PYTHON };
  const root = checkoutRoot();
  if (!root) return {};
  const venv = join(root, ".venv-neuralese", "bin", "python");
  return { ...existsSync(venv) ? { python: venv } : {}, pythonPath: [join(root, "training", "neuralese"), root] };
}
function nativeServerCommand(native, environment = process.env) {
  const python = native.python ?? defaultNativePython(environment).python ?? "python3";
  const pythonPath = native.pythonPath ?? (native.python ? [] : defaultNativePython(environment).pythonPath ?? []);
  const server = [
    python,
    "-u",
    "-m",
    "natlang_neuralese.serve",
    "--native-checkpoint",
    native.checkpoint,
    "--host",
    "127.0.0.1",
    "--port",
    String(nativePort(native)),
    "--device",
    native.device ?? "auto",
    ...native.base ? ["--base", native.base] : [],
    ...native.dtype ? ["--dtype", native.dtype] : [],
    ...native.memoryGb ? ["--memory-gb", String(native.memoryGb)] : [],
    ...native.contextTokens ? ["--ctx-size", String(native.contextTokens)] : [],
    ...native.actorView ? ["--native-actor-view", native.actorView.path, "--native-actor-view-sha256", native.actorView.sha256] : [],
    ...(native.prefixCacheGb ?? 2) > 0 ? ["--prefix-cache-gb", String(native.prefixCacheGb ?? 2)] : [],
    ...native.storeDir === true ? ["--store-dir"] : native.storeDir ? ["--store-dir", native.storeDir] : [],
    ...native.args ?? []
  ];
  const joined = [...pythonPath, ...environment.PYTHONPATH ? [environment.PYTHONPATH] : []].join(":");
  const env = { ...environment, ...joined ? { PYTHONPATH: joined } : {} };
  const command = native.launcher ? [...substitute(native.launcher, native), ...joined ? ["env", `PYTHONPATH=${joined}`] : [], ...server] : server;
  return { command, env };
}
async function servedCheckpoint(endpoint) {
  try {
    const response = await fetch(endpoint + "/v1/neuralese/info", { signal: AbortSignal.timeout(5e3) });
    if (!response.ok) return { reachable: true };
    const state = (await response.json()).native_state;
    const identity = state && ["architecture", "checkpoint_sha256", "embedding_weight_sha256", "tokenizer_fingerprint"].every((key) => typeof state[key] === "string") ? {
      architecture: state.architecture,
      checkpoint_sha256: state.checkpoint_sha256,
      embedding_weight_sha256: state.embedding_weight_sha256,
      tokenizer_fingerprint: state.tokenizer_fingerprint
    } : void 0;
    return { reachable: true, checkpointSha256: state?.checkpoint_sha256, ...identity ? { identity } : {} };
  } catch {
    return { reachable: false };
  }
}
function nativeListening(endpoint, timeoutMs = 5e3) {
  const url = new URL(endpoint);
  return new Promise((resolveListening) => {
    const socket = connect({ host: url.hostname, port: Number(url.port) || 80 });
    const done = (value) => {
      socket.destroy();
      resolveListening(value);
    };
    socket.setTimeout(timeoutMs, () => done(true));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}
async function waitWhileBusy(endpoint, deadline) {
  let served = await servedCheckpoint(endpoint);
  while (!served.reachable && Date.now() < deadline && await nativeListening(endpoint)) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 2e3));
    served = await servedCheckpoint(endpoint);
  }
  return served;
}
function nativeIdentity(sha256, environment = process.env) {
  const directory = nativeModelsDirectory(environment);
  try {
    const identity = JSON.parse(readFileSync(join(directory, "pins.json"), "utf8"))[sha256]?.identity;
    if (identity) return identity;
  } catch {
  }
  try {
    return JSON.parse(readFileSync(join(directory, "identities.json"), "utf8"))[sha256];
  } catch {
    return void 0;
  }
}
function rememberIdentity(served, environment) {
  const identity = served.identity;
  if (!identity || nativeIdentity(identity.checkpoint_sha256, environment)) return;
  const index = join(nativeModelsDirectory(environment), "pins.json");
  try {
    const pins = JSON.parse(readFileSync(index, "utf8"));
    if (pins[identity.checkpoint_sha256]) recordPin(index, identity.checkpoint_sha256, { ...pins[identity.checkpoint_sha256], identity });
  } catch {
  }
  if (nativeIdentity(identity.checkpoint_sha256, environment)) return;
  const directory = nativeModelsDirectory(environment), file = join(directory, "identities.json");
  mkdirSync(directory, { recursive: true });
  const identities = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  identities[identity.checkpoint_sha256] = identity;
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(identities, null, 2) + "\n");
  renameSync(temporary, file);
}
var owned = /* @__PURE__ */ new Map();
var starting = /* @__PURE__ */ new Map();
function ensureNativeServer(native, environment = process.env, error = process.stderr) {
  const endpoint = nativeEndpoint(native);
  let pending = starting.get(endpoint);
  if (!pending) {
    pending = start(native, endpoint, environment, error).finally(() => starting.delete(endpoint));
    starting.set(endpoint, pending);
  }
  return pending;
}
function mismatch(native, endpoint, served) {
  return new Error(`native server at ${endpoint} serves ${served.checkpointSha256 ? `checkpoint ${served.checkpointSha256.slice(0, 12)}` : "no native checkpoint"}, not ${native.sha256.slice(0, 12)}; stop it or set native.port in the profile`);
}
async function start(native, endpoint, environment, error) {
  const current = await waitWhileBusy(endpoint, Date.now() + (native.startTimeoutMs ?? 15 * 6e4));
  if (current.checkpointSha256 === native.sha256) {
    rememberIdentity(current, environment);
    return;
  }
  if (current.reachable) throw mismatch(native, endpoint, current);
  if (await nativeListening(endpoint))
    throw new Error(`a server at ${endpoint} accepts connections but has not answered within the start timeout; stop it or set native.port in the profile`);
  if (!existsSync(native.checkpoint)) throw new Error(`native checkpoint ${native.checkpoint} is missing; run natlang setup --native ${native.source ?? "SOURCE"}`);
  if (native.actorView && !existsSync(native.actorView.path)) {
    error.write(`natlang: actor view ${native.actorView.path} is missing; loading the complete checkpoint (natlang setup --native prepares it again)
`);
    native = { ...native, actorView: void 0 };
  }
  const { command, env } = nativeServerCommand(native, environment);
  error.write(`natlang: starting native model ${native.sha256.slice(0, 12)}${native.step !== void 0 ? ` (step ${native.step})` : ""} at ${endpoint}; loading takes a minute (natlang serve keeps it running between commands)
`);
  const record = { child: null, native, stderr: "" };
  const child = spawn(command[0], command.slice(1), { env, stdio: ["ignore", "ignore", "pipe"] });
  record.child = child;
  owned.set(endpoint, record);
  child.stderr?.on("data", (chunk) => {
    record.stderr = (record.stderr + String(chunk)).slice(-16e3);
  });
  let spawnError;
  child.once("error", (failure) => {
    spawnError = failure;
  });
  const deadline = Date.now() + (native.startTimeoutMs ?? 15 * 6e4);
  try {
    while (Date.now() < deadline) {
      if (spawnError) throw new Error(`could not start the native server (${command[0]}): ${spawnError.message}`);
      const served = await servedCheckpoint(endpoint);
      if (served.checkpointSha256 === native.sha256) {
        rememberIdentity(served, environment);
        return;
      }
      if (served.reachable && served.checkpointSha256) throw mismatch(native, endpoint, served);
      if (child.exitCode !== null && (child.exitCode !== 0 || !native.launcher)) {
        if (served.reachable) continue;
        throw new Error(`native server exited during startup (status ${child.exitCode})
${record.stderr.trim()}`);
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
    throw new Error(`native server did not become ready within ${Math.round((native.startTimeoutMs ?? 15 * 6e4) / 1e3)} s
${record.stderr.trim()}`);
  } catch (failure) {
    await stopNativeServer(endpoint);
    throw failure;
  }
}
async function stopNativeServer(endpoint) {
  const record = owned.get(endpoint);
  if (!record) return;
  owned.delete(endpoint);
  if (record.native.stop) spawnSync(record.native.stop[0], substitute(record.native.stop, record.native).slice(1), { stdio: "ignore", timeout: 6e4 });
  const child = record.child;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once("exit", () => resolveExit()));
  child.kill("SIGTERM");
  let timer;
  await Promise.race([exited, new Promise((resolveTimeout) => {
    timer = setTimeout(resolveTimeout, 15e3);
  })]);
  if (timer) clearTimeout(timer);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}
process.once("exit", () => {
  for (const record of owned.values()) {
    if (record.native.stop) spawnSync(record.native.stop[0], substitute(record.native.stop, record.native).slice(1), { stdio: "ignore", timeout: 3e4 });
    else if (record.child && record.child.exitCode === null) record.child.kill("SIGTERM");
  }
});
var nativeModelsDirectory = (environment = process.env) => environment.NATLANG_NATIVE_MODELS ? resolve(environment.NATLANG_NATIVE_MODELS) : join(defaultNatlangDataDirectory(environment), "native-models");
function recordPin(index, key, pin) {
  const pins = existsSync(index) ? JSON.parse(readFileSync(index, "utf8")) : {};
  pins[key] = pin;
  const temporary = `${index}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(pins, null, 1) + "\n");
  renameSync(temporary, index);
  return pin;
}

// src/model/config.ts
var plainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
function mergeRequest(defaults, request) {
  const merged = { ...defaults };
  for (const [key, value] of Object.entries(request ?? {}))
    merged[key] = plainObject(value) && plainObject(merged[key]) ? { ...merged[key], ...value } : value;
  return merged;
}
function resolveModelChoice(profile) {
  if (profile.promptRendering !== void 0 && !["full", "program-header"].includes(profile.promptRendering))
    throw new Error("promptRendering must be full or program-header");
  if (profile.decisionReply !== void 0 && !DECISION_REPLY_SETTINGS.includes(profile.decisionReply))
    throw new Error(`decisionReply must be ${DECISION_REPLY_SETTINGS.join(", ")}`);
  if (profile.runtime && (typeof profile.runtime !== "object" || Array.isArray(profile.runtime)))
    throw new TypeError("profile.runtime must be an object");
  if (profile.runtime && "review" in profile.runtime)
    throw new Error("profile.runtime.review is no longer supported: careful review was removed; delete the setting");
  if (profile.provider && profile.endpoint) throw new Error("model profile cannot set both provider and endpoint");
  if (profile.escalate !== void 0 && (typeof profile.escalate !== "string" || !profile.escalate))
    throw new Error("escalate must name another model profile");
  if (profile.native) {
    if (profile.provider || profile.endpoint || profile.chatCompletionsUrl || profile.local)
      throw new Error("a native profile cannot also set provider, endpoint, chatCompletionsUrl or local");
    validateNativeSettings(profile.native);
  }
  if (profile.chatCompletionsUrl !== void 0 && !profile.endpoint)
    throw new Error("chatCompletionsUrl requires an external endpoint metadata root");
  if (profile.chatCompletionsUrl !== void 0) {
    let target;
    try {
      target = new URL(profile.chatCompletionsUrl);
    } catch {
      throw new Error("chatCompletionsUrl must be an absolute HTTP(S) URL");
    }
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password || target.hash || target.search)
      throw new Error("chatCompletionsUrl must be an absolute HTTP(S) URL without credentials or query parameters");
  }
  if (profile.provider && !profile.model) throw new Error("Pi provider profile needs a model ID");
  if (profile.provider && profile.request && Object.keys(profile.request).length)
    throw new Error("Pi provider profiles do not support raw request fields; use an endpoint profile for guided wire controls");
  for (const key of ["apiKey", "signal", "fetch", "onPayload", "onResponse", "transformHeaders"])
    if (profile.piOptions && Object.hasOwn(profile.piOptions, key))
      throw new Error(`piOptions.${key} cannot be set in a model profile; use an environment variable or the programmatic Pi backend`);
  if (!profile.provider && (profile.piOptions || profile.piPayload || profile.modelOptions || profile.piMode))
    throw new Error("piMode, piOptions, piPayload and modelOptions require a Pi provider profile");
  if (profile.piMode && !["native", "simple"].includes(profile.piMode))
    throw new Error("piMode must be native or simple");
  if (profile.local && (profile.provider || profile.endpoint || profile.chatCompletionsUrl))
    throw new Error("local server options require a managed-local profile");
  if (profile.local) {
    for (const [key, minimum] of [
      ["contextTokens", 1024],
      ["gpuLayers", 0],
      ["parallel", 1],
      ["cacheRamMiB", 0],
      ["memoryBudgetMiB", 1],
      ["kvBytesPerToken", 1]
    ]) {
      const value = profile.local[key];
      if (value !== void 0 && (!Number.isSafeInteger(value) || value < minimum))
        throw new Error(`local.${key} must be an integer >= ${minimum}`);
    }
    for (const key of ["modelPath", "template", "modelId", "server", "stock"])
      if (profile.local[key] !== void 0 && (typeof profile.local[key] !== "string" || !profile.local[key]))
        throw new Error(`local.${key} must be a nonempty string`);
    if ((profile.local.template || profile.local.modelId) && !profile.local.modelPath)
      throw new Error("local.template and local.modelId describe local.modelPath; set it too");
    if (profile.local.stock !== void 0) {
      if (profile.local.modelPath) throw new Error("local.stock and local.modelPath are alternatives; set one");
      stockModel(profile.local.stock);
    }
    if (profile.local.args && (!Array.isArray(profile.local.args) || profile.local.args.some((value) => typeof value !== "string")))
      throw new Error("local.args must be an array of strings");
    const ownedFlags = /* @__PURE__ */ new Set([
      "-m",
      "--model",
      "--model-url",
      "--host",
      "--port",
      "--chat-template-file",
      "-c",
      "--ctx-size",
      "-ngl",
      "--n-gpu-layers",
      "--parallel",
      "-np",
      "--cache-ram"
    ]);
    for (const arg of profile.local.args ?? []) if (ownedFlags.has(arg.split("=")[0]))
      throw new Error(`local.args cannot override managed flag ${arg}; use the dedicated local setting where available`);
  }
  if (profile.concurrency !== void 0 && (!Number.isSafeInteger(profile.concurrency) || profile.concurrency < 1))
    throw new Error("concurrency must be an integer >= 1");
  const batching = profile.batching;
  if (batching !== void 0) {
    if (!batching || typeof batching !== "object" || Array.isArray(batching)) throw new TypeError("batching must be an object");
    if (batching.mode !== void 0 && !["server-continuous", "explicit-batch", "serial"].includes(batching.mode))
      throw new Error("batching.mode must be server-continuous, explicit-batch or serial");
    if (batching.maxConcurrent !== void 0 && (!Number.isSafeInteger(batching.maxConcurrent) || batching.maxConcurrent < 1))
      throw new Error("batching.maxConcurrent must be an integer >= 1");
    if (batching.coalesceMs !== void 0 && !(Number.isFinite(batching.coalesceMs) && batching.coalesceMs >= 0))
      throw new Error("batching.coalesceMs must be a number >= 0");
    if (batching.scoreEndpoint && batching.mode !== "explicit-batch")
      throw new Error("batching.scoreEndpoint requires batching.mode explicit-batch");
  }
  const common = {
    promptRendering: profile.promptRendering ?? "full",
    headers: profile.headers,
    runtime: profile.runtime,
    decisionReply: profile.decisionReply ?? "auto",
    ...profile.concurrency === void 0 ? {} : { concurrency: profile.concurrency },
    ...batching === void 0 ? {} : { batching }
  };
  if (profile.provider) return {
    ...common,
    kind: "pi-provider",
    provider: profile.provider,
    model: profile.model,
    apiKeyEnv: profile.apiKeyEnv,
    piOptions: profile.piOptions,
    piPayload: profile.piPayload,
    piMode: profile.piMode ?? "native",
    modelOptions: profile.modelOptions
  };
  if (profile.native) return {
    ...common,
    kind: "external",
    endpoint: nativeEndpoint(profile.native),
    model: profile.model ?? "native",
    apiKeyEnv: profile.apiKeyEnv ?? "NATLANG_API_KEY",
    request: profile.request,
    neuraleseServer: true,
    managedNative: profile.native
  };
  if (profile.endpoint) return {
    ...common,
    kind: "external",
    endpoint: profile.endpoint,
    ...profile.chatCompletionsUrl ? { chatCompletionsUrl: profile.chatCompletionsUrl } : {},
    model: profile.model ?? DEFAULT_LOCAL_MODEL.id,
    apiKeyEnv: profile.apiKeyEnv ?? "NATLANG_API_KEY",
    request: profile.request,
    ...profile.neuraleseServer ? { neuraleseServer: true } : {}
  };
  if (profile.model) throw new Error("a configured model ID needs an endpoint; omit both to use the managed local default");
  const release = profile.local?.modelPath ? void 0 : profile.local?.stock ? stockModel(profile.local.stock) : DEFAULT_LOCAL_MODEL;
  const defaults = release?.request;
  return {
    ...common,
    ...profile.decisionReply === void 0 ? { decisionReply: release ? "result-object" : "auto" } : {},
    kind: "managed-local",
    model: profile.local?.modelId ?? release?.id ?? "local-gguf",
    request: defaults ? mergeRequest(structuredClone(defaults), profile.request) : profile.request,
    local: profile.local,
    ...release ? { release } : {}
  };
}
function programModelProfile(model, profiles = {}) {
  const { profile: named, stock, provider, model: id, endpoint, request, contextTokens, parallel, escalate } = model;
  if (named && profiles[named]) return { name: named, profile: profiles[named] };
  const local = contextTokens !== void 0 || parallel !== void 0 || stock ? {
    ...stock ? { stock } : {},
    ...contextTokens !== void 0 ? { contextTokens } : {},
    ...parallel !== void 0 ? { parallel } : {}
  } : void 0;
  const profile = provider ? { provider, model: id } : endpoint ? { endpoint, ...id ? { model: id } : {}, ...request ? { request } : {} } : { ...local ? { local } : {}, ...request ? { request } : {} };
  if (provider && local) throw new Error("model.contextTokens and model.parallel apply to a local model, not a provider");
  return { name: "program", profile: { ...profile, ...escalate && profiles[escalate] ? { escalate } : {} } };
}
function loadModelConfiguration(name, overrides = {}, environment = process.env, program) {
  const configPath = join2(defaultNatlangConfigDirectory(environment), "config.json");
  let config = {};
  if (existsSync2(configPath)) config = JSON.parse(readFileSync2(configPath, "utf8"));
  const declared = program && !name && !overrides.provider && !overrides.model && !environment.NATLANG_PROFILE && !environment.NATLANG_PROVIDER && !environment.NATLANG_SERVER && !environment.NATLANG_MODEL ? programModelProfile(program, config.profiles) : void 0;
  const selected = declared?.name ?? name ?? environment.NATLANG_PROFILE ?? config.defaultProfile ?? "default";
  const configured = declared?.profile ?? config.profiles?.[selected] ?? {};
  const provider = overrides.provider ?? environment.NATLANG_PROVIDER;
  const endpoint = environment.NATLANG_SERVER;
  const profile = {
    ...configured,
    ...provider ? { provider, endpoint: void 0, chatCompletionsUrl: void 0, local: void 0, request: void 0, native: void 0 } : {},
    ...endpoint && !provider ? {
      endpoint,
      provider: void 0,
      piOptions: void 0,
      native: void 0,
      chatCompletionsUrl: void 0,
      piPayload: void 0,
      piMode: void 0,
      modelOptions: void 0,
      local: void 0
    } : {},
    ...overrides.model ?? environment.NATLANG_MODEL ? { model: overrides.model ?? environment.NATLANG_MODEL } : {},
    ...environment.NATLANG_CONCURRENCY ? { concurrency: Number(environment.NATLANG_CONCURRENCY) } : {}
  };
  return { name: selected, configPath, profile, choice: resolveModelChoice(profile), nativeSources: config.nativeSources ?? {} };
}
function executorIdentityForChoice(choice) {
  const credential = /(?:api.?key|authorization|password|credential|secret|access.?token|refresh.?token)/i;
  const sanitize = (input) => {
    if (Array.isArray(input)) return input.map(sanitize);
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).filter(([key, value]) => value !== void 0 && key.toLowerCase() !== "headers" && !credential.test(key)).map(([key, value]) => {
      if (typeof value === "string" && /(?:endpoint|baseurl|url)$/i.test(key)) {
        try {
          const url = new URL(value);
          return [key, url.origin + url.pathname];
        } catch {
        }
      }
      return [key, sanitize(value)];
    }));
    return input;
  };
  const configuration = sanitize(choice);
  delete configuration.concurrency;
  delete configuration.batching;
  if (choice.kind === "external" && choice.managedNative) configuration.managedNative = { sha256: choice.managedNative.sha256 };
  const behaviorHeaders = Object.fromEntries(Object.entries(choice.headers ?? {}).filter(([key]) => !credential.test(key)));
  if (Object.keys(behaviorHeaders).length) configuration.headersHash = fingerprint(behaviorHeaders, "natlang.model-headers/v1");
  if (choice.kind === "external") {
    const url = new URL(choice.endpoint);
    configuration.endpoint = url.origin + url.pathname;
  }
  return { id: choice.kind + ":" + ("provider" in choice ? choice.provider + ":" : "") + choice.model, configuration };
}
function storedApiKey(name, environment = process.env) {
  const value = environment[name];
  if (value) return value;
  try {
    const credential = JSON.parse(readFileSync2(join2(
      defaultNatlangConfigDirectory(environment),
      "credentials",
      `${encodeURIComponent(`env:${name}`)}.json`
    ), "utf8"));
    return credential.type === "api_key" && credential.key ? credential.key : void 0;
  } catch {
    return void 0;
  }
}

// src/model/lora-scales.ts
function perRequestLora(loraIndex, server) {
  const active = activeNativeAdapters();
  if (!loraIndex.size) {
    if (active.length) throw new Error(`weights-unavailable: ${server} loaded no tuned adapters, but this call requests ${active.map((item) => item.id).join(", ")}`);
    return void 0;
  }
  const scales = /* @__PURE__ */ new Map();
  for (const { id, scale } of active) {
    const index = loraIndex.get(id);
    if (index === void 0) throw new Error(`weights-unavailable: adapter ${id} is not loaded by ${server}; rerun natlang tune or restart`);
    scales.set(index, (scales.get(index) ?? 0) + scale);
  }
  return { lora: [...loraIndex.values()].map((index) => ({ id: index, scale: scales.get(index) ?? 0 })) };
}

// src/model/local-server.ts
import { resolve as resolve5 } from "node:path";
import { randomUUID } from "node:crypto";

// src/model/openai-compatible.ts
function nativeStateMessages(messages, loaded) {
  return messages.map((message) => {
    const content = message?.content;
    if (typeof content !== "string" || !nativeStateSentinelIds(content).length) return message;
    return { ...message, content: runtimeTextToParts(content).map((part) => {
      if (part.type === "text") return { type: "text", text: part.text };
      if (!loaded.has(part.id)) throw new Error(`weights-unavailable: native state ${part.id} is not loaded by the model server; rerun natlang tune or restart`);
      return { type: "native_state", id: part.id };
    }) };
  });
}
var TUNED = /* @__PURE__ */ Symbol("natlang.tuned-request");
var isScheduler = (value) => typeof value?.transport === "function";
function openAICompatibleModelTurn(options) {
  const {
    toolAliases,
    request,
    onExchange,
    onRequestStart,
    concurrency,
    scoreEndpoint,
    scoreCoalesceMs,
    scoreAll: scoreAll2,
    tunedRequest,
    nativeStates,
    continuesReplies,
    ...http
  } = options;
  const scheduler = isScheduler(concurrency) ? concurrency : void 0;
  const limit = typeof concurrency === "number" ? requestLimit(concurrency) : scheduler ? void 0 : concurrency;
  const transport = (settings) => {
    const plain = httpChatTransport(settings);
    return scheduler ? scheduler.transport(plain) : limit ? limitedTransport(plain, limit) : plain;
  };
  let window;
  const single = promptLogprobDecider(transport({ ...http, stream: false }), {
    request,
    ...tunedRequest ? { extraFor: (item) => item[TUNED] } : {}
  });
  const url = scoreEndpoint === true || scoreEndpoint === "discover" ? openAIEndpointRoot(http.endpoint) + "/v1/natlang/score" : scoreEndpoint || void 0;
  const concurrent = concurrentScoreMany(single);
  const explicit = url ? explicitBatchScoreMany({
    url,
    headers: { ...http.apiKey ? { authorization: `Bearer ${http.apiKey}` } : {}, ...http.headers },
    extra: { model: http.model, ...request ? { request } : {} },
    scheduler,
    ...scoreEndpoint === "discover" ? { discovered: true } : {},
    ...scoreAll2 ? { minItems: 1, itemExtra: (item) => item[TUNED] } : {}
  }, concurrent) : concurrent;
  const many = (items) => !scoreAll2 && items.some((item) => item[TUNED]) ? concurrent(items) : explicit(items);
  const coalesced = coalescingScorer(
    Object.assign((...args) => single(...args), { scoreMany: many }),
    { windowMs: scoreCoalesceMs ?? 0 }
  );
  const withStates = (item) => {
    const loaded = nativeStates?.();
    return Array.isArray(item.messages) ? { ...item, messages: nativeStateMessages(item.messages, loaded ?? /* @__PURE__ */ new Set()) } : item;
  };
  const prepareDecision = (item) => {
    const tuned = tunedRequest?.();
    const states = withStates(item);
    return tuned ? Object.assign({ ...states }, { [TUNED]: tuned }) : states;
  };
  const decide = Object.assign(
    (item, signal) => coalesced(prepareDecision(item), signal),
    { scoreMany: (items, signal) => coalesced.scoreMany(items.map(prepareDecision), signal) }
  );
  const turns = transport(http);
  const tunedTurns = (body, signal, meta) => {
    const tuned = tunedRequest?.();
    const states = withStates(body);
    return turns(tuned ? { ...states, ...tuned } : states, signal, meta);
  };
  return Object.assign(
    chatCompletionModelTurn(tunedTurns, { toolAliases, request, onExchange, onRequestStart, continuesReplies }),
    { model: http.model, decide, contextWindow: () => window ??= serverContextWindow(http), ...continuesReplies ? { continuesReplies: true } : {} }
  );
}
var tokens = (value) => typeof value === "number" && Number.isInteger(value) && value > 0 ? value : void 0;
async function serverContextWindow(http) {
  if (!http.endpoint) return void 0;
  const base = openAIEndpointRoot(http.endpoint);
  const get = async (path) => {
    try {
      const response = await fetchModel(base + path, {
        signal: AbortSignal.timeout(5e3),
        headers: { ...http.apiKey ? { authorization: `Bearer ${http.apiKey}` } : {}, ...http.headers }
      });
      return response.ok ? await response.json() : void 0;
    } catch {
      return void 0;
    }
  };
  const listed = (await get("/v1/models"))?.data;
  const models = Array.isArray(listed) ? listed : [];
  const model = models.find((item) => item.id === http.model) ?? (models.length === 1 ? models[0] : void 0);
  const meta = model?.meta;
  const reported = tokens(model?.max_model_len) ?? tokens(model?.context_length) ?? tokens(model?.context_window);
  if (reported) return reported;
  const settings = (await get("/props"))?.default_generation_settings;
  return tokens(settings?.n_ctx) ?? tokens(meta?.n_ctx_train);
}

// src/model/scheduler.ts
var MAX_RECORDS = 4096;
var MAX_REMEMBERED_INVOCATIONS = 1e4;
function prefixKey(body) {
  const messages = body?.messages;
  if (!Array.isArray(messages)) return "";
  const first = messages[0];
  const content = typeof first?.content === "string" ? first.content : JSON.stringify(first?.content ?? "");
  let hash = 5381;
  for (let index = 0; index < content.length; index++) hash = (hash << 5) + hash + content.charCodeAt(index) | 0;
  return `${content.length}:${hash >>> 0}`;
}
function createScheduler(options = {}) {
  const mode = options.mode ?? "server-continuous";
  let maxConcurrent = options.maxConcurrent ?? Infinity;
  if (!(maxConcurrent >= 1)) throw new RangeError("a scheduler needs maxConcurrent of at least 1");
  const coalesceMs = options.coalesceMs ?? (mode === "explicit-batch" ? 2 : 0);
  const usePriority = options.priority ?? true, useAdjacency = options.adjacency ?? mode !== "serial";
  const now = options.now ?? (() => performance.now());
  const timers = options.timers ?? { set: (run, ms) => setTimeout(run, ms), clear: (handle) => clearTimeout(handle) };
  let active = 0, sequence = 0, batchCounter = 0, closed = false;
  const queue = [];
  const seen = /* @__PURE__ */ new Map();
  const records = [];
  let timer, flushing = false;
  const groupOrder = /* @__PURE__ */ new Map();
  const take = () => {
    if (!queue.length) return void 0;
    let best = 0;
    if (usePriority || useAdjacency) {
      for (let index = 1; index < queue.length; index++) {
        const a = queue[best], b = queue[index];
        if (usePriority && a.priority !== b.priority) {
          if (b.priority === "running") best = index;
          continue;
        }
        if (useAdjacency && a.group !== b.group) {
          const ga = groupOrder.get(a.group) ?? Infinity, gb = groupOrder.get(b.group) ?? Infinity;
          if (gb < ga) best = index;
        }
      }
    }
    return queue.splice(best, 1)[0];
  };
  const dispatch = () => {
    if (!queue.length || active >= maxConcurrent) return;
    const room = Math.min(queue.length, maxConcurrent - active);
    const batchId = `b${++batchCounter}`;
    const started = now();
    const batch = [];
    for (let index = 0; index < room; index++) {
      const next = take();
      if (next) batch.push(next);
    }
    for (const waiter of batch) {
      waiter.detach();
      active++;
      let held = true;
      const release = () => {
        if (!held) return;
        held = false;
        active--;
        afterRelease();
      };
      const info = {
        batch_id: batchId,
        batch_size: batch.length,
        in_flight: active,
        queue_wait_ms: Math.max(0, Math.round((started - waiter.enqueued) * 100) / 100),
        priority: waiter.priority
      };
      records.push(info);
      if (records.length > MAX_RECORDS) records.shift();
      try {
        waiter.meta.onScheduled?.(info);
      } catch {
      }
      waiter.grant(release);
    }
  };
  const schedule = () => {
    if (timer !== void 0 || flushing || !queue.length) return;
    if (active >= maxConcurrent) return;
    timer = timers.set(() => {
      timer = void 0;
      dispatch();
    }, coalesceMs);
  };
  const afterRelease = () => {
    flushing = true;
    try {
      if (timer !== void 0) {
        timers.clear(timer);
        timer = void 0;
      }
      dispatch();
    } finally {
      flushing = false;
    }
    schedule();
  };
  const remember = (id) => {
    const count = (seen.get(id) ?? 0) + 1;
    seen.delete(id);
    seen.set(id, count);
    if (seen.size > MAX_REMEMBERED_INVOCATIONS) seen.delete(seen.keys().next().value);
    return count;
  };
  const percentile = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : 0;
  const scheduler = {
    capabilities: { batching: { get mode() {
      return mode;
    }, get maxConcurrent() {
      return maxConcurrent;
    } } },
    acquire(meta = {}, signal) {
      if (closed) return Promise.reject(new Error("model scheduler is closed"));
      try {
        signal?.throwIfAborted();
      } catch (error) {
        return Promise.reject(error);
      }
      const turn = meta.invocation_id ? remember(meta.invocation_id) : 1;
      const priority = turn > 1 || (meta.retry ?? 0) > 0 || (meta.turn ?? 1) > 1 ? "running" : "new";
      const group = meta.group ?? "";
      if (!groupOrder.has(group)) {
        groupOrder.set(group, groupOrder.size);
        if (groupOrder.size > 1024) groupOrder.delete(groupOrder.keys().next().value);
      }
      return new Promise((grant, reject) => {
        const waiter = { meta, signal, enqueued: now(), priority, group, seq: sequence++, grant, reject, detach: () => {
        } };
        const abort = () => {
          const at = queue.indexOf(waiter);
          if (at >= 0) queue.splice(at, 1);
          reject(signal.reason);
        };
        waiter.detach = () => signal?.removeEventListener("abort", abort);
        signal?.addEventListener("abort", abort, { once: true });
        queue.push(waiter);
        schedule();
      });
    },
    transport(transport) {
      return async (body, signal, meta = {}) => {
        const release = await scheduler.acquire({ ...meta, group: meta.group ?? prefixKey(body) }, signal);
        let result;
        try {
          result = await transport(body, signal, meta);
        } catch (error) {
          release();
          throw error;
        }
        const stream = result;
        if (typeof stream[Symbol.asyncIterator] !== "function") {
          release();
          return result;
        }
        return (async function* () {
          try {
            yield* stream;
          } finally {
            release();
          }
        })();
      };
    },
    asRequestLimit() {
      return { get size() {
        return maxConcurrent;
      }, acquire: (signal) => scheduler.acquire({}, signal) };
    },
    setMaxConcurrent(size) {
      if (!(size >= 1)) throw new RangeError("a scheduler needs maxConcurrent of at least 1");
      maxConcurrent = size;
      schedule();
    },
    cancel(invocationId, reason = new Error("model request cancelled")) {
      let count = 0;
      for (let index = queue.length - 1; index >= 0; index--) {
        const waiter = queue[index];
        if (waiter.meta.invocation_id !== invocationId) continue;
        queue.splice(index, 1);
        waiter.detach();
        waiter.reject(reason);
        count++;
      }
      seen.delete(invocationId);
      return count;
    },
    close(reason = new Error("model scheduler is closed")) {
      closed = true;
      if (timer !== void 0) {
        timers.clear(timer);
        timer = void 0;
      }
      for (const waiter of queue.splice(0)) {
        waiter.detach();
        waiter.reject(reason);
      }
    },
    get queued() {
      return queue.length;
    },
    get inFlight() {
      return active;
    },
    occupancy() {
      const waits = records.map((item) => item.queue_wait_ms).sort((a, b) => a - b);
      const batches = new Set(records.map((item) => item.batch_id)).size;
      const sum = (values) => values.reduce((total, value) => total + value, 0);
      const count = records.length || 1;
      return {
        requests: records.length,
        batches,
        maxInFlight: Math.max(0, ...records.map((item) => item.in_flight)),
        meanInFlight: sum(records.map((item) => item.in_flight)) / count,
        meanBatchSize: sum(records.map((item) => item.batch_size)) / count,
        queueWaitMs: { mean: sum(waits) / count, p50: percentile(waits, 0.5), p95: percentile(waits, 0.95), max: waits.at(-1) ?? 0 },
        running: records.filter((item) => item.priority === "running").length,
        fresh: records.filter((item) => item.priority === "new").length
      };
    },
    records() {
      return records;
    }
  };
  return scheduler;
}
function schedulerForSettings(settings, fallback = {}) {
  const batching = settings.batching ?? {};
  return createScheduler({
    mode: batching.mode,
    coalesceMs: batching.coalesceMs,
    priority: batching.priority,
    maxConcurrent: batching.maxConcurrent ?? settings.concurrency ?? fallback.maxConcurrent
  });
}

// src/llama/models.ts
import { createReadStream as createReadStream2, createWriteStream as createWriteStream2, existsSync as existsSync4, mkdirSync as mkdirSync3, readdirSync as readdirSync3, readFileSync as readFileSync4, renameSync as renameSync3, rmSync as rmSync3, statSync as statSync2, writeFileSync as writeFileSync3 } from "node:fs";
import { createHash } from "node:crypto";
import { basename as basename3, dirname as dirname3, join as join4, resolve as resolve3 } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// src/llama/runtime.ts
import {
  accessSync,
  chmodSync,
  constants,
  cpSync,
  createReadStream,
  createWriteStream,
  existsSync as existsSync3,
  lstatSync,
  mkdirSync as mkdirSync2,
  mkdtempSync,
  readFileSync as readFileSync3,
  readdirSync as readdirSync2,
  renameSync as renameSync2,
  rmSync as rmSync2,
  writeFileSync as writeFileSync2
} from "node:fs";
import { basename as basename2, delimiter, dirname as dirname2, join as join3, relative, resolve as resolve2, sep } from "node:path";

// src/llama-runtime-release.ts
var LLAMA_RUNTIME_RELEASE = Object.freeze({
  "version": "0.8.0",
  "build": 12081,
  "commit": "cb03daee7",
  "compatible": {
    "minimumVersion": "0.8.0",
    "maximumVersionExclusive": "0.9.0",
    "minimumBuild": 12081
  },
  "artifacts": [
    {
      "key": "darwin-arm64-metal",
      "platform": "darwin",
      "arch": "arm64",
      "backend": "metal",
      "archive": "tar.gz",
      "url": "https://github.com/werg/llama.cpp-neuralese/releases/download/natlang-b12081/llama-natlang-bin-macos-arm64.tar.gz",
      "bytes": 11249957,
      "sha256": "0f0d9e73e772431415505bb816dbd4fe865afb4c591d1eda6f07579e34d348e5"
    },
    {
      "key": "darwin-x64-cpu",
      "platform": "darwin",
      "arch": "x64",
      "backend": "cpu",
      "archive": "tar.gz",
      "url": "https://github.com/werg/llama.cpp-neuralese/releases/download/natlang-b12081/llama-natlang-bin-macos-x64.tar.gz",
      "bytes": 10663665,
      "sha256": "f6f3f9e224f7c78a45b4f0404f1ddddd169fd83f6f811f0c3a78ea1f06f0457c"
    },
    {
      "key": "linux-arm64-cpu",
      "platform": "linux",
      "arch": "arm64",
      "backend": "cpu",
      "archive": "tar.gz",
      "url": "https://github.com/werg/llama.cpp-neuralese/releases/download/natlang-b12081/llama-natlang-bin-ubuntu-arm64.tar.gz",
      "bytes": 14995930,
      "sha256": "8bf19e2dd53eeddfdfdb2a33ac1482621bba1972e5c15fa037a1c1f14fbd0a6f"
    },
    {
      "key": "linux-x64-cpu",
      "platform": "linux",
      "arch": "x64",
      "backend": "cpu",
      "archive": "tar.gz",
      "url": "https://github.com/werg/llama.cpp-neuralese/releases/download/natlang-b12081/llama-natlang-bin-ubuntu-x64.tar.gz",
      "bytes": 19005423,
      "sha256": "389645a6cf2b7e1ee20154c40fecab31b1ae504758ee5e11e1b07d21ade215e1"
    },
    {
      "key": "win32-arm64-cpu",
      "platform": "win32",
      "arch": "arm64",
      "backend": "cpu",
      "archive": "zip",
      "url": "https://github.com/werg/llama.cpp-neuralese/releases/download/natlang-b12081/llama-natlang-bin-win-cpu-arm64.zip",
      "bytes": 10948077,
      "sha256": "21bda024f1460bcebf34cc24dee036767ab31e3a2fa3969caeeb97188108cefc"
    },
    {
      "key": "win32-x64-cpu",
      "platform": "win32",
      "arch": "x64",
      "backend": "cpu",
      "archive": "zip",
      "url": "https://github.com/werg/llama.cpp-neuralese/releases/download/natlang-b12081/llama-natlang-bin-win-cpu-x64.zip",
      "bytes": 17980814,
      "sha256": "5acda3346f708d708cb51d23f98ace73722ab6b926521776b82527ec7ca15057"
    }
  ]
});

// src/llama-fork-source.ts
var LLAMA_FORK_SOURCE = Object.freeze({
  repository: "werg/llama.cpp-neuralese",
  branch: "neuralese",
  commit: "cb03daee7b0e8792c714ebdf4d5e9dc714b89208"
});

// src/llama/runtime.ts
function semver(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}
function compare(left, right) {
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index] - right[index];
  return 0;
}
function isCompatibleLlamaVersion(version, build, release = LLAMA_RUNTIME_RELEASE) {
  const actual = semver(version), minimum = semver(release.compatible.minimumVersion), maximum = semver(release.compatible.maximumVersionExclusive);
  return Boolean(actual && minimum && maximum && compare(actual, minimum) >= 0 && compare(actual, maximum) < 0 && build >= release.compatible.minimumBuild);
}
function commandPath(command, environment) {
  if (command.includes("/") || command.includes("\\")) return existsSync3(resolve2(command)) ? resolve2(command) : null;
  const extensions = process.platform === "win32" ? (environment.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";") : [""];
  for (const directory of (environment.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = resolve2(directory, command + extension.toLowerCase());
      try {
        accessSync(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
        return candidate;
      } catch {
      }
    }
  }
  return null;
}
function inspectLlamaServer(host, path, source, release = LLAMA_RUNTIME_RELEASE) {
  const resolved = resolve2(path);
  if (!existsSync3(resolved)) return {
    path: resolved,
    source,
    compatible: false,
    version: null,
    build: null,
    commit: null,
    reason: "executable does not exist",
    output: ""
  };
  const result = host.processes.run(resolved, ["--version"], { env: host.environment, timeoutMs: 1e4 });
  const output = `${result.stdout}${result.stderr}`.trim();
  if (result.error || result.status !== 0) return {
    path: resolved,
    source,
    compatible: false,
    version: null,
    build: null,
    commit: null,
    reason: result.error?.message ?? `version probe exited ${result.status}`,
    output
  };
  const match = /version:\s*(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*\(build\s+(\d+),\s*commit\s+([0-9a-f]+)\)/i.exec(output);
  if (!match) return {
    path: resolved,
    source,
    compatible: false,
    version: null,
    build: null,
    commit: null,
    reason: "unrecognized llama-server version output",
    output
  };
  const version = match[1], build = Number(match[2]), commit = match[3];
  const compatible = source === "fork" ? commit.length >= 7 && LLAMA_FORK_SOURCE.commit.startsWith(commit) : isCompatibleLlamaVersion(version, build, release);
  if (source === "fork") return {
    path: resolved,
    source,
    compatible,
    version,
    build,
    commit,
    reason: compatible ? null : `a build of fork commit ${commit}, not the pinned ${LLAMA_FORK_SOURCE.commit.slice(0, 9)}; run natlang runtime build`,
    output
  };
  return {
    path: resolved,
    source,
    compatible,
    version,
    build,
    commit,
    reason: compatible ? null : `needs >=${release.compatible.minimumVersion} build ${release.compatible.minimumBuild} and <${release.compatible.maximumVersionExclusive}`,
    output
  };
}
function artifactForCurrentPlatform(release) {
  return release.artifacts.find((item) => item.platform === process.platform && item.arch === process.arch) ?? null;
}
function managedRecordPath(root, release, artifact) {
  return join3(root, "llama.cpp", `b${release.build}`, artifact.key, "runtime.json");
}
function managedExecutable(root, release, artifact) {
  const record = managedRecordPath(root, release, artifact);
  if (!existsSync3(record)) return null;
  try {
    const value = JSON.parse(readFileSync3(record, "utf8"));
    if (!value.executable) return null;
    const base = dirname2(record), path = resolve2(base, value.executable), child = relative(base, path);
    if (!child || child === ".." || child.startsWith(`..${sep}`) || resolve2(child) === child) return null;
    return existsSync3(path) ? path : null;
  } catch {
    return null;
  }
}
var forkDirectory = (root) => join3(root, "llama.cpp", `fork-${LLAMA_FORK_SOURCE.commit.slice(0, 12)}-${process.platform}-${process.arch}`);
function forkExecutable(root) {
  const executable = join3(forkDirectory(root), "bin", process.platform === "win32" ? "llama-server.exe" : "llama-server");
  return existsSync3(join3(forkDirectory(root), "runtime.json")) && existsSync3(executable) ? executable : null;
}
function discoverLlamaRuntime(host, release = LLAMA_RUNTIME_RELEASE) {
  const { environment } = host;
  const runtimeRoot = host.directories.runtime, artifact = artifactForCurrentPlatform(release);
  const candidates = [];
  if (environment.NATLANG_LLAMA_SERVER) {
    const explicit = commandPath(environment.NATLANG_LLAMA_SERVER, environment) ?? resolve2(environment.NATLANG_LLAMA_SERVER);
    const inspected = inspectLlamaServer(host, explicit, "explicit", release);
    candidates.push(inspected);
    const selected = inspected.compatible ? inspected : inspected.version ? {
      ...inspected,
      compatible: true,
      reason: `older than natlang's pinned llama.cpp ${release.version} (${inspected.reason}); used because it was chosen explicitly`
    } : null;
    return { selected, candidates, artifact, runtimeRoot };
  }
  const fork = forkExecutable(runtimeRoot);
  if (fork) candidates.push(inspectLlamaServer(host, fork, "fork", release));
  if (artifact) {
    const managed = managedExecutable(runtimeRoot, release, artifact);
    if (managed) candidates.push(inspectLlamaServer(host, managed, "managed", release));
  }
  const ambient = commandPath("llama-server", environment);
  if (ambient && !candidates.some((item) => item.path === ambient))
    candidates.push(inspectLlamaServer(host, ambient, "path", release));
  return { selected: candidates.find((item) => item.compatible) ?? null, candidates, artifact, runtimeRoot };
}
function describeLlamaRuntime(discovery) {
  if (discovery.selected) return `${discovery.selected.source} ${discovery.selected.path} (${discovery.selected.version}, build ${discovery.selected.build})`;
  const incompatible = discovery.candidates.map((item) => `${item.path}: ${item.reason}`).join("; ");
  return incompatible || `no llama-server found for ${process.platform}-${process.arch}`;
}

// src/llama/slots.ts
import { freemem } from "node:os";
var DEFAULT_KV_BYTES_PER_TOKEN = 65536;
var DEFAULT_MEMORY_FRACTION = 0.5;
var DEFAULT_MAX_SLOTS = 8;
var DEFAULT_KV_BUDGET_CAP_BYTES = 4 * 2 ** 30;
function planServerSlots(input) {
  const { local, modelBytes } = input, environment = input.environment ?? process.env;
  const contextPerSlot = local?.contextTokens ?? input.defaultContextTokens;
  const kvBytesPerToken = local?.kvBytesPerToken ?? (Number(environment.NATLANG_MODEL_KV_BYTES_PER_TOKEN) || input.defaultKvBytesPerToken || DEFAULT_KV_BYTES_PER_TOKEN);
  const envBudget = Number(environment.NATLANG_MODEL_MEMORY_BUDGET_MIB) || 0;
  const budgetMiB = local?.memoryBudgetMiB ?? (envBudget > 0 ? envBudget : void 0);
  const available = input.availableMemoryBytes ?? freemem();
  const explicit = budgetMiB !== void 0;
  const budgetBytes = explicit ? budgetMiB * 2 ** 20 : Math.min(Math.floor(available * DEFAULT_MEMORY_FRACTION), DEFAULT_KV_BUDGET_CAP_BYTES);
  if (local?.parallel !== void 0)
    return {
      budgetSource: "configured-parallel",
      slots: local.parallel,
      contextPerSlot,
      totalContext: contextPerSlot * local.parallel,
      source: "configured",
      budgetBytes: null,
      modelBytes,
      kvBytesPerToken,
      formula: "local.parallel"
    };
  const fit = Math.floor((budgetBytes - (explicit ? modelBytes : 0)) / (contextPerSlot * kvBytesPerToken));
  const slots = Math.max(1, Math.min(DEFAULT_MAX_SLOTS, Number.isFinite(fit) ? fit : 1));
  return {
    budgetSource: !explicit ? "default" : local?.memoryBudgetMiB !== void 0 ? "memoryBudgetMiB" : "NATLANG_MODEL_MEMORY_BUDGET_MIB",
    slots,
    contextPerSlot,
    totalContext: contextPerSlot * slots,
    source: "memory",
    budgetBytes,
    modelBytes,
    kvBytesPerToken,
    formula: `clamp(floor((${budgetBytes} - ${explicit ? modelBytes : 0}) / (${contextPerSlot} * ${kvBytesPerToken})), 1, ${DEFAULT_MAX_SLOTS}) = ${slots}`
  };
}

// src/llama/models.ts
function stockModelPath(host, release) {
  return join4(host.directories.models, `${release.sha256.slice(0, 12)}-${release.file}`);
}
function checkoutModelPath(host, release) {
  return host.directories.checkoutModels ? resolve3(host.directories.checkoutModels, release.file) : null;
}
function localModelPrerequisites(host, release = DEFAULT_LOCAL_MODEL) {
  const { environment } = host;
  const runtime = discoverLlamaRuntime(host), found = runtime.selected?.path ?? null;
  const explicitModel = environment.NATLANG_MODEL_PATH ? resolve3(environment.NATLANG_MODEL_PATH) : null;
  const checkoutModel = checkoutModelPath(host, release);
  const modelPath = (explicitModel ? [explicitModel] : [checkoutModel, stockModelPath(host, release)]).find((value) => Boolean(value && existsSync4(value))) ?? null;
  const template = templateCandidates(host, release).find(existsSync4) ?? null;
  const modelAvailable = Boolean(modelPath || !explicitModel && release.downloadUrl);
  const templateAvailable = Boolean(template || explicitModel && !environment.NATLANG_TEMPLATE);
  return {
    executable: found,
    available: Boolean(found && modelAvailable && templateAvailable),
    command: environment.NATLANG_LLAMA_SERVER ?? "llama-server",
    runtime,
    model: explicitModel ? basename3(explicitModel) : release.id,
    modelPath,
    template,
    downloadable: !explicitModel && Boolean(release.downloadUrl),
    downloadBytes: explicitModel ? null : release.bytes
  };
}
function localSlotPlan(host, local, modelPath = localModelPrerequisites(host).modelPath, release = DEFAULT_LOCAL_MODEL) {
  const modelBytes = modelPath && existsSync4(modelPath) ? statSync2(modelPath).size : release.bytes;
  const stock = !host.environment.NATLANG_MODEL_PATH;
  return planServerSlots({
    local,
    modelBytes,
    defaultContextTokens: release.contextTokens,
    environment: host.environment,
    ...stock ? { defaultKvBytesPerToken: release.kvBytesPerToken } : {}
  });
}
async function fileHash(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream2(path)) hash.update(chunk);
  return hash.digest("hex");
}
async function managedModelSha256(host, release = DEFAULT_LOCAL_MODEL) {
  const { environment } = host;
  if (!environment.NATLANG_MODEL_PATH) return release.sha256;
  const path = resolve3(environment.NATLANG_MODEL_PATH), stat = statSync2(path);
  const cache = join4(host.directories.modelHashes, createHash("sha256").update(path).digest("hex").slice(0, 24));
  const stamp = `${stat.size}:${stat.mtimeMs}`;
  try {
    const [seen, hash2] = readFileSync4(cache, "utf8").split("\n");
    if (seen === stamp && hash2 && /^[0-9a-f]{64}$/.test(hash2)) return hash2;
  } catch {
  }
  const hash = await fileHash(path);
  mkdirSync3(dirname3(cache), { recursive: true });
  writeFileSync3(cache, `${stamp}
${hash}`);
  return hash;
}
async function verifiedRelease(path, release) {
  if (!existsSync4(path)) return false;
  const stat = statSync2(path), stamp = `${path}.verified`, expected = `${stat.size}:${stat.mtimeMs}:${release.sha256}`;
  if (stat.size !== release.bytes) return false;
  try {
    if (readFileSync4(stamp, "utf8") === expected) return true;
  } catch {
  }
  if (await fileHash(path) !== release.sha256) return false;
  try {
    writeFileSync3(stamp, expected);
  } catch {
  }
  return true;
}
function stockModelDownload(host, release) {
  const destination = stockModelPath(host, release), prefix = `${basename3(destination)}.partial-`;
  let names;
  try {
    names = readdirSync3(dirname3(destination));
  } catch {
    return null;
  }
  for (const name of names) {
    const pid = name.startsWith(prefix) ? Number(name.slice(prefix.length)) : NaN;
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code !== "EPERM") continue;
    }
    try {
      return { received: statSync2(join4(dirname3(destination), name)).size, total: release.bytes, pid };
    } catch {
      continue;
    }
  }
  return null;
}
async function ensureStockModel(host, release, onProgress) {
  const { log } = host;
  const checkout = checkoutModelPath(host, release);
  if (checkout && await verifiedRelease(checkout, release)) return checkout;
  const destination = stockModelPath(host, release);
  if (await verifiedRelease(destination, release)) return destination;
  for (let other = stockModelDownload(host, release), announced = false; other; other = stockModelDownload(host, release)) {
    if (!announced) log.write(`natlang: waiting for the ${release.label} download already running in process ${other.pid}
`);
    announced = true;
    onProgress?.(other.received, other.total);
    await new Promise((wake) => setTimeout(wake, 1e3));
  }
  if (await verifiedRelease(destination, release)) return destination;
  mkdirSync3(dirname3(destination), { recursive: true });
  const temporary = `${destination}.partial-${process.pid}`;
  log.write(`natlang: downloading ${release.label} from ${release.source.repository} (${Math.ceil(release.bytes / 1e6)} MB, once)
`);
  try {
    const response = await host.fetch(release.downloadUrl, { redirect: "follow" });
    if (!response.ok || !response.body) throw new Error(`model download failed: HTTP ${response.status}`);
    let received = 0, reported = 0;
    const counted = async function* (body) {
      for await (const chunk of body) {
        received += chunk.length;
        onProgress?.(received, release.bytes);
        const terminal = log.isTTY === true;
        if (!onProgress && received - reported > (terminal ? 16e6 : release.bytes / 20)) {
          reported = received;
          const line = `natlang: downloaded ${Math.round(received / 1e6)} of ${Math.ceil(release.bytes / 1e6)} MB (${Math.floor(100 * received / release.bytes)}%)`;
          log.write(terminal ? `\r\x1B[2K${line}` : `${line}
`);
        }
        yield chunk;
      }
    };
    await pipeline(Readable.from(counted(response.body)), createWriteStream2(temporary, { flags: "wx" }));
    if (reported && log.isTTY === true) log.write("\r\x1B[2K");
    if (!await verifiedRelease(temporary, release)) throw new Error(`downloaded ${release.file} failed its size or SHA-256 check`);
    try {
      renameSync3(temporary, destination);
      renameSync3(`${temporary}.verified`, `${destination}.verified`);
    } catch (failure) {
      if (!await verifiedRelease(destination, release)) throw failure;
    }
    return destination;
  } finally {
    rmSync3(temporary, { force: true });
    rmSync3(`${temporary}.verified`, { force: true });
  }
}
async function ensureModel(host, release) {
  const { environment } = host;
  if (environment.NATLANG_MODEL_PATH) {
    const path = resolve3(environment.NATLANG_MODEL_PATH);
    if (!existsSync4(path)) throw new Error(`NATLANG_MODEL_PATH does not exist: ${path}`);
    return path;
  }
  return ensureStockModel(host, release);
}
function templateCandidates(host, release) {
  const { environment } = host;
  if (environment.NATLANG_TEMPLATE) return [resolve3(environment.NATLANG_TEMPLATE)];
  if (environment.NATLANG_MODEL_PATH) return [];
  return host.directories.templates.map((directory) => resolve3(directory, release.template));
}
function templatePath(host, release) {
  const candidates = templateCandidates(host, release);
  if (!candidates.length) return null;
  const selected = candidates.find(existsSync4);
  if (!selected) throw new Error(`missing the chat template ${candidates[0]} for ${host.environment.NATLANG_TEMPLATE ? "NATLANG_TEMPLATE" : release.id}`);
  return selected;
}
var runtimeLabel = (runtime) => runtime ? `b${runtime.build ?? "x"}${runtime.commit ? `g${runtime.commit.slice(0, 7)}` : ""}` : "bx";
var warmTag = (modelSha256, runtime, plan) => `${modelSha256.slice(0, 12)}-${runtime}-p${plan.slots}x${plan.contextPerSlot}`;

// src/llama/server.ts
import { basename as basename4 } from "node:path";
import { mkdirSync as mkdirSync4, readFileSync as readFileSync6, statSync as statSync4 } from "node:fs";
import { createHash as createHash3 } from "node:crypto";

// src/llama/warm.ts
import { createHash as createHash2 } from "node:crypto";
import { existsSync as existsSync5, readdirSync as readdirSync4, readFileSync as readFileSync5, rmSync as rmSync4, statSync as statSync3, utimesSync, writeFileSync as writeFileSync4 } from "node:fs";
import { join as join5 } from "node:path";

// src/llama/warm-opening.ts
function openingParts(request) {
  const system = request.messages[0];
  if (system?.role !== "system" || typeof system.content !== "string" || system.content.length < 256) return void 0;
  const tools = [...request.tools ?? []];
  return { system: { role: "system", content: system.content }, tools, text: JSON.stringify([system.content, tools]) };
}
function sharedPrefix(first, second) {
  let length = 0;
  while (length < first.length && length < second.length && first[length] === second[length]) length++;
  const common = first.slice(0, length);
  let cut = 0;
  for (const match of common.matchAll(/<\|[^|<>\s]{1,40}\|>|<\/?[a-z_]{2,24}>/g)) cut = match.index + match[0].length;
  return common.slice(0, cut);
}
var OPENING_PROBES = ["\u2063A", "\u2063B"];

// src/llama/warm.ts
function openingOf(request) {
  const parts = openingParts(request);
  return parts && { system: parts.system, tools: parts.tools, key: createHash2("sha256").update(parts.text).digest("hex") };
}
function baseOf(prefix) {
  const open = prefix.indexOf("<tools>\n"), close = prefix.lastIndexOf("\n</tools>");
  if (open < 0 || close < open) return void 0;
  const lastLine = prefix.lastIndexOf("\n", close - 1);
  return lastLine > open + "<tools>".length ? prefix.slice(0, lastLine + 1) : void 0;
}
async function post(host, endpoint, headers, path, body) {
  const response = await host.fetch(endpoint + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}
async function warmOpening(host, server, directory, opening, tag, slots) {
  const { endpoint, headers } = server;
  const file = `${opening.key.slice(0, 16)}-${tag}.slot`, path = join5(directory, file), meta = `${path}.json`;
  let created = false, info;
  const tokenize = async (content) => (await post(
    host,
    endpoint,
    headers,
    "/tokenize",
    { content, add_special: false, parse_special: true }
  )).tokens;
  try {
    if (existsSync5(path)) info = JSON.parse(readFileSync5(meta, "utf8"));
  } catch {
    info = void 0;
  }
  async function restoreOrSaveBase(text, tokens2) {
    if (!text) return void 0;
    const own = await tokenize(text);
    let shared = 0;
    while (shared < own.length && shared < tokens2.length && own[shared] === tokens2[shared]) shared++;
    const prefixTokens = tokens2.slice(0, Math.max(0, shared - 1));
    if (prefixTokens.length < 256 || prefixTokens.length >= tokens2.length) return void 0;
    const name = `${createHash2("sha256").update(JSON.stringify(prefixTokens)).digest("hex").slice(0, 16)}-${tag}.base.slot`;
    if (existsSync5(join5(directory, name))) {
      try {
        await post(host, endpoint, headers, "/slots/0?action=restore", { filename: name });
        const now = /* @__PURE__ */ new Date();
        try {
          utimesSync(join5(directory, name), now, now);
        } catch {
        }
        return name;
      } catch {
        await post(host, endpoint, headers, "/slots/0?action=erase", {}).catch(() => void 0);
        return void 0;
      }
    }
    await post(host, endpoint, headers, "/completion", { prompt: prefixTokens, n_predict: 0, cache_prompt: true, id_slot: 0 });
    await post(host, endpoint, headers, "/slots/0?action=save", { filename: name });
    return name;
  }
  let first = 0, base;
  if (!info) {
    const render = async (content) => String((await post(
      host,
      endpoint,
      headers,
      "/apply-template",
      { messages: [opening.system, { role: "user", content }], ...opening.tools.length ? { tools: opening.tools } : {} }
    )).prompt ?? "");
    const prefix = sharedPrefix(await render(OPENING_PROBES[0]), await render(OPENING_PROBES[1]));
    if (prefix.length < 256) return void 0;
    const tokens2 = await tokenize(prefix);
    await post(host, endpoint, headers, "/slots/0?action=erase", {}).catch(() => void 0);
    base = await restoreOrSaveBase(baseOf(prefix), tokens2);
    const completion = await post(host, endpoint, headers, "/completion", { prompt: tokens2, n_predict: 0, cache_prompt: true, id_slot: 0 });
    info = {
      chars: prefix.length,
      tokens: tokens2.length,
      prefilled: Number(completion.timings?.prompt_n ?? tokens2.length)
    };
    await post(host, endpoint, headers, "/slots/0?action=save", { filename: file });
    writeFileSync4(meta, JSON.stringify(info));
    created = true;
    first = 1;
  } else {
    const now = /* @__PURE__ */ new Date();
    try {
      utimesSync(path, now, now);
    } catch {
    }
  }
  let restored = first;
  for (let slot = first; slot < slots; slot++) {
    try {
      await post(host, endpoint, headers, `/slots/${slot}?action=restore`, { filename: file });
      restored++;
    } catch {
      break;
    }
  }
  return {
    sha256: opening.key,
    chars: info.chars,
    tokens: info.tokens,
    bytes: statSync3(path).size,
    file,
    restoredSlots: restored,
    created,
    ...created && info.prefilled !== void 0 ? { prefilled: info.prefilled } : {},
    ...base ? { base } : {}
  };
}
function pruneWarmStates(directory, keep = 24) {
  if (!existsSync5(directory)) return;
  const states = readdirSync4(directory).filter((name) => name.endsWith(".slot")).map((name) => ({ name, at: statSync3(join5(directory, name)).mtimeMs })).sort((a, b) => b.at - a.at);
  for (const state of states.slice(keep)) {
    rmSync4(join5(directory, state.name), { force: true });
    rmSync4(join5(directory, `${state.name}.json`), { force: true });
  }
}

// src/llama/server.ts
var serverHelp = /* @__PURE__ */ new Map();
function serverSupports(host, executable, option) {
  let help = serverHelp.get(executable);
  if (help === void 0) {
    const result = host.processes.run(executable, ["--help"], { timeoutMs: 2e4 });
    serverHelp.set(executable, help = `${result.stdout}${result.stderr}`);
  }
  return help.includes(option);
}
var supportsPerSequenceLora = (host, executable) => serverSupports(host, executable, "--lora-per-sequence");
var supportsNativeStates = (host, executable) => serverSupports(host, executable, "--native-state");
async function stopProcess(child) {
  if (child.hasExited()) return;
  child.kill("SIGTERM");
  let timer;
  await Promise.race([child.exited, new Promise((resolveTimeout) => {
    timer = setTimeout(resolveTimeout, 5e3);
  })]);
  if (timer) clearTimeout(timer);
  if (!child.hasExited()) child.kill("SIGKILL");
}
async function serverIdle(host, endpoint, headers) {
  const response = await host.fetch(endpoint + "/slots", headers ? { headers } : {});
  if (!response.ok) throw new Error(`the server's /slots listing answered HTTP ${response.status}`);
  const slots = await response.json();
  if (!Array.isArray(slots)) throw new Error("the server's /slots listing is not a list");
  return slots.every((slot) => !slot.is_processing);
}
function spawnLauncher(host) {
  return async (launch, signal) => {
    let recentError = "";
    const child = host.processes.spawn(launch.command, launch.args, {
      onStderr: (text) => {
        recentError = (recentError + text).slice(-16e3);
      },
      onError: (failure) => {
        recentError = `${recentError}
${failure.message}`.slice(-16e3);
      }
    });
    const terminate = (signalName) => {
      child.kill("SIGTERM");
      child.kill("SIGINT");
      process.removeListener(signalName, terminate);
      if (!process.listenerCount(signalName)) process.kill(process.pid, signalName);
    };
    const onExit = () => {
      if (!child.hasExited()) child.kill("SIGTERM");
    };
    process.prependOnceListener("SIGINT", terminate);
    process.prependOnceListener("SIGTERM", terminate);
    process.once("exit", onExit);
    const stop = async () => {
      process.removeListener("SIGINT", terminate);
      process.removeListener("SIGTERM", terminate);
      process.removeListener("exit", onExit);
      await stopProcess(child);
    };
    try {
      const deadline = Date.now() + Number(host.environment.NATLANG_MODEL_START_TIMEOUT_MS ?? 12e4);
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        if (child.hasExited()) throw new Error(`managed model server exited during startup
${recentError.trim()}`);
        try {
          const response = await host.fetch(launch.endpoint + "/health");
          if (response.ok) return { stop };
        } catch {
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 250));
      }
      throw new Error(`managed model server did not become ready within the startup timeout
${recentError.trim()}`);
    } catch (failure) {
      await stop();
      throw failure;
    }
  };
}
function createLlamaServer(host, options = {}) {
  const { environment, log } = host;
  const release = options.release ?? DEFAULT_LOCAL_MODEL, headers = options.headers;
  let prerequisites = localModelPrerequisites(host, release);
  let lease = null;
  let launched = null, endpoint = null, starting2 = null;
  const stopping = new AbortController();
  let closed = false, plan = null;
  const loraIndex = /* @__PURE__ */ new Map(), nativeStatesLoaded = /* @__PURE__ */ new Set();
  let warming = false, inflight = 0, contended = false, sharedServer = false, modelSha256 = null, runtime = null;
  const openings = /* @__PURE__ */ new Map(), warmed = [];
  const warmFor = async (request) => {
    const opening = openingOf(request);
    if (!opening) return;
    let pending = openings.get(opening.key);
    if (!pending) {
      if (inflight > 0) return;
      pending = (async () => {
        const base = await start2();
        if (!warming) return void 0;
        if (contended && !await serverIdle(host, base, headers)) {
          openings.delete(opening.key);
          log.write("natlang: prompt warming skipped: the server is serving other requests; a later idle moment retries\n");
          return void 0;
        }
        const sha = modelSha256 ?? await managedModelSha256(host, release);
        const state = await warmOpening(
          host,
          { endpoint: base, ...headers ? { headers } : {} },
          host.directories.warmPrefixes,
          opening,
          warmTag(sha, runtime ?? runtimeLabel(prerequisites.runtime.selected), plan),
          plan?.slots ?? 1
        );
        if (state) {
          warmed.push(state);
          log.write(state.created ? `natlang: prefilled the ${state.tokens}-token prompt opening once for this model${state.base && state.prefilled !== void 0 ? ` (${state.prefilled} new tokens on its saved shared base)` : ""}; later calls and runs restore it
` : `natlang: restored the warm ${state.tokens}-token prompt opening into ${state.restoredSlots} slot${state.restoredSlots === 1 ? "" : "s"}
`);
          pruneWarmStates(host.directories.warmPrefixes);
        }
        return state;
      })().catch((failure) => {
        log.write(`natlang: prompt warming skipped: ${failure.message.split("\n")[0].slice(0, 200)}
`);
        return void 0;
      });
      openings.set(opening.key, pending);
    }
    await pending;
  };
  const startServer = async () => {
    const { attach } = options;
    if (attach) {
      plan = {
        budgetSource: "configured-parallel",
        slots: attach.slots,
        contextPerSlot: attach.contextPerSlot,
        totalContext: attach.slots * attach.contextPerSlot,
        source: "configured",
        budgetBytes: null,
        modelBytes: 0,
        kvBytesPerToken: 0,
        formula: "server supervised by the host"
      };
      warming = environment.NATLANG_WARM_PREFIXES !== "off" && attach.warm === true;
      contended = true;
      modelSha256 = attach.modelSha256;
      runtime = attach.runtime;
      return attach.endpoint;
    }
    if (!prerequisites.executable && options.ensureRuntime) {
      const installed = await options.ensureRuntime(prerequisites.runtime);
      if (installed?.compatible) prerequisites = { ...localModelPrerequisites(host, release), executable: installed.path };
    }
    if (!prerequisites.executable) {
      const explicit = prerequisites.runtime.candidates.find((candidate) => candidate.source === "explicit");
      if (explicit) throw new Error(`NATLANG_LLAMA_SERVER is incompatible: ${describeLlamaRuntime(prerequisites.runtime)}`);
      throw new Error(`managed model server is unavailable: ${describeLlamaRuntime(prerequisites.runtime)}; run natlang setup --yes to install it, or select a hosted model with --provider ID`);
    }
    const modelFile = async () => {
      if (!environment.NATLANG_MODEL_PATH && !prerequisites.modelPath && !localModelPrerequisites(host, release).modelPath && !stockModelDownload(host, release) && !(options.ensureModel && await options.ensureModel(release)))
        throw new Error(`model-unavailable: the ${release.label} model (${Math.ceil(release.bytes / 1e6)} MB) is not downloaded; run natlang setup --yes to download it, or select a hosted model with --provider ID`);
      return ensureModel(host, release);
    };
    const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    const adapters = [...options.loraAdapters?.() ?? []].sort(byId), states = [...options.nativeStates?.() ?? []].sort(byId);
    const tuned = adapters.length > 0 || states.length > 0;
    const executable = prerequisites.executable;
    if (states.length && !supportsNativeStates(host, executable))
      throw new Error(`weights-unavailable: ${executable} cannot import native state spans (tuned soft states need the llama.cpp fork's --native-state)`);
    const warmAllowed = environment.NATLANG_WARM_PREFIXES !== "off" && !tuned;
    const kwargs = templateKwargs(release);
    const command = (modelPath2, port2, slotPlan) => {
      const template = templatePath(host, release);
      const args2 = [
        "-m",
        modelPath2,
        "--host",
        "127.0.0.1",
        "--port",
        String(port2),
        "--parallel",
        String(slotPlan.slots),
        "-c",
        String(slotPlan.totalContext),
        "-ngl",
        String(options.local?.gpuLayers ?? 99),
        "--cache-ram",
        String(options.local?.cacheRamMiB ?? 256),
        "--no-webui",
        "--jinja",
        ...template ? ["--chat-template-file", template] : [],
        ...kwargs ? ["--chat-template-kwargs", JSON.stringify(kwargs)] : [],
        // The stock file's sliding-window layers need the full cache for a warm opening or earlier prompt to be reused.
        ...release.fullSlidingWindowCache && !environment.NATLANG_MODEL_PATH ? ["--swa-full"] : [],
        ...options.local?.args ?? [],
        ...warmAllowed ? ["--slot-save-path", host.directories.warmPrefixes] : []
      ];
      if (adapters.length) args2.push("--lora-init-without-apply", ...supportsPerSequenceLora(host, executable) ? ["--lora-per-sequence"] : []);
      for (const adapter of adapters) args2.push("--lora", adapter.path);
      for (const state of states) args2.push("--native-state", state.path);
      return args2;
    };
    const loaded = () => {
      loraIndex.clear();
      nativeStatesLoaded.clear();
      for (const adapter of adapters) loraIndex.set(adapter.id, loraIndex.size);
      for (const state of states) nativeStatesLoaded.add(state.id);
    };
    if (!options.launch && options.useSharedServer !== false && sharingEnabled(environment)) {
      const sha = await managedModelSha256(host, release), label = runtimeLabel(prerequisites.runtime.selected);
      const template = templatePath(host, release);
      const local = options.local ?? {};
      const file = (item) => {
        try {
          const stat = statSync4(item.path);
          return [item.id, item.path, stat.size, stat.mtimeMs];
        } catch {
          return [item.id, item.path];
        }
      };
      const key = sharedServerKey({
        model: sha,
        runtime: label,
        template: template ? createHash3("sha256").update(readFileSync6(template)).digest("hex") : null,
        templateKwargs: kwargs,
        swaFull: !!release.fullSlidingWindowCache && !environment.NATLANG_MODEL_PATH,
        gpuLayers: local.gpuLayers ?? null,
        cacheRamMiB: local.cacheRamMiB ?? null,
        args: local.args ?? [],
        parallel: local.parallel ?? null,
        contextTokens: local.contextTokens ?? null,
        memoryBudgetMiB: local.memoryBudgetMiB ?? null,
        kvBytesPerToken: local.kvBytesPerToken ?? null,
        budgetEnv: environment.NATLANG_MODEL_MEMORY_BUDGET_MIB ?? null,
        warm: warmAllowed ? host.directories.warmPrefixes : null,
        adapters: adapters.map(file),
        states: states.map(file)
      });
      const startTimeoutMs = Number(environment.NATLANG_MODEL_START_TIMEOUT_MS ?? 12e4);
      const idleSeconds = tuned ? Math.min(30, sharedIdleSeconds(environment)) : sharedIdleSeconds(environment);
      const spec = async () => {
        const modelPath2 = await modelFile(), port2 = await host.processes.freePort();
        const slotPlan = localSlotPlan(host, options.local, modelPath2, release);
        if (warmAllowed) mkdirSync4(host.directories.warmPrefixes, { recursive: true });
        log.write(`natlang: starting managed model ${basename4(modelPath2)}${tuned ? ` with ${adapters.length} adapter${adapters.length === 1 ? "" : "s"} and ${states.length} native state${states.length === 1 ? "" : "s"}` : ""}, ${slotPlan.slots} slot${slotPlan.slots === 1 ? "" : "s"} (${slotPlan.contextPerSlot} tokens each), shared by natlang runs on this machine
`);
        return {
          command: executable,
          args: command(modelPath2, port2, slotPlan),
          endpoint: `http://127.0.0.1:${port2}`,
          directory: sharedServersDirectory(host),
          key,
          startTimeoutMs,
          record: {
            endpoint: `http://127.0.0.1:${port2}`,
            modelSha256: sha,
            runtimeBuild: prerequisites.runtime.selected?.build ?? null,
            runtime: label,
            slots: slotPlan.slots,
            contextPerSlot: slotPlan.contextPerSlot,
            model: basename4(modelPath2),
            warm: warmAllowed,
            idleSeconds,
            adapters: adapters.map((adapter) => adapter.id),
            states: states.map((state) => state.id)
          }
        };
      };
      const startedAt2 = Date.now();
      const leased = await acquireSharedServer(host, key, spec, { signal: stopping.signal });
      if (leased) {
        if (closed) {
          leased.release();
          throw new Error("model session is closed");
        }
        lease = leased.release;
        const shared = leased.server;
        plan = {
          budgetSource: "configured-parallel",
          slots: shared.slots,
          contextPerSlot: shared.contextPerSlot,
          totalContext: shared.slots * shared.contextPerSlot,
          source: "configured",
          budgetBytes: null,
          modelBytes: 0,
          kvBytesPerToken: 0,
          formula: `shared model server (pid ${shared.serverPid})`
        };
        contended = true;
        sharedServer = true;
        modelSha256 = sha;
        runtime = label;
        warming = warmAllowed && shared.warm;
        loaded();
        log.write(leased.started ? `natlang: model ready in ${((Date.now() - startedAt2) / 1e3).toFixed(1)} s at ${shared.endpoint}; it stops after ${shared.idleSeconds} s unused
` : `natlang: using the ${shared.model} model already loaded at ${shared.endpoint} (${shared.slots} slots)
`);
        return shared.endpoint;
      }
    }
    const modelPath = await modelFile();
    if (closed) throw new Error("model session is closed");
    const port = await host.processes.freePort();
    const base = `http://127.0.0.1:${port}`;
    plan = localSlotPlan(host, options.local, modelPath, release);
    warming = warmAllowed;
    if (warming) mkdirSync4(host.directories.warmPrefixes, { recursive: true });
    const args = command(modelPath, port, plan);
    loaded();
    log.write(`natlang: starting managed model ${basename4(modelPath)} with ${plan.slots} slot${plan.slots === 1 ? "" : "s"} (${plan.contextPerSlot} tokens each; ${plan.budgetSource === "configured-parallel" ? "local.parallel" : `${plan.budgetSource === "default" ? "default" : plan.budgetSource} KV budget ${Math.round((plan.budgetBytes ?? 0) / 2 ** 20)} MiB`})
`);
    stopping.signal.throwIfAborted();
    const startedAt = Date.now();
    launched = await (options.launch ?? spawnLauncher(host))({ command: executable, args, port, endpoint: base }, stopping.signal);
    log.write(`natlang: model ready in ${((Date.now() - startedAt) / 1e3).toFixed(1)} s
`);
    return base;
  };
  const start2 = async () => {
    if (closed) throw new Error("model session is closed");
    if (endpoint) return endpoint;
    if (starting2) return starting2;
    starting2 = startServer();
    try {
      return endpoint = await starting2;
    } finally {
      starting2 = null;
    }
  };
  return {
    start: start2,
    async admit(request, signal) {
      signal?.throwIfAborted();
      const base = await start2();
      signal?.throwIfAborted();
      await warmFor(request);
      signal?.throwIfAborted();
      inflight++;
      let released = false;
      return { endpoint: base, release() {
        if (!released) {
          released = true;
          inflight--;
        }
      } };
    },
    plan: () => plan,
    loraIndex,
    nativeStatesLoaded,
    status: () => ({
      endpoint,
      executable: prerequisites.executable,
      running: Boolean(launched || sharedServer || options.attach && endpoint),
      shared: sharedServer,
      runtimeBuild: prerequisites.runtime.selected?.build ?? null,
      runtime: runtime ?? (prerequisites.runtime.selected ? runtimeLabel(prerequisites.runtime.selected) : null),
      warm: [...warmed]
    }),
    async close() {
      closed = true;
      stopping.abort();
      if (starting2) await starting2.catch(() => void 0);
      await launched?.stop();
      lease?.();
      lease = null;
      launched = null;
      endpoint = null;
    }
  };
}
function templateKwargs(release) {
  const kwargs = release.request?.chat_template_kwargs;
  return kwargs && typeof kwargs === "object" && !Array.isArray(kwargs) && Object.keys(kwargs).length ? { ...kwargs } : null;
}

// src/llama/node.ts
import { spawn as spawn2, spawnSync as spawnSync2 } from "node:child_process";
import { closeSync, mkdirSync as mkdirSync5, openSync, rmSync as rmSync5, writeFileSync as writeFileSync5 } from "node:fs";
import { createServer } from "node:net";
import { homedir, platform } from "node:os";
import { join as join6, resolve as resolve4 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
function defaultNatlangRuntimeDirectory(environment = process.env) {
  if (environment.NATLANG_RUNTIME_HOME) return resolve4(environment.NATLANG_RUNTIME_HOME);
  if (platform() === "win32") return join6(environment.LOCALAPPDATA ?? homedir(), "natlang", "runtimes");
  if (platform() === "darwin") return join6(homedir(), "Library", "Application Support", "natlang", "runtimes");
  return join6(environment.XDG_DATA_HOME ?? join6(homedir(), ".local", "share"), "natlang", "runtimes");
}
var nodeLlamaProcesses = {
  spawn(command, args, options) {
    const child = spawn2(command, [...args], { stdio: ["ignore", "ignore", "pipe"], ...options.env ? { env: options.env } : {} });
    let failed = false;
    child.stderr?.on("data", (chunk) => options.onStderr?.(String(chunk)));
    const exited = new Promise((settle) => {
      child.once("exit", () => settle());
      child.once("error", (error) => {
        failed = true;
        options.onError?.(error);
        settle();
      });
    });
    return {
      pid: child.pid,
      exited,
      kill: (signal) => {
        child.kill(signal);
      },
      hasExited: () => failed || child.exitCode !== null || child.signalCode !== null
    };
  },
  run(command, args, options = {}) {
    const result = spawnSync2(command, [...args], {
      encoding: "utf8",
      ...options.cwd ? { cwd: options.cwd } : {},
      ...options.env ? { env: options.env } : {},
      ...options.timeoutMs ? { timeout: options.timeoutMs } : {},
      ...options.output === "host" ? { stdio: ["ignore", "inherit", "inherit"] } : {}
    });
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      ...result.error ? { error: result.error } : {}
    };
  },
  async freePort() {
    return await new Promise((resolvePort, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close();
          reject(new Error("could not allocate a local model port"));
          return;
        }
        server.close((error) => error ? reject(error) : resolvePort(address.port));
      });
    });
  }
};
function nodeLlamaDirectories(environment = process.env) {
  const cache = defaultNatlangCacheDirectory(environment);
  return {
    runtime: defaultNatlangRuntimeDirectory(environment),
    models: resolve4(cache, "models"),
    modelHashes: resolve4(cache, "model-hashes"),
    warmPrefixes: resolve4(cache, "warm-prefixes"),
    state: defaultNatlangStateDirectory(environment),
    checkoutModels: resolve4("models"),
    // A checkout's templates (the working directory's, then the repository's) and the package's own copies.
    templates: [
      resolve4("models", "templates"),
      fileURLToPath2(new URL("../../../models/templates", import.meta.url)),
      fileURLToPath2(new URL("../../model-assets", import.meta.url))
    ]
  };
}
function nodeLlamaHost(environment = process.env, log = process.stderr) {
  return {
    environment,
    directories: nodeLlamaDirectories(environment),
    processes: nodeLlamaProcesses,
    fetch: (input, init) => fetch(input, init),
    log,
    supervise(server) {
      mkdirSync5(server.directory, { recursive: true });
      const specPath = join6(server.directory, `${server.key}.spec.${process.pid}.json`);
      writeFileSync5(specPath, JSON.stringify(server));
      const output = openSync(join6(server.directory, `${server.key}.supervisor.log`), "a");
      const child = spawn2(
        process.execPath,
        [fileURLToPath2(new URL("./supervisor.js", import.meta.url)), specPath],
        { detached: true, stdio: ["ignore", output, output], env: environment }
      );
      closeSync(output);
      child.once("exit", () => rmSync5(specPath, { force: true }));
      child.unref();
      return child.pid ?? 0;
    }
  };
}

// src/model/local-server.ts
var localModelPrerequisites2 = (environment = process.env, release = DEFAULT_LOCAL_MODEL) => localModelPrerequisites(nodeLlamaHost(environment), release);
function profileEnvironment(choice, environment = process.env) {
  const profileModel = choice.kind === "managed-local" ? choice.local : void 0;
  if (profileModel?.modelPath && !environment.NATLANG_MODEL_PATH) environment = {
    ...environment,
    NATLANG_MODEL_PATH: profileModel.modelPath,
    ...profileModel.template && !environment.NATLANG_TEMPLATE ? { NATLANG_TEMPLATE: profileModel.template } : {}
  };
  if (profileModel?.server && !environment.NATLANG_LLAMA_SERVER) environment = { ...environment, NATLANG_LLAMA_SERVER: profileModel.server };
  return environment;
}
function createResolvedModelSession(choice, environment = process.env, error = process.stderr, runtimeOptions = {}) {
  environment = profileEnvironment(choice, environment);
  const external = choice.kind === "external" ? choice : null;
  const managed = choice.kind === "managed-local" ? choice : null;
  let pi = null;
  const piBackend = () => {
    if (choice.kind !== "pi-provider") throw new Error("Pi backend requires a Pi provider choice");
    return pi ??= import("./chunk-pi-provider-BXLZD4CZ.js").then((module) => module.createPiModelBackend(
      choice.provider,
      choice.model,
      environment,
      choice.apiKeyEnv,
      choice.headers,
      choice.piOptions,
      choice.modelOptions,
      choice.piMode,
      choice.piPayload
    ));
  };
  let closed = false;
  const release = managed?.release ?? DEFAULT_LOCAL_MODEL;
  const llama = managed ? createLlamaServer(nodeLlamaHost(environment, error), {
    release,
    local: managed.local,
    ...runtimeOptions.ensureRuntime ? { ensureRuntime: runtimeOptions.ensureRuntime } : {},
    ...runtimeOptions.ensureModel ? { ensureModel: runtimeOptions.ensureModel } : {},
    ...runtimeOptions.loraAdapters ? { loraAdapters: runtimeOptions.loraAdapters } : {},
    ...runtimeOptions.nativeStates ? { nativeStates: runtimeOptions.nativeStates } : {}
  }) : null;
  const scheduler = choice.kind === "pi-provider" ? void 0 : schedulerForSettings(choice);
  const tunedRequest = () => perRequestLora(llama.loraIndex, "the managed model server");
  let native;
  const nativeDriver = () => native ??= neuraleseServerModelTurn({
    endpoint: external.endpoint,
    model: external.model,
    headers: external.headers,
    apiKey: storedApiKey(external.apiKeyEnv, environment),
    owner: randomUUID(),
    request: runtimeOptions.rlCapture ? {
      ...external.request,
      x_natlang_rl_capture: true,
      ...runtimeOptions.rlTopK !== void 0 ? { x_natlang_rl_top_k: runtimeOptions.rlTopK } : {}
    } : external.request
  });
  const external_score = choice.kind === "external" && choice.batching?.scoreEndpoint === void 0;
  const openai = (options) => openAICompatibleModelTurn({
    ...options,
    concurrency: scheduler,
    scoreEndpoint: choice.kind === "pi-provider" ? void 0 : choice.batching?.scoreEndpoint ?? (choice.kind === "managed-local" || (external_score ? "discover" : void 0)),
    ...choice.kind === "managed-local" ? { scoreAll: true, continuesReplies: true } : external_score ? { scoreAll: true } : {},
    ...choice.kind === "managed-local" ? { tunedRequest, nativeStates: () => llama.nativeStatesLoaded } : {}
  });
  const drivers = /* @__PURE__ */ new Map();
  const driver = (options) => {
    const key = `${options.endpoint}
${options.model}`;
    let built = drivers.get(key);
    if (!built) drivers.set(key, built = external?.neuraleseServer ? Object.assign(
      nativeDriver(),
      { contextWindow: () => serverContextWindow(options) }
    ) : openai(options));
    return built;
  };
  let unscored = null, sized = false;
  const start2 = async () => {
    if (closed) throw new Error("model session is closed");
    if (external?.managedNative) await ensureNativeServer(external.managedNative, environment, error);
    if (external) return {
      endpoint: external.endpoint,
      chatCompletionsUrl: external.chatCompletionsUrl,
      model: external.model,
      headers: external.headers,
      request: external.request,
      apiKey: storedApiKey(external.apiKeyEnv, environment)
    };
    const endpoint = await llama.start();
    if (!sized) {
      sized = true;
      if (scheduler && managed.batching?.maxConcurrent === void 0 && managed.concurrency === void 0) scheduler.setMaxConcurrent(llama.plan().slots);
    }
    return {
      endpoint,
      model: environment.NATLANG_MODEL ?? choice.model,
      headers: choice.headers,
      request: { cache_prompt: true, ...managed.request }
    };
  };
  let window;
  return {
    async prepare() {
      if (choice.kind === "pi-provider") await (await piBackend()).prepare();
      else await start2();
      return this.status();
    },
    async turn(request, signal, turnOptions) {
      signal?.throwIfAborted();
      if (choice.kind === "pi-provider") return (await piBackend()).turn(request, signal, turnOptions);
      const options = await start2();
      signal?.throwIfAborted();
      const admitted = llama ? await llama.admit(request, signal) : void 0;
      try {
        return await (turnOptions?.onDelta ? driver(options)(request, signal, { onDelta: turnOptions.onDelta }) : driver(options)(request, signal));
      } finally {
        admitted?.release();
      }
    },
    ...llama ? { async warm(request) {
      await start2();
      (await llama.admit(request)).release();
      return llama.status().warm;
    } } : {},
    async decide(request, signal) {
      signal?.throwIfAborted();
      if (choice.kind === "pi-provider") throw new Error("decision-unsupported: Pi provider backends cannot score replies");
      if (unscored) throw new Error(unscored);
      const options = await start2();
      try {
        return await autoFramedScores(request, decisionReplySetting(choice.decisionReply), (items) => scoreAll(driver(options).decide, items, signal));
      } catch (error2) {
        if (String(error2?.message).startsWith("decision-unsupported")) unscored = error2.message;
        throw error2;
      }
    },
    contextWindow() {
      if (choice.kind === "pi-provider") return Promise.resolve(void 0);
      return window ??= start2().then((options) => driver(options).contextWindow(), () => void 0);
    },
    status() {
      if (choice.kind === "pi-provider") return {
        source: "pi-provider",
        endpoint: null,
        model: `${choice.provider}/${choice.model}`,
        executable: null,
        modelPath: null,
        running: false
      };
      if (external) return {
        source: "external",
        endpoint: external.endpoint,
        model: external.model,
        executable: null,
        modelPath: null,
        running: false
      };
      const server = llama.status();
      return {
        source: "managed-local",
        endpoint: server.endpoint,
        model: environment.NATLANG_MODEL ?? choice.model,
        executable: server.executable,
        modelPath: environment.NATLANG_MODEL_PATH ? resolve5(environment.NATLANG_MODEL_PATH) : null,
        running: server.running,
        ...environment.NATLANG_MODEL_PATH ? {} : { release },
        runtimeBuild: server.runtimeBuild,
        runtime: server.runtime,
        warm: server.warm,
        ...server.shared ? { shared: true } : {}
      };
    },
    scheduler,
    /** The native reference server's artifact store (uploads of tuned artifacts and states), when this is one. */
    nativeArtifacts() {
      return external?.neuraleseServer ? nativeDriver().artifacts : void 0;
    },
    neuralese: !!external?.neuraleseServer,
    guidance: !!external?.neuraleseServer || choice.kind === "managed-local",
    continuesReplies: choice.kind === "managed-local",
    // A Pi provider never scores replies: its driver carries no decision scorer, so a readout generates its value
    // without first sampling reasoning for a score that cannot come, and refinement judges run as ordinary calls.
    scoresReplies: choice.kind !== "pi-provider",
    async neuraleseRuntime() {
      if (!external?.neuraleseServer) return void 0;
      await start2();
      return nativeDriver().neuraleseRuntime();
    },
    slotPlan() {
      return llama?.plan() ?? null;
    },
    async close() {
      closed = true;
      scheduler?.close();
      if (pi) await pi.then((backend) => backend.close(), () => void 0);
      await llama?.close();
      if (external?.managedNative) await stopNativeServer(external.endpoint);
    }
  };
}

// src/model/driver.ts
function sessionDriver(session) {
  return Object.assign(
    (request, signal, options) => session.turn(request, signal, options),
    {
      ...session.scoresReplies === false ? {} : { decide: (request, signal) => session.decide(request, signal) },
      contextWindow: () => session.contextWindow(),
      ...session.guidance ? { guidance: true } : {},
      ...session.continuesReplies ? { continuesReplies: true } : {},
      ...session.neuralese ? { neuralese: true, neuraleseRuntime: () => session.neuraleseRuntime() } : {}
    }
  );
}

// src/improvement/evidence.ts
var EvidenceView = class {
  items;
  constructor(items) {
    this.items = structuredClone(items);
    Object.defineProperty(this, "items", { enumerable: false });
  }
  get length() {
    return this.items.length;
  }
  page(start2 = 0, limit = 20) {
    if (!Number.isSafeInteger(start2) || start2 < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new RangeError("evidence page requires start >= 0 and limit 1..200");
    return structuredClone(this.items.slice(start2, start2 + limit));
  }
};

export {
  validateMetrics,
  summarize,
  EvaluationInfrastructureError,
  preflightEvaluation,
  candidateArtifact,
  evaluate,
  FixtureObservationStore,
  WEIGHTS_SCHEMA,
  WeightManifestError,
  manifestDigest,
  sealManifest,
  validateManifest,
  parseManifest,
  EvidenceView,
  loadModelConfiguration,
  executorIdentityForChoice,
  localModelPrerequisites2 as localModelPrerequisites,
  createResolvedModelSession,
  sessionDriver
};
