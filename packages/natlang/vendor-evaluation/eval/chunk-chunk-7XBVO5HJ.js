import {
  SOURCE_EVALUATION_VERSION,
  SourceEvaluator,
  sourceFiles
} from "./chunk-chunk-IEOFNLU4.js";
import {
  AUTHORED_IMPROVER
} from "./chunk-chunk-4S4AEQC2.js";
import {
  createNatlangRuntime,
  loadVirtualCallables
} from "./chunk-chunk-V5SNWGZ5.js";
import {
  BudgetExhausted,
  IterationDivergedError,
  IterationLimitError,
  NATLANG_COMPILE_VERSION,
  SYSTEM_PROMPT,
  UsageGateway,
  fingerprint,
  isModelOutcomeFailure
} from "./chunk-chunk-7RHMLU3S.js";

// src/improvement/program.ts
import YAML from "yaml";

// src/improvement/operations.ts
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, openSync, closeSync, unlinkSync } from "node:fs";
import { join } from "node:path";
var OperationJournal = class {
  constructor(directory) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true });
  }
  directory;
  read(key) {
    const path = join(this.directory, fingerprint(key) + ".json");
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : void 0;
  }
  record(key, value) {
    this.write(key, { status: "done", value });
  }
  checkpoint() {
    const path = join(this.directory, "checkpoint.json");
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : void 0;
  }
  write(key, value) {
    const path = join(this.directory, fingerprint(key) + ".json"), temp = path + "." + process.pid + ".tmp";
    writeFileSync(temp, JSON.stringify(value));
    renameSync(temp, path);
  }
  acquire(lock) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const descriptor = openSync(lock, "wx");
        writeFileSync(descriptor, String(process.pid));
        return descriptor;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        const owner = Number(readFileSync(lock, "utf8"));
        if (!Number.isSafeInteger(owner) || owner < 1) throw new Error("operation lock has no recoverable owner: " + lock);
        try {
          process.kill(owner, 0);
        } catch (probe) {
          if (probe.code === "ESRCH") {
            unlinkSync(lock);
            continue;
          }
          throw probe;
        }
        throw new Error("operation already in flight: " + lock);
      }
    }
    throw new Error("could not acquire operation lock: " + lock);
  }
  async run(key, operation, reconcile) {
    const cached = this.read(key);
    if (cached?.status === "done") return cached.value;
    const lock = join(this.directory, fingerprint(key) + ".lock");
    const descriptor = this.acquire(lock);
    try {
      const previous = this.read(key);
      if (previous?.status === "done") return previous.value;
      if (previous?.status === "pending" && !reconcile) throw new Error("pending external operation needs reconciliation: " + key);
      this.write(key, { status: "pending" });
      const value = await (previous?.status === "pending" ? reconcile() : operation());
      this.write(key, { status: "done", value });
      return value;
    } finally {
      closeSync(descriptor);
      unlinkSync(lock);
    }
  }
  commit(expectedRevision, value) {
    const path = join(this.directory, "checkpoint.json"), lock = path + ".lock";
    const descriptor = this.acquire(lock);
    try {
      const previous = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { revision: 0 };
      if (previous.revision !== expectedRevision) throw new Error("stale checkpoint revision");
      const revision = expectedRevision + 1, temp = path + ".tmp";
      writeFileSync(temp, JSON.stringify({ revision, value }));
      renameSync(temp, path);
      return revision;
    } finally {
      closeSync(descriptor);
      unlinkSync(lock);
    }
  }
};

// src/improvement/services.ts
function planService(journal) {
  const memory = /* @__PURE__ */ new Map();
  return {
    recall: async (iteration) => journal ? journal.read("plan:" + iteration)?.value ?? null : memory.get(iteration) ?? null,
    record: async (iteration, plan) => {
      if (journal) journal.record("plan:" + iteration, plan);
      else memory.set(iteration, plan);
    }
  };
}

// src/improvement/program.ts
var InvalidImprovementState = class extends Error {
};
function exactStageCapture(authored) {
  const sources = Object.keys(authored).filter((path) => path.endsWith(".nl") && path.includes("/"));
  const names = /* @__PURE__ */ new Set();
  for (const path of sources) {
    const header = /^---\n([\s\S]*?)\n---/.exec(authored[path])?.[1] ?? "";
    const args = /^args:\n((?:[ ]{2}.*\n?)*)/m.exec(header)?.[1] ?? "";
    for (const match of args.matchAll(/^ {2}([A-Za-z_$][\w$]*)\??:/gm)) names.add(match[1]);
  }
  return { definitionSources: sources, inputArguments: [...names], captureOutput: true, maxBytes: 8e6 };
}
async function improveProgram(options) {
  if (!Number.isSafeInteger(options.policy.maxExperiments) || options.policy.maxExperiments < 1 || !Number.isSafeInteger(options.policy.maxPopulation) || options.policy.maxPopulation < 2) throw new RangeError("finite experiment and population limits are required");
  if (options.executorTimeoutMs !== void 0 && (!Number.isSafeInteger(options.executorTimeoutMs) || options.executorTimeoutMs < 1)) throw new RangeError("positive finite executor timeout required");
  if (options.policy.objective !== void 0 && !["quality", "source-size", "model-calls"].includes(options.policy.objective)) throw new RangeError("unknown improvement objective");
  const authored = options.improverSource ? sourceFiles(options.improverSource) : AUTHORED_IMPROVER;
  const lifecycle = loadVirtualCallables(authored).improveStep?.lifecycle;
  if (typeof lifecycle?.step !== "function") throw new TypeError("the authored program-improver has no improveStep/lifecycle.ts step");
  const journal = options.directory ? new OperationJournal(options.directory) : void 0;
  const identity = fingerprint({ runtime: 6, compiler: NATLANG_COMPILE_VERSION, evaluation: SOURCE_EVALUATION_VERSION, authored, opening: { prompt: SYSTEM_PROMPT, tools: "native-default", contextTokens: 16384, limits: { maxTurns: 16, maxTokens: 24e3, turnTokens: 2048, maxFailureRepairs: 4, maxRequests: options.budget.maxModelCalls } }, seed: options.seed ?? 0, source: options.folder.snapshot().digest, contract: options.contract, cases: options.cases, policy: options.policy, transformation: options.transformation ?? null, executor: options.executorId, executorTimeoutMs: options.executorTimeoutMs ?? 12e4, excludeModelWaitFromTimeout: options.excludeModelWaitFromTimeout ?? false, metadataOnlySkillFiles: options.metadataOnlySkillFiles ?? null, execution: options.executeCase?.identity ?? null, scoring: options.scoring?.identity ?? null, evaluationLevel: options.evaluationLevel ?? 1, budget: options.budget });
  const savedIdentity = journal?.read("run-identity")?.value;
  if (savedIdentity && savedIdentity !== identity) throw new Error("resume requires the same frozen source, cases, policy, executor and allocation");
  journal?.record("run-identity", identity);
  if (options.gateway && fingerprint(options.gateway.limits) !== fingerprint(options.budget)) throw new Error("nested improvement must use the parent allocation");
  const gateway = options.gateway ?? new UsageGateway(options.budget, journal?.read("ledger")?.value);
  if (journal && !options.gateway) gateway.onUpdate = (ledger) => journal.record("ledger", ledger);
  const evaluator = new SourceEvaluator(options.contract, options.cases, options.executor, gateway, { signal: options.signal, timeoutMs: options.executorTimeoutMs, excludeModelWaitFromTimeout: options.excludeModelWaitFromTimeout, executorId: options.executorId, journal, executeCase: options.executeCase, scoring: options.scoring, evaluationLevel: options.evaluationLevel ?? 1, sourcePolicy: { baseline: sourceFiles(options.folder.snapshot()), mode: options.policy.mode, allowedFiles: options.policy.allowedFiles, metadataOnlySkillFiles: options.metadataOnlySkillFiles } });
  const baselineSource = options.folder.snapshot();
  const restore = (id) => {
    try {
      return options.folder.at(id);
    } catch (error) {
      const files2 = journal?.read("source:" + id)?.value;
      if (!files2) throw error;
      const branch = baselineSource.branch();
      for (const path of branch.filePaths()) if (!(path in files2)) branch.remove(path);
      for (const [path, text] of Object.entries(files2)) branch.writeText(path, text);
      const snapshot = branch.snapshot();
      if (snapshot.digest !== id) throw Error("stored source digest mismatch");
      return snapshot;
    }
  };
  journal?.record("source:" + baselineSource.digest, sourceFiles(baselineSource));
  const evaluate = (folder, request) => {
    const seed = options.seed ?? 0;
    if (request.seed !== void 0 && request.seed !== seed) throw new Error("evaluation seed is pinned by the improvement invocation: " + seed);
    return evaluator.evaluate(folder, { ...request, seed });
  };
  const task = createNatlangRuntime({
    model: { driver: gateway.driver(options.improver, "reflection", options.signal), maxTurns: 16, maxTokens: 24e3, turnTokens: 2048, maxFailureRepairs: 4 },
    signal: options.signal,
    seed: { mode: "derived", root: options.seed ?? 0 },
    codeEdits: "deny",
    network: false,
    exactHostTraceCapture: options.captureExactRewriteIO ? exactStageCapture(authored) : void 0,
    trace: options.trace,
    onFolderProposal: () => gateway.reserve("proposals", 1, options.signal),
    limits: { maxEpisodes: options.budget.maxModelCalls, timeoutMs: options.budget.maxElapsedMs }
  });
  const stepEvaluator = { check: evaluator.check.bind(evaluator), evaluate, page: evaluator.page.bind(evaluator) };
  const plans = planService(journal);
  const step = (folder, state, policy) => lifecycle.step(folder, stepEvaluator, plans, state, policy);
  const initial = { iteration: 0, done: false, incumbent: baselineSource.digest, quality: 0, population: [], history: [], stopReason: "" };
  const checkpoint = journal?.checkpoint();
  let revision = checkpoint?.revision ?? 0;
  for (const member of checkpoint?.value.state.population ?? []) restore(member.source);
  const startingFolder = checkpoint ? restore(checkpoint.value.source).branch() : options.folder;
  let lastValid = { folder: startingFolder.snapshot(), state: checkpoint?.value.state ?? initial };
  let result;
  try {
    result = await task.run(() => startingFolder.iterateOn(step, checkpoint?.value.state ?? initial, { ...options.policy, seed: options.seed ?? 0 }).withMeasure((state) => options.policy.maxExperiments - state.iteration).withSiteId("program-improver/v1").onStep(async (event) => {
      if (event.kind !== "step" || !event.state) return;
      const next = event.state;
      if (next.state.iteration !== lastValid.state.iteration + 1) throw new InvalidImprovementState("an experiment must advance iteration exactly once");
      if (next.state.incumbent !== next.folder.digest) throw new InvalidImprovementState("selected state does not match committed source");
      if (next.folder.digest !== baselineSource.digest) {
        const checked = await evaluator.check(next.folder);
        if (!checked.valid) throw new InvalidImprovementState("selected source failed compilation or edit policy: " + checked.diagnostics.join("\n"));
      }
      const measured2 = await evaluate(next.folder, { split: "validation" });
      if (!Number.isFinite(next.state.quality) || Math.abs(measured2.quality - next.state.quality) > 1e-12) throw new InvalidImprovementState("reported quality " + JSON.stringify(next.state.quality) + " does not match independently executed selected source quality " + measured2.quality + "; copy the host validation report quality instead of estimating it");
      for (const member of next.state.population) {
        const memberSource = next.folder.at(member.source);
        const report = await evaluate(memberSource, { split: "validation" });
        if (!Number.isFinite(member.quality) || Math.abs(member.quality - report.quality) > 1e-12) throw new InvalidImprovementState("population quality does not match independent measurement");
        const calls = member.modelCalls;
        if (calls !== void 0 && calls !== report.modelCalls) throw new InvalidImprovementState("population request count does not match independent measurement");
      }
      if (journal) {
        journal.record("source:" + event.state.folder.digest, sourceFiles(event.state.folder));
        for (const member of event.state.state.population) journal.record("source:" + member.source, sourceFiles(event.state.folder.at(member.source)));
        revision = journal.commit(revision, { source: event.state.folder.digest, state: event.state.state });
      }
      lastValid = next;
    }).until((state) => state.done || options.singleStep === true));
  } catch (error) {
    const committed = journal?.checkpoint()?.value;
    const folder = committed ? restore(committed.source) : lastValid.folder;
    const state = committed?.state ?? lastValid.state;
    const budgetExhausted = (value, depth = 0) => value instanceof BudgetExhausted || depth < 8 && value instanceof Error && budgetExhausted(value.cause, depth + 1);
    const interrupted = options.signal?.aborted || error instanceof IterationLimitError || budgetExhausted(error) || gateway.ledger.usage.modelCalls >= options.budget.maxModelCalls;
    const boundName = (value) => value?.name === "PolicyBoundError";
    const semanticFailure = isModelOutcomeFailure(error) || error instanceof Error && (isModelOutcomeFailure(error.cause) || boundName(error.cause)) || boundName(error);
    const files2 = sourceFiles(folder), baseFiles = sourceFiles(baselineSource);
    const sourceDiff2 = [.../* @__PURE__ */ new Set([...Object.keys(baseFiles), ...Object.keys(files2)])].sort().filter((path) => baseFiles[path] !== files2[path]).map((path) => ({ path, kind: baseFiles[path] === void 0 ? "added" : files2[path] === void 0 ? "deleted" : "modified" }));
    return {
      folder,
      state,
      disposition: interrupted ? "interrupted" : error instanceof IterationDivergedError || error instanceof InvalidImprovementState || semanticFailure ? "incomplete-search" : "infrastructure-failure",
      error: String(error),
      sourceDiff: sourceDiff2,
      baseline: null,
      validation: null,
      sourceManifest: { schema: "natlang.program-source/1", source: folder.digest, base: baselineSource.digest, contract: options.contract, files: files2, baseFiles },
      authored: { identity: fingerprint(authored), files: authored },
      ledger: gateway.snapshot(),
      evaluator
    };
  }
  if (result.state.incumbent !== result.folder.digest) throw new Error("selected state does not match committed source");
  const measured = await evaluate(result.folder, { split: "validation" });
  if (Math.abs(measured.quality - result.state.quality) > 1e-12) throw new Error("reported quality does not match independently executed selected source");
  const baseline = await evaluate(baselineSource, { split: "validation" });
  const before = sourceFiles(baselineSource), files = sourceFiles(result.folder);
  const sourceDiff = [.../* @__PURE__ */ new Set([...Object.keys(before), ...Object.keys(files)])].sort().filter((path) => before[path] !== files[path]).map((path) => ({ path, kind: before[path] === void 0 ? "added" : files[path] === void 0 ? "deleted" : "modified" }));
  const transformation = options.transformation ? await (await import("./chunk-transformations-KUSCOSOW.js")).checkTransformation(evaluator, baselineSource, result.folder, options.transformation) : void 0;
  const callGain = measured.modelCalls !== void 0 && baseline.modelCalls !== void 0 && measured.modelCalls < baseline.modelCalls;
  const objectivePassed = measured.quality > baseline.quality || !sourceDiff.length || (options.policy.objective === "model-calls" ? callGain : options.policy.objective === "source-size" ? measured.sourceBytes < baseline.sourceBytes : true);
  const disposition = measured.quality < baseline.quality || !objectivePassed || !measured.gatesPassed || transformation?.eligible === false ? "no-eligible-promotion" : !sourceDiff.length ? "baseline-retained" : measured.quality > baseline.quality ? "improved" : "transformed";
  return {
    ...result,
    disposition,
    sourceDiff,
    baseline,
    transformation,
    sourceManifest: { schema: "natlang.program-source/1", source: result.folder.digest, base: baselineSource.digest, contract: options.contract, files, baseFiles: before },
    authored: { identity: fingerprint(authored), files: authored },
    validation: measured,
    ledger: gateway.snapshot(),
    evaluator
  };
}

// src/improvement/transformations.ts
async function checkTransformation(evaluator, before, after, spec) {
  const checked = await evaluator.check(after), evidence = [], obligations = [];
  obligations.push({ obligation: "compile and declared external contract", status: checked.valid ? "verified" : "violated", method: "independent compiler and contract checker", evidence: [] });
  if (spec.allowedFiles) {
    const { validateSourceEdit } = await import("./chunk-source-policy-LFI3OW3A.js"), { sourceFiles: sourceFiles2 } = await import("./chunk-host-QUAIGTVK.js");
    const errors = validateSourceEdit(sourceFiles2(before), sourceFiles2(after), spec.mode ?? "structural", spec.allowedFiles);
    obligations.push({ obligation: "editable source scope", status: errors.length ? "violated" : "verified", method: errors.join("\n") || "exact source projection comparison", evidence: [] });
  }
  if (checked.valid) {
    const baseline = await evaluator.evaluate(before, { split: "validation" }), candidate = await evaluator.evaluate(after, { split: "validation" });
    evidence.push(baseline.evidence, candidate.evidence);
    const comparable = !!baseline.scores?.length && baseline.scores.length === candidate.scores?.length;
    const paired = comparable && baseline.scores.every((left) => candidate.scores.some((right) => right.caseId === left.caseId && right.quality >= left.quality));
    const supported = candidate.gatesPassed && candidate.quality >= baseline.quality && paired;
    for (const claim of [...spec.preserves, ...spec.changes]) obligations.push({ obligation: claim, status: before.digest === after.digest ? spec.changes.includes(claim) ? "violated" : "verified" : !comparable ? "unverified" : supported ? "empirically-supported" : "violated", method: before.digest === after.digest ? spec.changes.includes(claim) ? "requested change left source byte-identical" : "byte-identical source" : "paired independent validation cases; a requested change is supported only by author-supplied cases", evidence: [...evidence] });
    for (const check of spec.checks) {
      if (check === "compile" || check === "external-contract") continue;
      if (check === "validation-regressions") obligations.push({ obligation: check, status: !comparable ? "unverified" : supported ? "empirically-supported" : "violated", method: "paired independent validation", evidence: [...evidence] });
      else obligations.push({ obligation: check, status: "unverified", method: "no independent checker supplied for this obligation", evidence: [] });
    }
  }
  const violated = obligations.some((row) => row.status === "violated"), unverified = obligations.some((row) => row.status === "unverified");
  const status = violated ? "violated" : unverified ? "unverified" : obligations.some((row) => row.status === "empirically-supported") ? "empirically-supported" : "verified";
  return { status, source: after.digest, spec, evidence, obligations, eligible: !violated && !unverified, reason: violated ? "An independent obligation failed." : unverified ? "Required obligations lack independent evidence." : "All required obligations have the stated support; finite cases do not establish universal equivalence." };
}
async function finiteCounterexamples(domain, check, maxChecks) {
  if (!Number.isSafeInteger(maxChecks) || maxChecks < 0) throw new RangeError("finite checker bound required");
  const inputs = domain.slice(0, maxChecks), counterexamples = [];
  for (const input of inputs) if (!await check(input)) counterexamples.push(input);
  return { checked: inputs.length, complete: inputs.length === domain.length, counterexamples };
}
function trainingCounterexample(id, group, args, expected) {
  return { id, group, split: "train", args: structuredClone(args), expected: structuredClone(expected) };
}
var FrozenImprover = class {
  constructor(selected, maxEvaluationDepth = 2) {
    this.selected = selected;
    this.maxEvaluationDepth = maxEvaluationDepth;
    if (!Number.isSafeInteger(maxEvaluationDepth) || maxEvaluationDepth < 1) throw new RangeError("finite evaluation depth required");
  }
  selected;
  maxEvaluationDepth;
  running = 0;
  snapshot() {
    return this.selected;
  }
  improve(options) {
    return this.run(0, (source) => improveProgram({ ...options, improverSource: source }));
  }
  async run(depth, invoke) {
    if (!Number.isSafeInteger(depth) || depth < 0 || depth >= this.maxEvaluationDepth) throw new Error("self-improvement evaluation depth exhausted");
    const frozen = this.selected;
    this.running++;
    try {
      return await invoke(frozen);
    } finally {
      this.running--;
    }
  }
  adopt(source) {
    if (this.running) throw new Error("adopt a frozen improver only between runs");
    this.selected = source;
  }
};

export {
  checkTransformation,
  finiteCounterexamples,
  trainingCounterexample,
  FrozenImprover
};
