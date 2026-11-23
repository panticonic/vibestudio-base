import {
  APPLY_TO_FOLDER,
  AUDIT_MINIMUM,
  CALLS_VERSION,
  CALL_MINIMUM,
  CallCapture,
  CompilationCache,
  Context,
  ContextError,
  CrispTier,
  DEFAULT_SETTINGS,
  Deopt,
  EvalFailure,
  FileHandle,
  Folder,
  FolderHandle,
  FolderIteration,
  FolderSnapshot,
  INTRINSICS_FILE,
  ImplementationTier,
  Iteration,
  IterationDivergedError,
  IterationLimitError,
  IterationStepError,
  MemoryIterationStatistics,
  MemoryVerdictCache,
  ModelTier,
  ModuleUnavailableError,
  NATLANG_COMPILE_VERSION,
  NEUTRAL_RUNTIME_SPECIFIER,
  NatlangCallError,
  NatlangContextError,
  NatlangPlatformUnavailableError,
  NatlangRecursionError,
  NatlangRuntime,
  NatlangSourceError,
  NatlangTask,
  NeuraleseTier,
  NzFileError,
  RECENT,
  RefinementCallError,
  RefinementChecker,
  RefinementError,
  STD_MODULE_FILE,
  STD_SPECIFIERS,
  SURFACE_MODULE_FILE,
  SlotContextStore,
  SpecializedTier,
  TierEngine,
  TierLedger,
  TypeEnv,
  VALUE_CLASSES,
  admit,
  analysisLowering,
  analyzeInlineLambdas,
  applyDecision,
  approachHash,
  assume,
  builtin,
  builtinDefinition,
  builtinModule,
  builtinNames,
  builtinRecords,
  callFailureReason,
  callableMeta,
  callableTree,
  canonicalValue,
  caseHashes,
  caseServices,
  caseSources,
  checkConstrainedSource,
  compileModule,
  consoleWriter,
  contextInterface,
  createNatlangCompilerHost,
  createNatlangRuntime,
  createNeuraleseLibrary,
  crispPolicy,
  currentFrame,
  decide,
  decideInFrame,
  decisionDomain,
  decisionJudge,
  declarationNamespace,
  decodeNz,
  defaultProgressJudge,
  defineNatlang,
  definitionKey,
  describeProgram,
  emptyEvidence,
  encodeNz,
  excluded,
  failureKind,
  findApplicationContext,
  fingerprint,
  foldEvent,
  fromTypeScript,
  graphCustodyMatches,
  handoffNote,
  hasBuiltinModule,
  importedNativeArtifacts,
  inlineDescriptor,
  inputFeatures,
  inputLeaves,
  interfaceHash,
  invokeAt,
  invokeDefinition,
  invokeNativeEntry,
  isDeopt,
  isModelEvidence,
  isModelOutcomeFailure,
  isNatlangCallable,
  iterateOn,
  iterateOn2,
  joinSourcePath,
  ladderOf,
  live,
  loadCallableFolder,
  loadCases,
  loadNamedFunction,
  loadNz,
  loadNzSync,
  lowered_exports,
  makeCallable,
  markRaces,
  modelTurnsSoFar,
  moduleTarget,
  moveTier,
  named,
  namedCallable,
  namedDescriptor,
  natlangDefinition,
  natlangTransformer,
  neuraleseModule,
  newTierEvidence,
  nl,
  normalizeProgram,
  normalizeSourcePath,
  nzDeclaration,
  nzExports,
  parseAliases,
  parseModule,
  parseRefinementSettings,
  parseTypeCached,
  platformModuleRealm,
  pluggable,
  pluggableMode,
  readNeuraleseForCurrentTask,
  rebind,
  recordOf,
  recordingServices,
  refine,
  refinementChain,
  refinements,
  registerShippedModule,
  rememberRecord,
  resolveFrame,
  ruleOf,
  runInFrame,
  runTiered,
  save,
  saveNz,
  selectedNativeCleanup,
  selectedNativeIdentity,
  selectedNativeSurface,
  selectedServiceSurface,
  servicesModule,
  setSystemPromptSource,
  setTierState,
  snapshot,
  softFunction,
  softFunctionOf,
  specializerOutput,
  stableHash,
  summaryOfTier,
  systemPromptBank,
  toBase64,
  tokens,
  typeScriptText,
  untrusted,
  withinTimeout
} from "./chunk-chunk-7RHMLU3S.js";
import {
  archiveNativeState
} from "./chunk-chunk-WRUGMGG2.js";
import {
  HttpNeuraleseStore,
  ModelTurnRecorder,
  NeuraleseUnsupportedError,
  canonical,
  isNativeAdapterRef,
  isNativeStateId,
  isNeuraleseRef,
  isPlainObject,
  nativeAdapterRef,
  neuraleseDisplayText,
  neuraleseRef,
  providerErrorBody,
  restoreNativeArtifacts,
  restoreNativeStates,
  setNativeAdapterSource,
  setNativeStateSource,
  setRecorderSource
} from "./chunk-chunk-Y6L7V2T3.js";
import {
  archiveNativeArtifactFrom,
  archiveNativeTensorFrom,
  hexDigest,
  importNativeArtifactBundle,
  nativeCanonicalJson,
  nativeModelIdentityEqual,
  validateNativeAdapterBinding,
  validateNativeInvocationActorReceipt
} from "./chunk-chunk-YDKDWV2X.js";
import {
  __export
} from "./chunk-chunk-KX6VIJEB.js";

// src/runtime/episode-call-store.ts
import { AsyncLocalStorage } from "node:async_hooks";
var episodeStore = new AsyncLocalStorage();
function episodeCallStoreRoot() {
  return episodeStore.getStore();
}
function enterEpisodeCallStore(root) {
  if (root) episodeStore.enterWith(root);
}

// src/native/eval-compile.ts
import ts2 from "typescript";

// src/native/prelude.generated.ts
var PRELUDE = '// natlang crisp standard library v0.1 (SPEC 9.4). Pure helpers only.\nconst count = (xs, f) => (f ? xs.filter(f).length : xs.length);\nconst sum = (xs, f) => xs.reduce((a, x) => a + (f ? f(x) : x), 0);\nconst min = (xs, f) => xs.reduce((a, x) => { const v = f ? f(x) : x; return a === undefined || v < a ? v : a; }, undefined);\nconst max = (xs, f) => xs.reduce((a, x) => { const v = f ? f(x) : x; return a === undefined || v > a ? v : a; }, undefined);\nconst mean = (xs, f) => (xs.length ? sum(xs, f) / xs.length : undefined);\nconst _key = (f) => (typeof f === "function" ? f : (x) => x[f]);\nconst sortBy = (xs, f, desc) => { const k = f ? _key(f) : (x) => x; const out = [...xs].sort((a, b) => (k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0)); return desc ? out.reverse() : out; };\nconst groupBy = (xs, f) => { const k = _key(f), out = Object.create(null); for (const x of xs) (out[k(x)] ||= []).push(x); return out; };\nconst countBy = (xs, f) => { const k = f ? _key(f) : (x) => x, out = Object.create(null); for (const x of xs) out[k(x)] = (out[k(x)] || 0) + 1; return out; };\nconst uniq = (xs) => [...new Set(xs)];\nconst uniqBy = (xs, f) => { const k = _key(f), seen = new Set(), out = []; for (const x of xs) { const v = k(x); if (!seen.has(v)) { seen.add(v); out.push(x); } } return out; };\nconst zip = (...ls) => ls[0].map((_, i) => ls.map((l) => l[i]));\nconst _whole = (name, n, least) => { if (!Number.isSafeInteger(n) || n < least) throw new RangeError(`${name} must be a whole number of at least ${least}, but got ${String(n)}`); return n; };\nconst range = (a, b) => { if (!Number.isFinite(a) || !Number.isFinite(b)) throw new RangeError(`range needs finite bounds, but got ${String(a)} and ${String(b)}`); const out = []; for (let i = a; i <= b; i++) out.push(i); return out; };\nconst chunk = (xs, n) => { _whole(\'chunk size\', n, 1); const out = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out; };\nconst windows = (xs, n, step = 1) => { _whole(\'window size\', n, 1); _whole(\'window step\', step, 1); const out = []; for (let i = 0; i + n <= xs.length; i += step) out.push(xs.slice(i, i + n)); return out; };\nconst flatten = (xs) => xs.flat();\nconst take = (xs, n) => xs.slice(0, n);\nconst drop = (xs, n) => xs.slice(n);\nconst partition = (xs, f) => [xs.filter(f), xs.filter((x) => !f(x))];\nconst topK = (xs, k, f) => sortBy(xs, f, true).slice(0, k);\nconst indexBy = (xs, f) => { const k = _key(f), out = Object.create(null); for (const x of xs) out[k(x)] = x; return out; };\nconst splitLines = (s) => s.split(/\\r?\\n/).filter((l) => l.trim() !== "");\nconst splitOn = (s, sep) => s.split(sep);\nconst joinWith = (xs, sep) => xs.join(sep);\nconst trim = (s) => s.trim();\nconst lower = (s) => s.toLowerCase();\nconst upper = (s) => s.toUpperCase();\nconst contains = (s, sub) => s.includes(sub);\nconst startsWith = (s, p) => s.startsWith(p);\nconst matchAll = (s, re) => [...s.matchAll(new RegExp(re, "g"))].map((m) => m[0]);\nconst replaceAll = (s, a, b) => s.split(a).join(b);\nconst wordCount = (s) => (s.trim() === "" ? 0 : s.trim().split(/\\s+/).length);\nconst parseNum = (s) => { const v = Number(String(s).replace(/[, ]/g, "")); return Number.isFinite(v) ? v : null; };\nconst parseDate = (s) => { const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0, 10); };\nconst formatDate = (s) => new Date(s).toISOString().slice(0, 10);\nconst daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);\nconst hash = (x) => { const s = typeof x === "string" ? x : JSON.stringify(x); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16); };\nconst enumOf = (xs) => xs.map((x) => (typeof x === "number" ? String(x) : JSON.stringify(String(x)))).join(" | ");\n';

// src/native/eval-memory.ts
import ts from "typescript";
var MEMORY_CHECK = "__natlang_memory";
var DEFAULT_EVAL_MEMORY_MB = 256;
var CHECK_EVERY = 128;
var MB = 1024 * 1024;
function evalMemoryLimitMb(env = globalThis.process?.env ?? {}) {
  const text = env.NATLANG_EVAL_MEMORY_MB?.trim();
  if (!text) return DEFAULT_EVAL_MEMORY_MB;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`NATLANG_EVAL_MEMORY_MB must be a number of MB >= 0 (0: unbounded), got ${text}`);
  return value;
}
function memoryLimitMessage(subject, unit, limitMb) {
  return `${subject} stopped: its data grew past the ${limitMb} MB memory limit of one ${unit}; use a bounded or more memory-efficient approach (prune the search, keep compact state, or process the data in parts)`;
}
var evalMemoryMessage = (limitMb) => memoryLimitMessage("eval", "eval", limitMb);
var moduleMemoryMessage = (limitMb) => memoryLimitMessage("callable-folder code", "synchronous run of callable-folder code", limitMb);
function memoryGuard(limitMb, probe, message = evalMemoryMessage(limitMb)) {
  const limit = limitMb * MB, base = probe.used();
  let ticks = 0, next = base + limit, tripped = false;
  const fail2 = () => {
    tripped = true;
    throw new RangeError(message);
  };
  return () => {
    if (tripped) fail2();
    if (++ticks < CHECK_EVERY) return;
    ticks = 0;
    if (probe.used() <= next) return;
    if (!probe.collect) fail2();
    probe.collect();
    const after = probe.used();
    if (after - base > limit) fail2();
    next = Math.max(base + limit, after + limit / 2);
  };
}
function segmentGuard(limitMb, probe, message = moduleMemoryMessage(limitMb)) {
  let current;
  return () => {
    if (!current) {
      current = memoryGuard(limitMb, probe, message);
      queueMicrotask(() => {
        current = void 0;
      });
    }
    current();
  };
}
var DEFAULT_EVAL_SYNC_SECONDS = 60;
function evalSyncLimitSeconds(env = globalThis.process?.env ?? {}) {
  const text = env.NATLANG_EVAL_SYNC_SECONDS?.trim();
  if (!text) return DEFAULT_EVAL_SYNC_SECONDS;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`NATLANG_EVAL_SYNC_SECONDS must be a number of seconds >= 0 (0: unbounded), got ${text}`);
  return value;
}
function syncLimitMessage(subject, limitSeconds) {
  return `${subject} stopped: it computed for more than ${limitSeconds} s without pausing; use a bounded or faster approach (prune the search, check the input sizes, or compute in smaller parts)`;
}
function syncGuard(limitSeconds, message, sticky = true, now2 = () => performance.now()) {
  const limit = limitSeconds * 1e3;
  let started, ticks = 0, tripped = false;
  const fail2 = () => {
    tripped = true;
    throw new RangeError(message);
  };
  return () => {
    if (tripped) fail2();
    if (started === void 0) {
      started = now2();
      ticks = 0;
      queueMicrotask(() => {
        started = void 0;
        if (!sticky) tripped = false;
      });
      return;
    }
    if (++ticks < CHECK_EVERY) return;
    ticks = 0;
    if (now2() - started > limit) fail2();
  };
}
function combinedGuard(...guards) {
  const on = guards.filter((guard) => typeof guard === "function");
  if (on.length < 2) return on[0];
  return () => {
    for (const guard of on) guard();
  };
}
function instrumentMemoryChecks(source, check = MEMORY_CHECK, kind2 = "ts") {
  const file = ts.createSourceFile(
    kind2 === "ts" ? "natlang-eval.ts" : "natlang-module.js",
    source,
    ts.ScriptTarget.Latest,
    true,
    kind2 === "ts" ? ts.ScriptKind.TS : ts.ScriptKind.JS
  );
  if (file.parseDiagnostics?.length) return source;
  const call = `${check}();`;
  const edits = [];
  const atBlockStart = (block) => edits.push([block.getStart(file) + 1, 1, call]);
  const statementBody = (body) => {
    if (ts.isBlock(body)) return atBlockStart(body);
    edits.push([body.getStart(file), 1, `{${call}`], [body.getEnd(), 0, "}"]);
  };
  const visit = (node) => {
    if (ts.isIterationStatement(node, false)) statementBody(node.statement);
    else if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && node.body) atBlockStart(node.body);
    else if (ts.isArrowFunction(node)) {
      if (ts.isBlock(node.body)) atBlockStart(node.body);
      else edits.push([node.body.getStart(file), 1, `(${check}(), `], [node.body.getEnd(), 0, ")"]);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  edits.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  for (const [position, , text] of edits) source = source.slice(0, position) + text + source.slice(position);
  return source;
}

// src/native/eval-compile.ts
var BODY_FUNCTION = "__natlang_body";
function lowerStaticImports(source, validateImport) {
  const file = ts2.createSourceFile("imports.ts", source, ts2.ScriptTarget.Latest, true);
  const edits = [];
  const visit = (node) => {
    if (ts2.isImportDeclaration(node)) {
      if (!ts2.isStringLiteral(node.moduleSpecifier)) throw new Error("Package import must use a string literal");
      validateImport(node.moduleSpecifier.text);
      const clause = node.importClause;
      const call = `await __natlang_import(${node.moduleSpecifier.getText(file)})`;
      const fields = [];
      let text = "";
      const typeOnlyBindings = clause?.namedBindings && ts2.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every((binding) => binding.isTypeOnly);
      if (!clause?.isTypeOnly && !(typeOnlyBindings && !clause?.name)) {
        if (clause?.name) fields.push(`default: ${clause.name.text}`);
        const bindings = clause?.namedBindings;
        if (bindings && ts2.isNamedImports(bindings)) {
          for (const binding of bindings.elements)
            if (!binding.isTypeOnly) fields.push(`${binding.propertyName?.text ?? binding.name.text}: ${binding.name.text}`);
        }
        if (fields.length) text += `const { ${fields.join(", ")} } = ${call};`;
        if (bindings && ts2.isNamespaceImport(bindings)) text += `const ${bindings.name.text} = ${call};`;
        if (!text) text = `${call};`;
      }
      edits.push({ start: node.getStart(file), end: node.end, text });
    } else ts2.forEachChild(node, visit);
  };
  visit(file);
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
var restoreAfterAwait = (context) => (file) => {
  const f = context.factory;
  const visit = (node) => ts2.isAwaitExpression(node) ? f.createCallExpression(f.createParenthesizedExpression(f.createAwaitExpression(f.createCallExpression(
    f.createIdentifier("__natlang_bindAwait"),
    void 0,
    [ts2.visitNode(node.expression, visit)]
  ))), void 0, []) : ts2.visitEachChild(node, visit, context);
  return ts2.visitNode(file, visit);
};
var lowerImportCalls = (context) => (root) => {
  const visit = (node) => {
    if (ts2.isCallExpression(node) && node.expression.kind === ts2.SyntaxKind.ImportKeyword)
      return ts2.factory.updateCallExpression(
        node,
        ts2.factory.createIdentifier("__natlang_import"),
        void 0,
        node.arguments.map((arg) => ts2.visitNode(arg, visit))
      );
    return ts2.visitEachChild(node, visit, context);
  };
  return ts2.visitNode(root, visit);
};
function compileEval(code, options) {
  let source = options.body ? `${options.asyncBody ? "async " : ""}function ${BODY_FUNCTION}() {
${code}
}` : code;
  if (options.imports) source = lowerStaticImports(source, options.imports);
  if (options.memoryChecks) source = instrumentMemoryChecks(source);
  const result = ts2.transpileModule(source, {
    fileName: "natlang-eval.ts",
    reportDiagnostics: true,
    compilerOptions: { target: ts2.ScriptTarget.ES2022, module: ts2.ModuleKind.None, isolatedModules: true, removeComments: false },
    transformers: { before: [...options.imports ? [lowerImportCalls] : [], ...options.restoreAfterAwait ? [restoreAfterAwait] : []] }
  });
  const errors = (result.diagnostics ?? []).filter((d) => d.category === ts2.DiagnosticCategory.Error);
  if (errors.length) throw new SyntaxError("TypeScript: " + errors.map((d) => ts2.flattenDiagnosticMessageText(d.messageText, "\n")).join("; "));
  return result.outputText;
}
function evalRealmBody(compiled, body) {
  return body ? `${PRELUDE}
${compiled}
return ${BODY_FUNCTION}();` : `${PRELUDE}
return eval(${JSON.stringify(`"use strict";
${compiled}`)});`;
}

// src/native/realm.ts
var UNAWAITED_DISPLAY = "[a Promise: not awaited yet; write await before the call to get its value]";
function constructorRealm(newFunction, name = "natlang") {
  return { call: (body, parameters, args) => newFunction(`"use strict";
${body}`, name, ...parameters)(...args) };
}
function portable(value, seen = /* @__PURE__ */ new Set(), path = "$", scope = false) {
  if (scope && value === void 0) return value;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return value;
  if (!value || typeof value !== "object" || ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    throw new TypeError(`eval result ${path} contains an unsupported or inexact ${typeof value} value`);
  if (typeof value.then === "function")
    throw new TypeError("await the asynchronous imported function call");
  if (seen.has(value)) throw new TypeError("eval result contains a cycle");
  seen.add(value);
  if (Array.isArray(value)) {
    const out2 = value.map((item, index) => portable(item, seen, `${path}[${index}]`, scope));
    seen.delete(value);
    return out2;
  }
  if (Object.prototype.toString.call(value) !== "[object Object]")
    throw new TypeError("eval result contains a native object");
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && (Object.getPrototypeOf(proto) !== null || proto.constructor?.name !== "Object"))
    throw new TypeError("eval result contains a native class instance");
  const out = /* @__PURE__ */ Object.create(null);
  for (const [key, child] of Object.entries(value)) out[key] = portable(child, seen, `${path}.${key}`, scope);
  seen.delete(value);
  return out;
}
function snapshot2(value) {
  const copy = portable(value, /* @__PURE__ */ new Set(), "$", true);
  function freeze(item) {
    if (item && typeof item === "object") {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
  }
  freeze(copy);
  return copy;
}
var RealmEnvironment = class {
  constructor(options) {
    this.options = options;
    this.authority = options.authority;
    this.mode = options.mode ?? "fresh";
    this.timeoutMs = options.timeoutMs;
    this.scopeCapabilities = options.scopeCapabilities ?? { allowModules: false, allowNetwork: false };
    if (this.timeoutMs !== void 0 && (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1)) throw new RangeError("timeoutMs must be positive");
    const limit = options.memory?.limitMb;
    if (limit !== void 0 && !(Number.isFinite(limit) && limit >= 0)) throw new RangeError("memory limitMb must be a non-negative number");
  }
  options;
  authority;
  mode;
  timeoutMs;
  scopeCapabilities;
  disposed = false;
  retained;
  /** The eval memory bound in MB, or undefined when evals are unbounded. */
  get memoryLimitMb() {
    return this.options.memory?.limitMb || void 0;
  }
  /** The run-time bound of one synchronous stretch in seconds, or undefined when unbounded. */
  get syncLimitSeconds() {
    return this.options.syncLimitSeconds || void 0;
  }
  fork() {
    if (!this.options.fork) throw new Error(`${this.authority} cannot fork`);
    return this.options.fork();
  }
  /** A realm for one evaluation (`fresh`) or for the environment's life (`retained`). */
  makeRealm() {
    if (!this.options.realm) throw new Error(`${this.authority} has no realm`);
    return this.options.realm();
  }
  /** The realm callable-folder modules run in; by default the eval realm. */
  moduleRealm() {
    return this.realm();
  }
  /** Package imports for async evals, if the platform has packages. */
  importer() {
    return void 0;
  }
  /** Names the realm binds for eval code besides the standard ones (timers, for example). */
  extraBindings() {
    return {};
  }
  /** Events the realm's host side recorded since the last eval (callback errors, unhandled rejections, fetches). */
  hostEvents() {
    return [];
  }
  /** Called when an asynchronous eval fails: cancel what the eval scheduled. */
  abandon() {
  }
  /** Called by `close()`: release what the environment owns. */
  release() {
  }
  realm() {
    return this.mode === "retained" ? this.retained ??= this.makeRealm() : this.makeRealm();
  }
  capture(request, status) {
    const events = this.hostEvents();
    for (const event of events) this.options.observe?.(event);
    const evalEvent = { operation: "typescript.eval", mode: this.mode, body: request.body, status };
    this.options.observe?.(evalEvent);
    return [...events, evalEvent];
  }
  failure(request, error, logs) {
    return new EvalFailure(
      error instanceof Error ? error.message : String(error),
      this.capture(request, "failed"),
      { sourceStack: error && typeof error === "object" && "stack" in error && typeof error.stack === "string" ? error.stack : void 0, logs }
    );
  }
  run(request, asyncBody, logs) {
    if (this.disposed) throw new Error("TypeScript environment is disposed");
    if (typeof request.code !== "string" || typeof request.scope !== "object" || request.scope === null)
      throw new TypeError("invalid eval request");
    const imports = asyncBody ? this.importer() : void 0;
    const memory = this.memoryLimitMb ? this.options.memory : void 0;
    const syncSeconds = this.syncLimitSeconds, syncMessage = syncSeconds && syncLimitMessage("eval", syncSeconds);
    const check = combinedGuard(
      memory && memoryGuard(memory.limitMb, memory.probe),
      syncSeconds && syncGuard(syncSeconds, syncMessage)
    );
    const compiled = compileEval(request.code, {
      body: request.body,
      asyncBody,
      imports: imports?.validate.bind(imports),
      restoreAfterAwait: !!this.options.bindAwait,
      memoryChecks: !!check
    });
    const realm = this.realm();
    const write = consoleWriter(logs, (value) => {
      if (value !== null && typeof value === "object" && typeof value.then === "function")
        return UNAWAITED_DISPLAY;
      try {
        const data = portable(value);
        return isNeuraleseRef(data) ? neuraleseDisplayText(data) : JSON.stringify(data, (_key, item) => isNeuraleseRef(item) ? neuraleseDisplayText(item) : item);
      } catch {
        return String(value);
      }
    });
    const logger = Object.freeze({ log: write, info: write, warn: write, error: write });
    const bound = {
      self: snapshot2(request.scope),
      __live: request.live ?? {},
      __natlang_import: (specifier) => {
        if (!imports) throw new Error(`cannot import ${specifier}: eval has no package imports here`);
        return imports.load(specifier);
      },
      console: logger,
      ...this.options.bindAwait ? { __natlang_bindAwait: this.options.bindAwait } : {},
      ...check ? { [MEMORY_CHECK]: check } : {},
      ...this.extraBindings()
    };
    const requested = request.timeoutMs ?? this.timeoutMs, syncMs = syncSeconds ? Math.ceil(syncSeconds * 1e3) : void 0;
    const interrupt = requested === void 0 ? syncMs : syncMs === void 0 ? requested : Math.min(requested, syncMs);
    try {
      return realm.call(evalRealmBody(compiled, request.body), Object.keys(bound), Object.values(bound), { timeoutMs: interrupt });
    } catch (error) {
      if (syncMs !== void 0 && interrupt === syncMs && (requested === void 0 || syncMs < requested) && error?.code === "ERR_SCRIPT_EXECUTION_TIMEOUT") throw new RangeError(syncMessage);
      throw error;
    }
  }
  execute(request) {
    const logs = [];
    try {
      const value = this.run(request, false, logs);
      if (value && typeof value === "object" && typeof value.then === "function")
        throw new TypeError("an asynchronous result needs executeAsync");
      return { result: value === void 0 ? null : value, events: this.capture(request, "completed"), logs };
    } catch (error) {
      throw this.failure(request, error, logs);
    }
  }
  async executeAsync(request) {
    const logs = [];
    try {
      const timeout = request.timeoutMs ?? this.timeoutMs;
      const value = await withinTimeout(Promise.resolve(this.run(request, request.body, logs)), timeout);
      return { result: value === void 0 ? null : value, events: this.capture(request, "completed"), logs };
    } catch (error) {
      this.abandon();
      throw this.failure(request, error, logs);
    }
  }
  /** Evaluate a callable-folder module body; bindings are passed by reference. */
  evaluateModule(code, bindings) {
    if (this.disposed) throw new Error("TypeScript environment is disposed");
    const memory = this.memoryLimitMb ? this.options.memory : void 0, syncSeconds = this.syncLimitSeconds;
    const check = combinedGuard(
      memory && segmentGuard(memory.limitMb, memory.probe),
      syncSeconds && syncGuard(syncSeconds, syncLimitMessage("callable-folder code", syncSeconds), false)
    );
    if (check) {
      code = instrumentMemoryChecks(code, MEMORY_CHECK, "js");
      bindings = { ...bindings, [MEMORY_CHECK]: check };
    }
    return this.moduleRealm().call(code, Object.keys(bindings), Object.values(bindings));
  }
  close() {
    this.disposed = true;
    this.retained = void 0;
    this.release();
  }
};

// src/compiler/sequential-loops.ts
import ts3 from "typescript";
var SEQUENTIAL_LOOP_CODE = "nl-sequential-loop";
function checkSequentialNlLoops(file, displayPath = (source) => source.fileName) {
  const nlFunctions = /* @__PURE__ */ new Set();
  for (const statement of file.statements) {
    if (!ts3.isImportDeclaration(statement) || !ts3.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    if (statement.moduleSpecifier.text.endsWith(".nl") && clause.name) nlFunctions.add(clause.name.text);
    if (statement.moduleSpecifier.text.endsWith(".nl") && clause.namedBindings && ts3.isNamedImports(clause.namedBindings))
      for (const item of clause.namedBindings.elements) nlFunctions.add(item.name.text);
  }
  const unwrap3 = (node) => {
    while (ts3.isParenthesizedExpression(node) || ts3.isNonNullExpression(node) || ts3.isAsExpression(node)) node = node.expression;
    return node;
  };
  const isNlCall = (node) => {
    node = unwrap3(node);
    if (!ts3.isCallExpression(node)) return false;
    const callee = unwrap3(node.expression);
    if (ts3.isIdentifier(callee)) return nlFunctions.has(callee.text);
    return ts3.isTaggedTemplateExpression(callee) && ts3.isIdentifier(callee.tag) && callee.tag.text === "nl";
  };
  const simpleArgument = (node, loopNames, written) => {
    let ok = true;
    const visit2 = (child) => {
      if (!ok) return;
      if (ts3.isCallExpression(child) || ts3.isNewExpression(child) || ts3.isAwaitExpression(child) || ts3.isFunctionLike(child) || ts3.isYieldExpression(child) || ts3.isTaggedTemplateExpression(child) || ts3.isBinaryExpression(child) && child.operatorToken.kind >= ts3.SyntaxKind.FirstAssignment && child.operatorToken.kind <= ts3.SyntaxKind.LastAssignment || (ts3.isPrefixUnaryExpression(child) || ts3.isPostfixUnaryExpression(child)) && (child.operator === ts3.SyntaxKind.PlusPlusToken || child.operator === ts3.SyntaxKind.MinusMinusToken)) {
        ok = false;
        return;
      }
      if (ts3.isIdentifier(child) && written.has(child.text) && !(ts3.isPropertyAccessExpression(child.parent) && child.parent.name === child)) {
        ok = false;
        return;
      }
      ts3.forEachChild(child, visit2);
    };
    visit2(node);
    return ok;
  };
  const rootName = (node) => {
    node = unwrap3(node);
    while (ts3.isPropertyAccessExpression(node) || ts3.isElementAccessExpression(node)) node = unwrap3(node.expression);
    return ts3.isIdentifier(node) ? node.text : void 0;
  };
  const diagnostics = [];
  const visit = (node) => {
    if (ts3.isForOfStatement(node) && !node.awaitModifier && ts3.isVariableDeclarationList(node.initializer)) {
      const loopNames = /* @__PURE__ */ new Set();
      const collect2 = (name) => {
        if (ts3.isIdentifier(name)) loopNames.add(name.text);
        else for (const element of name.elements) if (ts3.isBindingElement(element)) collect2(element.name);
      };
      node.initializer.declarations.forEach((declaration) => collect2(declaration.name));
      const statements = ts3.isBlock(node.statement) ? [...node.statement.statements] : [node.statement];
      if (statements.length === 1) {
        const only = statements[0];
        let awaited, written, ok = false;
        if (ts3.isVariableStatement(only) && only.declarationList.flags & ts3.NodeFlags.Const && only.declarationList.declarations.length === 1) {
          const init = only.declarationList.declarations[0].initializer;
          if (init && ts3.isAwaitExpression(unwrap3(init))) {
            awaited = unwrap3(init).expression;
            ok = true;
          }
        } else if (ts3.isExpressionStatement(only)) {
          const expression = unwrap3(only.expression);
          if (ts3.isCallExpression(expression) && ts3.isPropertyAccessExpression(expression.expression) && expression.expression.name.text === "push" && expression.arguments.length === 1 && ts3.isAwaitExpression(unwrap3(expression.arguments[0]))) {
            awaited = unwrap3(expression.arguments[0]).expression;
            written = rootName(expression.expression.expression);
            ok = true;
          } else if (ts3.isBinaryExpression(expression) && expression.operatorToken.kind === ts3.SyntaxKind.EqualsToken && ts3.isElementAccessExpression(unwrap3(expression.left)) && ts3.isAwaitExpression(unwrap3(expression.right))) {
            awaited = unwrap3(expression.right).expression;
            written = rootName(expression.left);
            ok = true;
          }
        }
        if (ok && awaited && isNlCall(awaited)) {
          const call = unwrap3(awaited);
          const writes = new Set(written ? [written] : []);
          const callee = unwrap3(call.expression);
          const pieces = [...call.arguments, ...ts3.isTaggedTemplateExpression(callee) ? [callee.template] : []];
          if (pieces.every((piece) => simpleArgument(piece, loopNames, writes))) {
            const start = node.getStart(file), position = file.getLineAndCharacterOfPosition(start);
            diagnostics.push({
              file: displayPath(file),
              start,
              end: node.end,
              line: position.line + 1,
              column: position.character + 1,
              code: SEQUENTIAL_LOOP_CODE,
              severity: "warning",
              message: "This loop waits for each natural-language call before starting the next, so the model sees one request at a time. The calls do not depend on each other, so `await Promise.all(items.map(item => f(item)))` gives the same results with the calls batched. Keep the loop if the order of the calls matters."
            });
          }
        }
      }
    }
    ts3.forEachChild(node, visit);
  };
  visit(file);
  return diagnostics;
}

// src/compiler/idiom.ts
import ts4 from "typescript";
var IDIOM_DECISION_READOUT = "idiom-decision-readout";
var IDIOM_FIXED_CURSOR_ITERATE = "idiom-fixed-cursor-iterate";
var IDIOM_CODE_IN_PROSE = "idiom-code-in-prose";
var CODE_IN_PROSE_TOKENS = ["JSON.parse(", ".slice(", "Math.", "eval({", "=>"];
var warning = (file, line, column, code, message) => ({ file, start: 0, end: 0, line, column, code, severity: "warning", message });
var baseName = (path) => path.split(/[\\/]/).pop() ?? path;
function frontmatterEnd(lines) {
  return lines[0]?.trim() === "---" ? lines.findIndex((line, index) => index > 0 && line.trim() === "---") : -1;
}
function checkNlIdioms(record, file) {
  const out = [];
  const lines = record.text.split(/\r?\n/);
  const end = frontmatterEnd(lines);
  const leaf = record.subtype === "function" && !record.generic && Object.keys(record.codebase).length === 0 && !record.uses?.length && !Object.values(record.args).some((type) => /(?<![\w$])Folder(?![\w$])/.test(type));
  if (leaf && record.readout === void 0) {
    let size = 0;
    try {
      const env = new TypeEnv(Object.fromEntries(Object.entries(record.types).map(([name, text]) => [name, parseTypeCached(text)])));
      size = decisionDomain(parseTypeCached(record.returns), env)?.size ?? 0;
    } catch {
      size = 0;
    }
    if (size >= 2) {
      const at = lines.findIndex((line, index) => index > 0 && (end < 0 || index < end) && line.startsWith("returns:"));
      out.push(warning(
        file,
        at < 0 ? 1 : at + 1,
        1,
        IDIOM_DECISION_READOUT,
        `\`${baseName(file)}\` returns one of ${size} values: add \`readout: decision\` so the model reasons and scores them, or keep the tool loop if it must call helpers first.`
      ));
    }
  }
  let fence3;
  for (let index = end < 0 ? 0 : end + 1; index < lines.length; index++) {
    const line = lines[index];
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence3) fence3 = marker[0].repeat(marker.length);
      else if (marker[0] === fence3[0] && marker.length >= fence3.length) fence3 = void 0;
      continue;
    }
    if (fence3) continue;
    const found = CODE_IN_PROSE_TOKENS.map((token) => ({ token, column: line.indexOf(token) })).filter((item) => item.column >= 0).sort((a, b) => a.column - b.column)[0];
    if (!found) continue;
    const folder = file.replace(/\.nl$/, "");
    out.push(warning(
      file,
      index + 1,
      found.column + 1,
      IDIOM_CODE_IN_PROSE,
      `\`${baseName(file)}\` describes code (\`${found.token}\`) in its instructions: write that step as a TypeScript helper in \`${folder}/\` and call it from the function.`
    ));
    break;
  }
  return out;
}
function checkNlIdiomsIn(levels, display) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const visit = (level) => {
    for (const item of Object.values(level)) {
      if (item.kind === "natlang" && !seen.has(item.source)) {
        seen.add(item.source);
        out.push(...checkNlIdioms(item, display(item.source)));
      }
      if (item.kind !== "natlang" || !item.uses?.length) visit(item.codebase);
      else visit(Object.fromEntries(Object.entries(item.codebase).filter(([name]) => !item.uses.some((path) => baseName(path) === name))));
    }
  };
  for (const level of levels) visit(level);
  return out;
}
var unwrap = (node) => {
  while (ts4.isParenthesizedExpression(node) || ts4.isAsExpression(node) || ts4.isNonNullExpression(node) || ts4.isSatisfiesExpression(node) || ts4.isTypeAssertionExpression(node)) node = node.expression;
  return node;
};
function stepFunction(file, expression) {
  const node = unwrap(expression);
  if (ts4.isArrowFunction(node) || ts4.isFunctionExpression(node)) return node;
  if (!ts4.isIdentifier(node)) return void 0;
  const found = [];
  let other = false;
  const visit = (child) => {
    if (ts4.isFunctionDeclaration(child) && child.name?.text === node.text) found.push(child);
    else if (ts4.isVariableDeclaration(child) && ts4.isIdentifier(child.name) && child.name.text === node.text) {
      const init = child.initializer && unwrap(child.initializer);
      if (init && (ts4.isArrowFunction(init) || ts4.isFunctionExpression(init)) && ts4.isVariableDeclarationList(child.parent) && child.parent.flags & ts4.NodeFlags.Const) found.push(init);
      else other = true;
    } else if (ts4.isParameter(child) && ts4.isIdentifier(child.name) && child.name.text === node.text) other = true;
    ts4.forEachChild(child, visit);
  };
  visit(file);
  return !other && found.length === 1 ? found[0] : void 0;
}
function stateReader(fn) {
  const parameter = fn.parameters[0];
  if (!parameter || parameter.dotDotDotToken) return void 0;
  const name = parameter.name;
  const bound = /* @__PURE__ */ new Map();
  let whole;
  if (ts4.isIdentifier(name)) whole = name.text;
  else if (ts4.isObjectBindingPattern(name)) {
    for (const element of name.elements) {
      if (element.dotDotDotToken || !ts4.isIdentifier(element.name) || element.initializer) return void 0;
      const property = element.propertyName ? ts4.isIdentifier(element.propertyName) ? element.propertyName.text : void 0 : element.name.text;
      if (!property) return void 0;
      bound.set(element.name.text, property);
    }
  } else return void 0;
  const isValueIdentifier = (node) => {
    const parent = node.parent;
    if (ts4.isPropertyAccessExpression(parent) && parent.name === node) return false;
    if ((ts4.isPropertyAssignment(parent) || ts4.isPropertySignature(parent) || ts4.isBindingElement(parent)) && parent.name === node) return false;
    if (ts4.isParameter(parent) && parent.name === node) return false;
    return true;
  };
  const field = (node) => {
    if (ts4.isExpression(node)) node = unwrap(node);
    if (whole && ts4.isPropertyAccessExpression(node) && ts4.isIdentifier(unwrap(node.expression)) && unwrap(node.expression).text === whole) return node.name.text;
    if (ts4.isIdentifier(node) && bound.has(node.text) && isValueIdentifier(node)) return bound.get(node.text);
    return void 0;
  };
  const isWhole = (node) => !!whole && ts4.isIdentifier(node) && node.text === whole && isValueIdentifier(node) && !(ts4.isPropertyAccessExpression(node.parent) && node.parent.expression === node);
  return { field, isWhole, whole };
}
function returnedExpressions(fn) {
  if (!fn.body) return void 0;
  if (!ts4.isBlock(fn.body)) return [fn.body];
  const out = [];
  let bare = false;
  const visit = (node) => {
    if (ts4.isFunctionLike(node)) return;
    if (ts4.isReturnStatement(node)) {
      if (node.expression) out.push(node.expression);
      else bare = true;
    }
    ts4.forEachChild(node, visit);
  };
  visit(fn.body);
  return bare || !out.length ? void 0 : out;
}
var isOne = (node) => {
  node = unwrap(node);
  return ts4.isNumericLiteral(node) && node.text === "1";
};
function fixedCursorStep(file, fn, until) {
  const reader = stateReader(fn);
  const returned = returnedExpressions(fn);
  if (!reader || !returned || !fn.body) return false;
  if (fn.asteriskToken) return false;
  const objects = returned.map((expression) => unwrap(ts4.isAwaitExpression(unwrap(expression)) ? unwrap(expression).expression : expression));
  if (!objects.every(ts4.isObjectLiteralExpression)) return false;
  let cursor;
  const cursorUpdates = /* @__PURE__ */ new Set();
  const accumulations = /* @__PURE__ */ new Map();
  const unchanged = /* @__PURE__ */ new Set();
  const declaredFields = /* @__PURE__ */ new Map();
  for (const object of objects) {
    for (const property of object.properties) {
      if (ts4.isSpreadAssignment(property)) {
        const spread = unwrap(property.expression);
        if (reader.whole && ts4.isIdentifier(spread) && spread.text === reader.whole) {
          unchanged.add(spread);
          continue;
        }
        return false;
      }
      if (!ts4.isPropertyAssignment(property) && !ts4.isShorthandPropertyAssignment(property)) return false;
      if (!ts4.isIdentifier(property.name) && !ts4.isStringLiteral(property.name)) return false;
      const key = property.name.text;
      declaredFields.set(key, (declaredFields.get(key) ?? 0) + 1);
      const value = ts4.isPropertyAssignment(property) ? unwrap(property.initializer) : property.name;
      if (ts4.isBinaryExpression(value) && value.operatorToken.kind === ts4.SyntaxKind.PlusToken && (reader.field(value.left) === key && isOne(value.right) || reader.field(value.right) === key && isOne(value.left))) {
        if (cursor && (cursor.name !== key || cursor.kind !== "index")) return false;
        cursor = { name: key, kind: "index" };
        cursorUpdates.add(value);
        continue;
      }
      if (ts4.isCallExpression(value) && ts4.isPropertyAccessExpression(value.expression) && value.expression.name.text === "slice" && value.arguments.length === 1 && isOne(value.arguments[0]) && reader.field(value.expression.expression) === key) {
        if (cursor && (cursor.name !== key || cursor.kind !== "queue")) return false;
        cursor = { name: key, kind: "queue" };
        cursorUpdates.add(value);
        continue;
      }
      if (reader.field(value) === key) {
        unchanged.add(value);
        continue;
      }
      if (ts4.isArrayLiteralExpression(value) && value.elements.length >= 1 && ts4.isSpreadElement(value.elements[0]) && reader.field(value.elements[0].expression) === key) {
        accumulations.set(value.elements[0].expression, key);
        continue;
      }
      if (ts4.isObjectLiteralExpression(value) && value.properties.length >= 1 && ts4.isSpreadAssignment(value.properties[0]) && reader.field(value.properties[0].expression) === key) {
        accumulations.set(value.properties[0].expression, key);
        continue;
      }
      if (ts4.isCallExpression(value) && ts4.isPropertyAccessExpression(value.expression) && value.expression.name.text === "concat" && reader.field(value.expression.expression) === key) {
        accumulations.set(value.expression.expression, key);
        continue;
      }
      if (ts4.isBinaryExpression(value) && value.operatorToken.kind === ts4.SyntaxKind.PlusToken && reader.field(value.left) === key) {
        accumulations.set(value.left, key);
        continue;
      }
    }
  }
  if (!cursor) return false;
  if ((declaredFields.get(cursor.name) ?? 0) !== objects.length || cursorUpdates.size !== objects.length) return false;
  let list;
  const listRoots = /* @__PURE__ */ new Set();
  let ok = true;
  const declaredInside = /* @__PURE__ */ new Set();
  const collectDeclared = (node) => {
    if ((ts4.isVariableDeclaration(node) || ts4.isParameter(node) || ts4.isBindingElement(node)) && ts4.isIdentifier(node.name)) declaredInside.add(node.name.text);
    if ((ts4.isFunctionDeclaration(node) || ts4.isFunctionExpression(node)) && node.name && node !== fn) declaredInside.add(node.name.text);
    ts4.forEachChild(node, collectDeclared);
  };
  collectDeclared(fn);
  const listAt = /* @__PURE__ */ new Set();
  const visit = (node) => {
    if (!ok) return;
    if (ts4.isBinaryExpression(node) && node.operatorToken.kind >= ts4.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts4.SyntaxKind.LastAssignment) {
      let target = unwrap(node.left);
      while (ts4.isPropertyAccessExpression(target) || ts4.isElementAccessExpression(target)) target = unwrap(target.expression);
      if (!ts4.isIdentifier(target) || !declaredInside.has(target.text)) {
        ok = false;
        return;
      }
    }
    if ((ts4.isPrefixUnaryExpression(node) || ts4.isPostfixUnaryExpression(node)) && (node.operator === ts4.SyntaxKind.PlusPlusToken || node.operator === ts4.SyntaxKind.MinusMinusToken)) {
      const target = unwrap(node.operand);
      if (!ts4.isIdentifier(target) || !declaredInside.has(target.text)) {
        ok = false;
        return;
      }
    }
    if (reader.isWhole(node)) {
      if (!unchanged.has(node)) ok = false;
      return;
    }
    const read = reader.field(node);
    if (read !== void 0) {
      if (read === cursor.name) {
        if (cursor.kind === "index") {
          const parent2 = node.parent;
          if (ts4.isElementAccessExpression(parent2) && unwrap(parent2.argumentExpression) === unwrap(node)) {
            const text = unwrap(parent2.expression).getText(file);
            if (list !== void 0 && list !== text) {
              ok = false;
              return;
            }
            list = text;
            listAt.add(parent2.expression);
            const root = rootIdentifier(parent2.expression);
            if (root) listRoots.add(root);
          }
          return;
        }
        const parent = node.parent;
        if (ts4.isElementAccessExpression(parent) && parent.expression === node && ts4.isNumericLiteral(unwrap(parent.argumentExpression)) && unwrap(parent.argumentExpression).text === "0") return;
        if (ts4.isPropertyAccessExpression(parent) && parent.expression === node && parent.name.text === "length") return;
        if (ts4.isPropertyAccessExpression(parent) && parent.expression === node && parent.name.text === "slice" && cursorUpdates.has(parent.parent)) return;
        ok = false;
        return;
      }
      if (unchanged.has(unwrap(node)) || accumulations.get(node) === read) return;
      ok = false;
      return;
    }
    ts4.forEachChild(node, visit);
  };
  visit(fn.body);
  if (!ok) return false;
  if (cursor.kind === "index") {
    if (list === void 0) return false;
    const fixed = (node) => {
      if (ts4.isExpression(node) && !listAt.has(node) && unwrap(node).getText(file) === list) {
        const parent = node.parent;
        if (ts4.isPropertyAccessExpression(parent) && parent.expression === node && parent.name.text === "length") return true;
        return false;
      }
      return ts4.forEachChild(node, (child) => fixed(child) ? void 0 : true) === void 0;
    };
    if (!fixed(fn.body)) return false;
    if (!/^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*$/.test(list)) return false;
    if ([...listRoots].some((root) => declaredInside.has(root))) return false;
  }
  if (!until) return false;
  const predicate2 = unwrap(until);
  if (!ts4.isArrowFunction(predicate2) && !ts4.isFunctionExpression(predicate2)) return false;
  const stop = stateReader(predicate2);
  if (!stop) return false;
  let readsOther = false;
  const check = (node) => {
    if (readsOther) return;
    if (stop.isWhole(node)) {
      readsOther = true;
      return;
    }
    const read = stop.field(node);
    if (read !== void 0 && read !== cursor.name) {
      readsOther = true;
      return;
    }
    if (ts4.isCallExpression(node)) {
      readsOther = true;
      return;
    }
    ts4.forEachChild(node, check);
  };
  check(predicate2.body);
  return !readsOther;
}
function rootIdentifier(node) {
  node = unwrap(node);
  while (ts4.isPropertyAccessExpression(node) || ts4.isElementAccessExpression(node)) node = unwrap(node.expression);
  return ts4.isIdentifier(node) ? node.text : void 0;
}
function checkFixedCursorIterations(file, displayPath = (source) => source.fileName) {
  const out = [];
  const untilOf = (call) => {
    let node = call;
    while (ts4.isPropertyAccessExpression(node.parent) && node.parent.expression === node && ts4.isCallExpression(node.parent.parent) && node.parent.parent.expression === node.parent) {
      const member = node.parent.name.text;
      if (member === "until") return node.parent.parent.arguments[0];
      if (member !== "withLimit" && member !== "withMeasure") return void 0;
      node = node.parent.parent;
    }
    return void 0;
  };
  const visit = (node) => {
    if (ts4.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      let step;
      if (ts4.isIdentifier(callee) && callee.text === "iterateOn" && node.arguments.length >= 2) step = node.arguments[0];
      else if (ts4.isPropertyAccessExpression(callee) && callee.name.text === "iterateOn" && node.arguments.length >= 1) step = callee.expression;
      const fn = step && stepFunction(file, step);
      if (fn && fixedCursorStep(file, fn, untilOf(node))) {
        const start = node.getStart(file), position = file.getLineAndCharacterOfPosition(start);
        out.push({
          file: displayPath(file),
          start,
          end: node.end,
          line: position.line + 1,
          column: position.character + 1,
          code: IDIOM_FIXED_CURSOR_ITERATE,
          severity: "warning",
          message: "This `iterateOn` steps through a fixed list one item at a time: map the step over the list with `Promise.all`, and keep `iterateOn` for steps that depend on the previous state."
        });
      }
    }
    ts4.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

// src/compiler/refined-slots.ts
function refinedPredicates(type, env, path, seen = /* @__PURE__ */ new Set()) {
  const out = [];
  const walk = (current, at, depth) => {
    if (depth > 24) return;
    if (current.kind === "name") {
      const key = `${at}\0${current.name}`;
      const found = env.lookup(current.name);
      if (!found || seen.has(key)) return;
      seen.add(key);
      return walk(found, at, depth + 1);
    }
    switch (current.kind) {
      case "refined": {
        const chain = refinementChain(current, env);
        for (const predicate2 of chain.predicates) out.push({ slot: at, predicate: predicate2 });
        return walk(chain.base, at, depth + 1);
      }
      case "untrusted":
        return walk(current.base, at, depth + 1);
      case "list":
        return walk(current.element, `${at}[]`, depth + 1);
      case "tuple":
        current.elements.forEach((el, i) => walk(el, `${at}[${i}]`, depth + 1));
        return;
      case "dict":
        return walk(current.element, `${at}{}`, depth + 1);
      case "record":
        for (const field of current.fields) walk(field.type, `${at}.${field.name}`, depth + 1);
        return;
      case "union":
      case "intersection":
        for (const member of current.members) walk(member, at, depth + 1);
        return;
      case "utility": {
        try {
          return walk(env.resolve(current), at, depth + 1);
        } catch {
          return;
        }
      }
      default:
        return;
    }
  };
  walk(type, path, 0);
  return out;
}
function refinedSlotsOf(source, name, args, returns, types) {
  try {
    const env = new TypeEnv(parseAliases(types));
    const slots = [...Object.entries(args).map(([raw, text]) => ({ path: raw.replace(/\?$/, ""), text })), { path: "return", text: returns }].flatMap(({ path, text }) => refinedPredicates(parseTypeCached(text), env, path));
    return slots.map((slot) => ({ source, function: name, ...slot }));
  } catch {
    return [];
  }
}

// src/compiler/project.ts
import ts7 from "typescript";

// src/compiler/rewrites.ts
import ts5 from "typescript";
var REWRITE_RULES = ["map-fusion", "read-map", "map-identity", "combine-reassociate", "combine-identity", "split-zip"];
var NO_REWRITE_MARKER = "natlang-no-rewrite";
var RewriteGate = class _RewriteGate {
  constructor(version, measurements = [], options = {}) {
    this.version = version;
    const disabled = new Set(options.disabled ?? []);
    const latest = /* @__PURE__ */ new Map();
    for (const measurement of measurements) {
      if (measurement.model !== version.model || measurement.dialect !== version.dialect) continue;
      const previous = latest.get(measurement.rule);
      if (!previous || (measurement.measuredAt ?? "") >= (previous.measuredAt ?? "")) latest.set(measurement.rule, measurement);
    }
    for (const [rule, measurement] of latest) if (measurement.verdict === "no-harm" && !disabled.has(rule)) this.#enabled.set(rule, measurement);
  }
  version;
  #enabled = /* @__PURE__ */ new Map();
  /** Every rule off: no comparisons yet. */
  static off(version = { model: "unknown", dialect: "unknown" }) {
    return new _RewriteGate(version);
  }
  enabled(rule) {
    return this.#enabled.get(rule);
  }
  /** The enabled set, recorded in each trace's manifest. */
  enabledRules() {
    return [...this.#enabled.keys()].sort();
  }
};
var COMBINATORS = /* @__PURE__ */ new Set(["map", "read", "combine", "empty", "split", "zip", "compose"]);
function combinatorOf(node) {
  if (!ts5.isCallExpression(node)) return;
  const callee = node.expression;
  const name = ts5.isIdentifier(callee) ? callee.text : ts5.isPropertyAccessExpression(callee) ? callee.name.text : void 0;
  return name && COMBINATORS.has(name) ? name : void 0;
}
function operand(node) {
  let inner = node;
  while (ts5.isParenthesizedExpression(inner)) inner = inner.expression;
  if (ts5.isAwaitExpression(inner)) {
    let call = inner.expression;
    while (ts5.isParenthesizedExpression(call)) call = call.expression;
    return { call, awaited: true };
  }
  return { call: inner, awaited: false };
}
function pure(node) {
  if (ts5.isParenthesizedExpression(node)) return pure(node.expression);
  if (ts5.isIdentifier(node) || ts5.isLiteralExpression(node) || ts5.isNoSubstitutionTemplateLiteral(node) || node.kind === ts5.SyntaxKind.TrueKeyword || node.kind === ts5.SyntaxKind.FalseKeyword || node.kind === ts5.SyntaxKind.NullKeyword || ts5.isArrowFunction(node) || ts5.isFunctionExpression(node)) return true;
  if (ts5.isPropertyAccessExpression(node)) return pure(node.expression);
  if (ts5.isArrayLiteralExpression(node)) return node.elements.every((element) => ts5.isExpression(element) && pure(element));
  if (ts5.isCallExpression(node) && combinatorOf(node) === "compose") return node.arguments.every(pure);
  return false;
}
function isIdentity(node) {
  while (ts5.isParenthesizedExpression(node)) node = node.expression;
  const fn = ts5.isArrowFunction(node) || ts5.isFunctionExpression(node) ? node : void 0;
  if (!fn || fn.parameters.length !== 1 || !ts5.isIdentifier(fn.parameters[0].name)) return false;
  const name = fn.parameters[0].name.text;
  const body = ts5.isBlock(fn.body) ? fn.body.statements.length === 1 && ts5.isReturnStatement(fn.body.statements[0]) ? fn.body.statements[0].expression : void 0 : fn.body;
  let value = body;
  while (value && ts5.isParenthesizedExpression(value)) value = value.expression;
  return !!value && ts5.isIdentifier(value) && value.text === name;
}
function hasEffect(node) {
  let found = false;
  const visit = (item) => {
    if (found || ts5.isArrowFunction(item) || ts5.isFunctionExpression(item) || ts5.isFunctionDeclaration(item)) return;
    if (ts5.isCallExpression(item) && combinatorOf(item) !== "compose" || ts5.isAwaitExpression(item) || ts5.isNewExpression(item) || ts5.isDeleteExpression(item) || ts5.isBinaryExpression(item) && item.operatorToken.kind >= ts5.SyntaxKind.FirstAssignment && item.operatorToken.kind <= ts5.SyntaxKind.LastAssignment || (ts5.isPrefixUnaryExpression(item) || ts5.isPostfixUnaryExpression(item)) && (item.operator === ts5.SyntaxKind.PlusPlusToken || item.operator === ts5.SyntaxKind.MinusMinusToken)) {
      found = true;
      return;
    }
    ts5.forEachChild(item, visit);
  };
  visit(node);
  return found;
}
function rewriteCombinators(source, options) {
  const fileName = options.fileName ?? "program.ts";
  const file = ts5.createSourceFile(fileName, source, ts5.ScriptTarget.ES2022, true, ts5.ScriptKind.TS);
  const applied = [];
  const skipped = [];
  const siteOf = (node) => {
    const original = ts5.getOriginalNode(node);
    const start = original.pos >= 0 && original.getSourceFile() ? original.getStart(file) : 0;
    const { line, character } = file.getLineAndCharacterOfPosition(start);
    return `${fileName}:${line + 1}:${character + 1}`;
  };
  const spanOf2 = (node) => {
    const original = ts5.getOriginalNode(node);
    return original.pos >= 0 ? `${fileName}#${original.getStart(file)}-${original.getEnd()}` : `${fileName}#synthesized`;
  };
  const marked = (node) => {
    for (let current = ts5.getOriginalNode(node); current && current.pos >= 0; current = current.parent) {
      const ranges = ts5.getLeadingCommentRanges(source, current.getFullStart()) ?? [];
      if (ranges.some((range) => source.slice(range.pos, range.end).includes(NO_REWRITE_MARKER))) return true;
      if (ts5.isStatement(current) && !ts5.isBlock(current)) break;
    }
    return false;
  };
  const allowed = (rule, node) => {
    const site = siteOf(node);
    if (options.disabled) {
      skipped.push({ rule, site, reason: "disabled-program" });
      return;
    }
    if (marked(node)) {
      skipped.push({ rule, site, reason: "disabled-site" });
      return;
    }
    const measurement = options.gate.enabled(rule);
    if (!measurement) {
      skipped.push({ rule, site, reason: "not-enabled" });
      return;
    }
    return measurement;
  };
  const record = (rule, node, measurement, replaced) => applied.push({ rule, site: siteOf(node), enabled_by: measurement.comparison, replaced: replaced.map(spanOf2) });
  const transformer = (context) => {
    const f = context.factory;
    const introduced = /* @__PURE__ */ new Map();
    const callNamed = (like, name, args) => {
      const callee = like.expression;
      if (ts5.isIdentifier(callee) && callee.text !== name) introduced.set(name, callee.text);
      const target = ts5.isPropertyAccessExpression(callee) ? f.updatePropertyAccessExpression(callee, callee.expression, f.createIdentifier(name)) : f.createIdentifier(name);
      return f.createCallExpression(target, void 0, args);
    };
    const withImports = (out) => {
      if (!introduced.size) return out;
      const statements = out.statements.map((statement) => {
        if (!ts5.isImportDeclaration(statement) || !ts5.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== "natlang:neuralese") return statement;
        const bindings = statement.importClause?.namedBindings;
        if (!bindings || !ts5.isNamedImports(bindings)) return statement;
        const local = new Set(bindings.elements.map((element) => element.name.text));
        const missing2 = [...introduced].filter(([name, via]) => local.has(via) && !local.has(name)).map(([name]) => name);
        if (!missing2.length) return statement;
        const elements = [
          ...bindings.elements,
          ...missing2.map((name) => f.createImportSpecifier(false, void 0, f.createIdentifier(name)))
        ];
        return f.updateImportDeclaration(
          statement,
          statement.modifiers,
          f.updateImportClause(
            statement.importClause,
            statement.importClause.isTypeOnly,
            statement.importClause.name,
            f.updateNamedImports(bindings, elements)
          ),
          statement.moduleSpecifier,
          statement.attributes
        );
      });
      return f.updateSourceFile(out, statements);
    };
    const foldIntermediates = (statements) => {
      const list = [...statements];
      for (let index = 0; index < list.length; index++) {
        const statement = list[index];
        if (!ts5.isVariableStatement(statement) || !(statement.declarationList.flags & ts5.NodeFlags.Const)) continue;
        const declarations = statement.declarationList.declarations;
        if (declarations.length !== 1 || !ts5.isIdentifier(declarations[0].name) || !declarations[0].initializer) continue;
        const name = declarations[0].name.text, initializer = declarations[0].initializer;
        const inner = operand(initializer);
        if (combinatorOf(inner.call) !== "map") continue;
        const uses = [];
        list.forEach((later, position) => {
          if (position <= index) return;
          const visit2 = (item) => {
            if (ts5.isIdentifier(item) && item.text === name && !(ts5.isPropertyAccessExpression(item.parent) && item.parent.name === item))
              uses.push({ statement: position, node: item });
            ts5.forEachChild(item, visit2);
          };
          visit2(later);
        });
        if (uses.length !== 1) continue;
        const use = uses[0];
        let argument = use.node;
        while (ts5.isParenthesizedExpression(argument.parent) || ts5.isAwaitExpression(argument.parent)) argument = argument.parent;
        const outer = argument.parent;
        if (!ts5.isCallExpression(outer) || combinatorOf(outer) !== "map" || outer.arguments[0] !== argument) continue;
        const call = inner.call;
        const between = list.slice(index + 1, use.statement);
        const blocked = between.some(hasEffect) || !call.arguments.every(pure) || !outer.arguments.slice(1).every(pure);
        if (blocked) {
          skipped.push({ rule: "map-fusion", site: siteOf(outer), reason: "effect" });
          continue;
        }
        if (!allowed("map-fusion", outer)) continue;
        const target = use.node;
        const replaceUse = (inlineContext) => (node) => {
          const visit2 = (item) => item === target ? f.createParenthesizedExpression(initializer) : ts5.visitEachChild(item, visit2, inlineContext);
          return visit2(node);
        };
        list[use.statement] = ts5.transform(list[use.statement], [replaceUse]).transformed[0];
        list.splice(index, 1);
        index--;
      }
      return list;
    };
    const visit = (node) => {
      if (ts5.isBlock(node)) node = f.updateBlock(node, foldIntermediates(node.statements));
      else if (ts5.isSourceFile(node)) node = f.updateSourceFile(node, foldIntermediates(node.statements));
      node = ts5.visitEachChild(node, visit, context);
      if (!ts5.isCallExpression(node)) return node;
      const kind2 = combinatorOf(node);
      const args = node.arguments;
      if (kind2 === "map" && args.length === 2) {
        if (isIdentity(args[1])) {
          const measurement = allowed("map-identity", node);
          if (measurement) {
            record("map-identity", node, measurement, [node]);
            return args[0];
          }
          return node;
        }
        const inner = operand(args[0]);
        if (combinatorOf(inner.call) === "map" && inner.call.arguments.length === 2) {
          const [v, g] = inner.call.arguments;
          if (!pure(args[1])) {
            skipped.push({ rule: "map-fusion", site: siteOf(node), reason: "effect" });
            return node;
          }
          const measurement = allowed("map-fusion", node);
          if (!measurement) return node;
          record("map-fusion", node, measurement, [inner.call, node]);
          return callNamed(node, "map", [v, callNamed(node, "compose", [args[1], g])]);
        }
      }
      if (kind2 === "read" && args.length === 1) {
        const inner = operand(args[0]);
        if (combinatorOf(inner.call) === "map" && inner.call.arguments.length === 2) {
          const [v, fn] = inner.call.arguments;
          if (!pure(fn) || !pure(v)) {
            skipped.push({ rule: "read-map", site: siteOf(node), reason: "effect" });
            return node;
          }
          const measurement = allowed("read-map", node);
          if (!measurement || measurement.direction === "reverse") return node;
          record("read-map", node, measurement, [inner.call, node]);
          return f.createCallExpression(f.createParenthesizedExpression(fn), void 0, [f.createAwaitExpression(callNamed(node, "read", [v]))]);
        }
      }
      if (kind2 === "combine" && args.length === 2) {
        const right = operand(args[1]);
        if (combinatorOf(right.call) === "empty") {
          const measurement = allowed("combine-identity", node);
          if (measurement) {
            record("combine-identity", node, measurement, [right.call, node]);
            return args[0];
          }
          return node;
        }
        const leaves = [];
        let chain = node;
        const replaced = [];
        while (true) {
          const current = operand(chain);
          if (combinatorOf(current.call) !== "combine" || current.call.arguments.length !== 2) break;
          const call = current.call;
          replaced.push(call);
          leaves.unshift(call.arguments[1]);
          chain = call.arguments[0];
        }
        leaves.unshift(chain);
        if (leaves.length >= 4 && leaves.every(pure)) {
          const measurement = allowed("combine-reassociate", node);
          if (!measurement) return node;
          record("combine-reassociate", node, measurement, replaced);
          const balanced = (items) => items.length === 1 ? items[0] : f.createAwaitExpression(callNamed(node, "combine", [
            balanced(items.slice(0, Math.ceil(items.length / 2))),
            balanced(items.slice(Math.ceil(items.length / 2)))
          ]));
          const tree = balanced(leaves);
          return ts5.isAwaitExpression(tree) ? tree.expression : tree;
        }
      }
      if (kind2 === "split" && args.length === 1) {
        const inner = operand(args[0]);
        if (combinatorOf(inner.call) === "zip" && inner.call.arguments.length === 2) {
          const [a, b] = inner.call.arguments;
          const measurement = allowed("split-zip", node);
          if (!measurement) return node;
          record("split-zip", node, measurement, [inner.call, node]);
          return f.createObjectLiteralExpression([
            f.createPropertyAssignment(f.createNumericLiteral(0), a),
            f.createPropertyAssignment(f.createNumericLiteral(1), b)
          ]);
        }
      }
      return node;
    };
    return (root) => withImports(visit(root));
  };
  const result = ts5.transform(file, [transformer]);
  const transformed = result.transformed[0];
  const code = applied.length ? ts5.createPrinter({ newLine: ts5.NewLineKind.LineFeed }).printFile(transformed) : source;
  result.dispose();
  return { code, applied, skipped };
}

// src/compiler/call-flow.ts
import ts6 from "typescript";
function memberStage(record, names) {
  let current = record;
  for (const name of names) {
    const child = current.codebase[name];
    if (!child) return void 0;
    current = child;
  }
  return current.kind === "natlang" ? current : void 0;
}
function calleeOf(call, imports) {
  const names = [];
  let expression = call.expression;
  while (ts6.isPropertyAccessExpression(expression)) {
    names.unshift(expression.name.text);
    expression = expression.expression;
  }
  if (!ts6.isIdentifier(expression)) return void 0;
  const root = imports.get(expression.text);
  if (!root) return void 0;
  const stage = names.length ? memberStage(root, names) : root.kind === "natlang" ? root : void 0;
  return stage ? { stage, path: [expression.text, ...names].join(".") } : void 0;
}
var transparent = (node) => ts6.isParenthesizedExpression(node) || ts6.isAwaitExpression(node) || ts6.isAsExpression(node) || ts6.isNonNullExpression(node);
var unwrap2 = (node) => {
  let current = node;
  while (transparent(current)) current = current.expression;
  return current;
};
function nestedCall(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts6.isCallExpression(current)) return current;
    if (!(ts6.isParenthesizedExpression(current) || ts6.isAwaitExpression(current) || ts6.isAsExpression(current))) return void 0;
  }
  return void 0;
}
var argumentPosition = (call, node) => call.arguments.findIndex((argument) => argument === node || node.pos >= argument.pos && node.end <= argument.end);
var lineIn = (ctx, node) => ctx.file.getLineAndCharacterOfPosition(node.getStart(ctx.file)).line + 1 - ctx.lineOffset;
var siteIn = (ctx, node) => `${ctx.fileName}:${lineIn(ctx, node)}`;
function useOf(ctx, node) {
  const site = siteIn(ctx, node);
  const call = nestedCall(node);
  const asArgument = !!call && call.arguments.some((argument) => unwrap2(argument) === unwrap2(node));
  const callee = call && asArgument ? calleeOf(call, ctx.imports) : void 0;
  if (callee) return {
    reader: { kind: "consumer", name: callee.path, site, detail: `argument of ${callee.path}`, certain: true },
    consumer: callee,
    position: argumentPosition(call, node),
    call
  };
  if (ts6.isReturnStatement(node.parent) || node.parent && ts6.isReturnStatement(node.parent.parent ?? node.parent))
    return { reader: { kind: "host-return", site, detail: ctx.mode === "eval" ? "returned by the orchestrator" : "returned to the caller", certain: true } };
  if (call && asArgument) {
    const text = call.expression.getText(ctx.file);
    const crisp = ctx.mode === "crisp-typescript" || ctx.imports.get(text.split(".")[0])?.kind === "module";
    return { reader: { kind: crisp ? "crisp-code" : "service", name: text, site, detail: `passed to ${text}`, certain: true } };
  }
  return { reader: {
    kind: ctx.mode === "eval" ? "eval" : "crisp-code",
    site,
    detail: `${ctx.mode === "eval" ? "read by the orchestrating model" : "read by crisp code"}: ${node.parent.getText(ctx.file).slice(0, 60)}`,
    certain: true
  } };
}
function flowOfCall(ctx, node) {
  const outer = nestedCall(node);
  const parent = node.parent;
  const direct = outer && outer !== node && (ts6.isAwaitExpression(parent) || ts6.isParenthesizedExpression(parent) || parent === outer);
  const consumer = direct ? calleeOf(outer, ctx.imports) : void 0;
  if (consumer && outer.arguments.some((argument) => unwrap2(argument) === node))
    return { form: "nested", variable: null, anchor: node, uses: [{ reader: {
      kind: "consumer",
      name: consumer.path,
      site: `${ctx.fileName}:${lineIn(ctx, outer)}`,
      detail: `argument of ${consumer.path}`,
      certain: true
    }, consumer, position: argumentPosition(outer, node), call: outer }] };
  let declaration = parent;
  while (declaration && transparent(declaration)) declaration = declaration.parent;
  if (declaration && ts6.isVariableDeclaration(declaration) && ts6.isIdentifier(declaration.name)) {
    const bound = declaration;
    const name = declaration.name.text;
    let region = ctx.file;
    for (let current = declaration.parent; current; current = current.parent)
      if (ts6.isFunctionLike(current) || ts6.isSourceFile(current)) {
        region = current;
        break;
      }
    const uses = [];
    const find = (item) => {
      if (ts6.isIdentifier(item) && item.text === name && item !== bound.name && !(ts6.isPropertyAccessExpression(item.parent) && item.parent.name === item)) uses.push(useOf(ctx, item));
      ts6.forEachChild(item, find);
    };
    find(region);
    const statement = bound.parent?.parent;
    if (statement && ts6.isVariableStatement(statement) && statement.modifiers?.some((modifier) => modifier.kind === ts6.SyntaxKind.ExportKeyword))
      uses.push({ reader: { kind: "host-return", site: siteIn(ctx, bound), detail: `${name} is exported`, certain: true } });
    return { form: "bound", variable: name, uses, anchor: declaration };
  }
  return { form: "loose", variable: null, uses: [useOf(ctx, node)], anchor: node };
}
var siteKey = (fileName, node, file) => `${fileName}@${node.getStart(file)}`;
function fusionCallSites(file, modulePath, importedNames) {
  const marks = /* @__PURE__ */ new Map();
  if (!importedNames.size) return marks;
  const ctx = { file, fileName: modulePath, imports: importedNames, mode: "crisp-typescript", lineOffset: 0 };
  const mark = (call) => marks.set(`${call.getStart(file)}:${call.getEnd()}`, siteKey(modulePath, call, file));
  const walk = (node) => {
    if (ts6.isCallExpression(node) && calleeOf(node, importedNames)) {
      const flow = flowOfCall(ctx, node);
      const consumers = flow.form === "loose" ? [] : flow.uses.filter((use) => use.consumer && use.call);
      if (consumers.length) {
        mark(node);
        for (const use of consumers) mark(use.call);
      }
    }
    ts6.forEachChild(node, walk);
  };
  walk(file);
  return marks;
}

// src/compiler/project.ts
var dirname = (path) => {
  const at = path.lastIndexOf("/");
  return at <= 0 ? "/" : path.slice(0, at);
};
var resolve = (...parts) => {
  let path = "";
  for (const part of parts) path = part.startsWith("/") ? part : `${path}/${part}`;
  return normalizeSourcePath(path);
};
var relative = (from, to) => {
  const a = normalizeSourcePath(from).split("/").filter(Boolean), b = normalizeSourcePath(to).split("/").filter(Boolean);
  let index = 0;
  while (index < a.length && a[index] === b[index]) index++;
  return [...a.slice(index).map(() => ".."), ...b.slice(index)].join("/");
};
var sep = "/";
var basename = (path, extension) => {
  const base = path.slice(path.lastIndexOf("/") + 1);
  return extension && base.endsWith(extension) ? base.slice(0, -extension.length) : base;
};
var extname = (path) => {
  const base = basename(path);
  const at = base.lastIndexOf(".");
  return at > 0 ? base.slice(at) : "";
};
function sourceFiles(files, root) {
  return {
    join: joinSourcePath,
    dirname,
    basename,
    extname,
    isFile: (path) => files.isFile(path),
    isDirectory: (path) => files.isDirectory(path),
    read: (path) => files.read(path),
    list: (path) => files.list(path),
    relative: (path) => relative(root, path)
  };
}
var SKIPPED_DIRS = /* @__PURE__ */ new Set(["node_modules", "dist", ".git", ".natlang"]);
function callableFolders(files, root) {
  const named2 = [], contexts = [], folders = /* @__PURE__ */ new Set();
  const mark = (dir) => {
    folders.add(dir);
    for (const entry of files.list(dir)) {
      const path = joinSourcePath(dir, entry);
      if (files.isDirectory(path)) mark(path);
    }
  };
  const walk = (dir, inPackage) => {
    for (const entry of files.list(dir).sort()) {
      if (SKIPPED_DIRS.has(entry) || entry.startsWith(".")) continue;
      const path = joinSourcePath(dir, entry);
      if (files.isDirectory(path)) {
        if (folders.has(path)) continue;
        const isPackage = files.isFile(joinSourcePath(path, "natlang.json"));
        if (isPackage && inPackage) continue;
        if (entry === "natlang.d") {
          contexts.push(path);
          mark(path);
          continue;
        }
        if (files.isFile(`${path}.nl`)) {
          mark(path);
          continue;
        }
        walk(path, inPackage || isPackage);
      } else if (entry.endsWith(".nl")) named2.push(path);
    }
  };
  walk(root, files.isFile(joinSourcePath(root, "natlang.json")));
  return { named: named2, contexts, folders };
}
var aliasBlock = (types) => {
  const known = new Set(Object.keys(types));
  return Object.entries(types).map(([name, text]) => `type ${name} = ${typeScriptText(text, known)};`).join("\n");
};
function itemType(record, known) {
  const children = Object.entries(record.codebase).map(([name, child]) => `readonly ${name}: ${itemType(child, known)}`);
  const members = children.length ? ` & { ${children.join("; ")} }` : "";
  if (record.kind === "namespace") return `{ ${children.join("; ")} }`;
  if (record.kind === "module") {
    const exports = Object.entries(record.exports).filter(([name]) => name !== "default").map(([name, spec]) => spec.kind === "function" ? `readonly ${name}: (${Object.entries(spec.args).map(([raw, type]) => `${raw.replace(/\?$/, "")}${raw.endsWith("?") ? "?" : ""}: ${typeScriptText(type, known)}`).join(", ")}) => ${spec.async ? `Promise<${typeScriptText(spec.returns, known)}>` : typeScriptText(spec.returns, known)}` : `readonly ${name}: ${spec.type ? typeScriptText(spec.type, known) : "unknown"}`);
    const main = record.exports.default;
    const body = `{ ${[...exports, ...children].join("; ")} }`;
    if (main?.kind !== "function") return body;
    const params2 = Object.entries(main.args).map(([raw, type]) => `${raw.replace(/\?$/, "")}${raw.endsWith("?") ? "?" : ""}: ${typeScriptText(type, known)}`);
    return `((${params2.join(", ")}) => ${main.async ? `Promise<${typeScriptText(main.returns, known)}>` : typeScriptText(main.returns, known)}) & ${body}`;
  }
  const params = Object.entries(record.args).map(([raw, type]) => `${raw.replace(/\?$/, "")}${raw.endsWith("?") ? "?" : ""}: ${typeScriptText(type, known)}`);
  if (record.subtype === "directory-reducer") params.unshift("folder: Folder");
  if (record.generic) return `NatlangGenericFunction<[${params.join(", ")}], ${typeScriptText(record.generic.constraint, known)}, ${typeScriptText(record.returns, known)}>${members}`;
  return `NatlangFunction<[${params.join(", ")}], ${typeScriptText(record.returns, known)}>${members}`;
}
function natlangDeclaration(record, runtimeSpecifier) {
  const collect2 = {};
  const gather = (item) => {
    if (item.kind !== "namespace") Object.assign(collect2, item.types);
    for (const child of Object.values(item.codebase)) gather(child);
  };
  gather(record);
  const known = new Set(Object.keys(collect2));
  const body = `${aliasBlock(collect2)}
declare const fn: ${itemType(record, known)};
export default fn;
`;
  const refined = (/\bIs\s*</.test(body) ? ", Is" : "") + (/\bUntrusted\s*</.test(body) ? ", Untrusted" : "") + (/\bNatlangGenericFunction</.test(body) ? ", NatlangGenericFunction" : "");
  return `// Generated by natlang from ${record.name}.nl; do not edit.
import type { NatlangFunction, Folder as FolderStore, FolderHandle${refined} } from ${JSON.stringify(runtimeSpecifier)};
/** A natlang \`Folder\` accepts a whole folder or a directory handle within one. */
type Folder = FolderStore | FolderHandle;
` + body;
}
var SERVICES_FALLBACK = "/__natlang__/services.d.ts";
var DEFAULT_REWRITE_GATE = new RewriteGate({ model: "unmeasured", dialect: "unmeasured" });
var isRewriteRule = (value) => typeof value === "string" && REWRITE_RULES.includes(value);
var isRuleMeasurement = (value) => {
  if (!value || typeof value !== "object") return false;
  const item = value;
  return isRewriteRule(item.rule) && typeof item.model === "string" && typeof item.dialect === "string" && typeof item.comparison === "string" && (item.verdict === "no-harm" || item.verdict === "harm" || item.verdict === "inconclusive");
};
function loadRewriteGate(files, root) {
  const manifestPath = joinSourcePath(root, "natlang.json");
  if (!files.isFile(manifestPath)) return DEFAULT_REWRITE_GATE;
  let manifest;
  try {
    manifest = JSON.parse(files.read(manifestPath));
  } catch {
    return DEFAULT_REWRITE_GATE;
  }
  const rewritesConfig = manifest?.rewrites;
  if (!rewritesConfig || typeof rewritesConfig !== "object" || Array.isArray(rewritesConfig)) return DEFAULT_REWRITE_GATE;
  const config = rewritesConfig;
  if (typeof config.measurements !== "string" || !config.measurements.trim()) return DEFAULT_REWRITE_GATE;
  const measurementsPath = resolve(root, config.measurements);
  if (!files.isFile(measurementsPath)) return DEFAULT_REWRITE_GATE;
  let parsed;
  try {
    parsed = JSON.parse(files.read(measurementsPath));
  } catch {
    return DEFAULT_REWRITE_GATE;
  }
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : void 0;
  const rawList = Array.isArray(parsed) ? parsed : Array.isArray(record?.measurements) ? record.measurements : [];
  const measurements = rawList.filter(isRuleMeasurement);
  if (!measurements.length) return DEFAULT_REWRITE_GATE;
  const manifestModel = typeof manifest.model === "string" ? manifest.model : manifest.model && typeof manifest.model === "object" && !Array.isArray(manifest.model) ? manifest.model.model ?? manifest.model.stock ?? manifest.model.profile : void 0;
  const parsedVersion = record?.version && typeof record.version === "object" && !Array.isArray(record.version) ? record.version : void 0;
  const model = typeof config.model === "string" ? config.model : typeof parsedVersion?.model === "string" ? parsedVersion.model : typeof record?.model === "string" ? record.model : typeof manifestModel === "string" ? manifestModel : "unmeasured";
  const dialect = typeof config.dialect === "string" ? config.dialect : typeof parsedVersion?.dialect === "string" ? parsedVersion.dialect : typeof record?.dialect === "string" ? record.dialect : "unmeasured";
  const disabledRaw = Array.isArray(config.disabled) ? config.disabled : Array.isArray(record?.disabled) ? record.disabled : [];
  const disabled = disabledRaw.filter(isRewriteRule);
  return new RewriteGate({ model, dialect }, measurements, disabled.length ? { disabled } : {});
}
var NEURALESE_MODULES = "/__natlang__/neuralese-modules.d.ts";
var NEURALESE_MODULES_SOURCE = `
declare module 'natlang:neuralese' {
  type N<T> = Neuralese<T>;
  export function map<A, B>(v: N<A>, f: (a: A) => Promise<B>): Promise<N<B>>;
  export function zip<A, B>(a: N<A>, b: N<B>): Promise<N<[A, B]>>;
  export function ap<A, B>(f: N<(a: A) => Promise<B>>, a: N<A> | A): Promise<N<B>>;
  export function combine<T>(...vs: N<T>[]): Promise<N<T>>;
  export function empty<T>(): N<T>;
  export function split<T extends object>(v: N<T>): Promise<{ [K in keyof T]: N<T[K]> }>;
  export function splitList<E>(v: N<E[]>): Promise<N<E>[]>;
  export function read<T>(v: N<T>): Promise<T>;
  export function convert<T>(v: N<T>, to: string): Promise<N<T>>;
  /** f after g, exactly; the map-fusion rewrite writes map(v, compose(f, g)) for map(map(v, g), f). */
  export function compose<A, B, C>(f: (b: B) => C | Promise<C>, g: (a: A) => B | Promise<B>): (a: A) => Promise<C>;
  export function gloss(v: N<unknown>): Promise<string>;
  /** The query operator, read(map(v, question)): the answer to question from what v holds. */
  export function ask(v: N<unknown>, question: string): Promise<string>;
}
declare module 'natlang:learning' {
  export interface NativeAdapter { readonly $nativeAdapter: { readonly id: string } }
  export type NativeTensorKind = 'parameter-set' | 'parameter-gradient' | 'parameter-update' | 'state-gradient' |
    'optimizer-state' | 'adapter-basis' | 'adapter-gradient' | 'derivative-program';
  export interface NativeTensor { readonly $nativeTensor: { readonly id: string; readonly kind: NativeTensorKind } }
  export interface Loss { readonly __natlangLoss: true; valueOf(): number }
  export interface Gradient<A> { readonly __natlangGradient: A }
  export interface Trajectory { readonly id: string }
  export interface OptimizerState<A> { readonly __natlangOptimizer: A }
  export interface Optimizer {
    init<A>(a: A): OptimizerState<A>;
    step<A>(state: { value: A; opt: OptimizerState<A> }, grad: Gradient<A>): Promise<{ value: A; opt: OptimizerState<A> }>;
  }
  export function grad<A>(f: (a: A) => Promise<Loss>, a: A, options?: { order?: 1 | 2 }): Promise<Gradient<A>>;
  export function valueAndGrad<A>(f: (a: A) => Promise<Loss>, a: A, options?: { order?: 1 | 2 }): Promise<{ loss: Loss; grad: Gradient<A> }>;
  export function stopGradient<T>(v: T): T;
  export function withNativeStates<T>(states: string | readonly string[], fn: () => Promise<T> | T): Promise<T>;
  export function withNativeAdapters<T>(adapters: NativeAdapter | readonly (NativeAdapter | { adapter: NativeAdapter; scale?: number })[], fn: () => Promise<T> | T): Promise<T>;
  export const nativeStates: {
    gradient(graph: { schema: 'natlang.neuralese-native-graph/1'; split: string }, id: string,
      nativeIdentity: { architecture: string; checkpoint_sha256: string; tokenizer_fingerprint: string; embedding_weight_sha256: string },
      options?: { nativeStateModes?: Record<string, 'same-base-adapter-state'>; objective?: 'graph-ce' }): Promise<unknown>;
    optimize(gradient: unknown,
      nativeIdentity: { architecture: string; checkpoint_sha256: string; tokenizer_fingerprint: string; embedding_weight_sha256: string },
      optimizer: { name: 'sgd' | 'adam'; learning_rate?: number; weight_decay?: number; beta1?: number; beta2?: number; eps?: number; momentum?: number },
      optimizerStateId?: string): Promise<unknown>;
  };
  export const nativeGraph: {
    gradient(f: () => Promise<Loss>, target: { kind: 'model-parameters'; names: string[] } | { kind: 'native-state' | 'adapter'; id: string; names?: string[] },
      nativeIdentity: { architecture: string; checkpoint_sha256: string; tokenizer_fingerprint: string; embedding_weight_sha256: string },
      options?: { nativeStateModes?: Record<string, 'same-base-adapter-state'> }): Promise<unknown>;
  };
  /** Run fn with soft forms of the runtime prompt pieces (piece ID \u2192 Neuralese<SystemPrompt>); differentiable like any soft value. */
  export function withSystemPrompts<T>(prompts: Record<string, Neuralese<string>>, fn: () => Promise<T> | T): Promise<T>;
  export const nativeAdapters: {
    create(nativeIdentity: { architecture: string; checkpoint_sha256: string; tokenizer_fingerprint: string; embedding_weight_sha256: string },
      options: { parameterNames: string[]; kind?: 'xs'; rank?: number; seed?: number }): Promise<NativeAdapter>;
    ref(id: string): NativeAdapter;
    optimize(gradient: unknown,
      nativeIdentity: { architecture: string; checkpoint_sha256: string; tokenizer_fingerprint: string; embedding_weight_sha256: string },
      optimizer: { name: 'sgd' | 'adam'; learning_rate?: number; weight_decay?: number; beta1?: number; beta2?: number; eps?: number; momentum?: number },
      optimizerStateId?: string): Promise<unknown>;
  };
  export type FilePatch = { readonly schema: 'natlang.file-patch/1'; readonly base: string; readonly changes: Readonly<Record<string, string | null>> };
  export const deltas: {
    diff(after: NativeAdapter, base: NativeAdapter): Promise<NativeAdapter>;
    apply(base: NativeAdapter, delta: NativeAdapter, scale?: number): Promise<NativeAdapter>;
    compose(deltas: readonly (NativeAdapter | { delta: NativeAdapter; scale?: number })[]): Promise<NativeAdapter>;
    interference(base: NativeAdapter, deltas: readonly NativeAdapter[], measure: (value: NativeAdapter) => Promise<number>):
      Promise<{ base: number; alone: number[]; joint: number; interference: number }>;
    learnMerge(base: NativeAdapter, deltas: readonly NativeAdapter[], loss: (value: NativeAdapter) => Promise<Loss>,
      options?: { steps?: number; lr?: number; init?: number | number[] }):
      Promise<{ coefficients: number[]; value: NativeAdapter; trace: { loss: number; coefficients: number[] }[] }>;
    diffFiles(after: Readonly<Record<string, string>>, base: Readonly<Record<string, string>>): FilePatch;
    applyPatch(files: Readonly<Record<string, string>>, patch: FilePatch, options?: { strict?: boolean }): Record<string, string>;
    composePatches(patches: readonly FilePatch[]): FilePatch;
  };
  export function trajectory(run: Promise<unknown> | (() => Promise<unknown>)): Promise<Trajectory>;
  export const objectives: {
    crossEntropy(output: Promise<unknown>, expected: unknown): Promise<Loss>;
    selfDistill(output: Promise<unknown>, withFullSource: () => Promise<unknown>): Promise<Loss>;
    decision(output: Promise<unknown> | (() => Promise<unknown>), expected: unknown, rule?: 'logLoss' | 'brier' | 'rps'): Promise<Loss>;
    expectedReward(output: Promise<unknown> | (() => Promise<unknown>), reward: (value: unknown) => number | Promise<number>): Promise<Loss>;
    policyGradient(samples: { trajectory: Trajectory; reward: number }[], options?: { baseline?: 'mean' | number }): Promise<Loss>;
    conditionedDistill(student: Promise<unknown> | (() => Promise<unknown>), teacher: Promise<unknown> | (() => Promise<unknown>), options?: { privileged?: unknown; rule?: 'logLoss' | 'brier' | 'rps' }): Promise<Loss>;
    logLikelihood(trajectory: Trajectory, weight?: number): Promise<Loss>;
    law(name: 'mapIdentity' | 'mapFusion' | 'readMapCommutation' | 'combineAssociativity' | 'combineIdentity' | 'splitZip',
      ...args: unknown[]): Promise<Loss>;
    sum(...losses: Loss[]): Promise<Loss>;
    scale(loss: Loss, weight: number): Promise<Loss>;
  };
  export const optimizers: {
    sgd(options: { lr: number; momentum?: number; weightDecay?: number }): Optimizer;
    adam(options: { lr: number; betas?: [number, number]; weightDecay?: number }): Optimizer;
  };
  export function save(path: string, exports: Record<string, unknown>): Promise<{ path: string; exports: string[] }>;
  export function load(path: string): Promise<{ path: string; header: unknown; exports: Record<string, unknown>; types: Record<string, string> }>;
}
`;
var GEPA_MODULE = "/__natlang__/gepa-module.d.ts";
var GEPA_MODULE_SOURCE = `
declare module 'natlang:gepa' {
  export type Score = { caseId: string; quality: number };
  export type Member = { id: string; quality: number; scores: readonly Score[]; cost?: number; modelCalls?: number };
  export type Objective = 'quality' | 'source-size' | 'model-calls';
  export type BetterRule<T> = { eligible?: (member: T) => boolean; measure?: (member: T) => number | null };
  export function caseIds(members: readonly Member[]): string[];
  export function frontier(members: readonly Member[]): string[];
  export function frontierSet(members: readonly Member[]): Set<string>;
  export function wonCases(members: readonly Member[]): Record<string, string[]>;
  export function draw(seed: number): { value: number; next: number };
  export function pick<T>(choices: readonly T[], value: number): T;
  export function parentChoices(members: readonly Member[]): string[];
  export function drawParent(members: readonly Member[], seed: number): { id: string; next: number };
  export function better<T extends { quality: number | null }>(left: T, right: T, rule?: BetterRule<T>): boolean;
  export function objectiveMeasure(objective?: Objective): ((member: { cost?: number; modelCalls?: number }) => number | null) | undefined;
  export function leaders(members: readonly Member[], objective?: Objective): string[];
  export function chooseIncumbent(members: readonly Member[], incumbent: string, objective?: Objective): string;
  export function prune<T extends Member>(members: readonly T[], protectedIds: Iterable<string>, limit: number): T[];
  export function componentProblem(parent: Record<string, unknown>, candidate: unknown, keys: readonly string[]): string;
}
`;
function findTsconfig(files, project) {
  const absolute = normalizeSourcePath(project);
  if (files.isFile(absolute)) return { configPath: absolute, root: dirname(absolute) };
  const candidate = joinSourcePath(absolute, "tsconfig.json");
  return files.isFile(candidate) ? { configPath: candidate, root: absolute } : { root: absolute };
}
function compileProject(options) {
  const fs = options.files;
  const { configPath, root } = findTsconfig(fs, options.project);
  const diagnostics = [];
  const files = sourceFiles(fs, root);
  const rel = (path) => relative(root, path);
  const problem = (file, message, code = "callable-scope", line = 1, hint) => diagnostics.push({ file, start: 0, end: 0, line, column: 1, code, message, severity: "error", ...hint ? { hint } : {} });
  const sourceProblem = (fallback, error) => error instanceof NatlangSourceError ? problem(rel(error.path), error.reason, "callable-scope", error.line, error.hint) : problem(rel(fallback), String(error));
  const layout = callableFolders(fs, root);
  const namedRecords = /* @__PURE__ */ new Map();
  for (const path of layout.named) {
    if ([...layout.folders].some((folder) => path.startsWith(folder + sep))) continue;
    try {
      namedRecords.set(path, loadNamedFunction(path, files));
    } catch (error) {
      sourceProblem(path, error);
    }
  }
  const contextRecords = /* @__PURE__ */ new Map();
  for (const dir of layout.contexts) {
    try {
      contextRecords.set(dir, loadCallableFolder(dir, files));
    } catch (error) {
      sourceProblem(dir, error);
    }
  }
  const collectAdaptation = options.adaptation !== false;
  const optimizationComponents = [];
  const optimizationSources = {};
  const programId = options.programId ?? basename(root);
  const described = /* @__PURE__ */ new Set();
  const describeNamed = (record) => {
    if (!collectAdaptation || described.has(record.source)) return;
    described.add(record.source);
    optimizationComponents.push(namedDescriptor(programId, record));
  };
  const checkModules = (level) => {
    for (const item of Object.values(level)) {
      if (item.kind !== "namespace") item.programId = programId;
      if (collectAdaptation && item.kind !== "namespace") optimizationSources[item.source] = item.text;
      if (item.kind === "natlang") describeNamed(item);
      if (item.kind === "module" && !described.has(item.source)) {
        described.add(item.source);
        try {
          compileModule(item, level, collectAdaptation ? (plans2) => optimizationComponents.push(...plans2.map((plan) => inlineDescriptor(programId, plan))) : void 0);
        } catch (error) {
          problem(item.source, error instanceof Error ? error.message : String(error));
        }
      }
      checkModules(item.codebase);
    }
  };
  for (const record of namedRecords.values()) {
    record.programId = programId;
    if (collectAdaptation) optimizationSources[record.source] = record.text;
    describeNamed(record);
    checkModules(record.codebase);
  }
  for (const records of contextRecords.values()) checkModules(records);
  const configHost = {
    useCaseSensitiveFileNames: true,
    getCurrentDirectory: () => root,
    fileExists: (path) => fs.isFile(path),
    readFile: (path) => fs.isFile(path) ? fs.read(path) : void 0,
    readDirectory: (dir, extensions, excludes, includes, depth) => fs.compiler?.readDirectory ? fs.compiler.readDirectory(dir, extensions, excludes, includes, depth) : walkTs(fs, dir),
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => diagnostics.push(fromTypeScript(diagnostic, rel(configPath)))
  };
  const parsed = configPath ? ts7.getParsedCommandLineOfConfigFile(configPath, {}, configHost) : void 0;
  const compilerOptions = {
    target: ts7.ScriptTarget.ES2022,
    module: ts7.ModuleKind.NodeNext,
    moduleResolution: ts7.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    ...parsed?.options ?? {},
    allowArbitraryExtensions: true,
    noEmit: false,
    declaration: false,
    ...options.module === "commonjs" ? { module: ts7.ModuleKind.CommonJS, moduleResolution: ts7.ModuleResolutionKind.Node10 } : {}
  };
  const outDir = resolve(options.outDir ?? compilerOptions.outDir ?? joinSourcePath(root, "dist"));
  compilerOptions.outDir = outDir;
  compilerOptions.rootDir ??= root;
  const inFolder = (path) => [...layout.folders].some((folder) => path.startsWith(folder + sep) || path === folder);
  const rootNames = (parsed?.fileNames?.length ? parsed.fileNames : walkTs(fs, root)).filter((path) => (!inFolder(path) || path.endsWith(".d.ts")) && !path.endsWith(".d.nl.ts") && !path.endsWith(".d.nz.ts"));
  const withNeutral = (specifiers) => [.../* @__PURE__ */ new Set([...specifiers, NEUTRAL_RUNTIME_SPECIFIER])];
  const bound = options.runtimeModule && { ...options.runtimeModule, specifiers: withNeutral(options.runtimeModule.specifiers) };
  const sibling = (path, from, to) => path && from.test(path) ? path.replace(from, to) : void 0;
  const stdModule = bound && (bound.std ?? (() => {
    const url = sibling(bound.url, /\/index\.js$/, "/std/index.js"), types = sibling(bound.types, /([\\/])index\.d\.ts$/, "$1std$1index.d.ts");
    return url && types && fs.isFile(types) ? { url, types, path: sibling(bound.path, /([\\/])index\.js$/, "$1std$1index.js") } : void 0;
  })());
  const stdSpecifiers = stdModule ? options.runtimeModule.specifiers.map((specifier) => `${specifier}/std`) : [];
  if (options.runtimeTypeRoots?.length) {
    const resolutionHost = ts7.sys ?? { fileExists: (path) => fs.isFile(path), readFile: (path) => fs.isFile(path) ? fs.read(path) : void 0 };
    const missing2 = (compilerOptions.types ?? ["node"]).some((name) => !ts7.resolveTypeReferenceDirective(name, joinSourcePath(root, "index.ts"), compilerOptions, resolutionHost).resolvedTypeReferenceDirective);
    if (missing2) compilerOptions.typeRoots = [...compilerOptions.typeRoots ?? [], ...options.runtimeTypeRoots];
  }
  if (options.runtimeTypes) for (const specifier of options.runtimeTypes.specifiers) {
    const stdTypes = sibling(options.runtimeTypes.types, /([\\/])index\.d\.ts$/, "$1std$1index.d.ts");
    for (const [name, types] of [[specifier, options.runtimeTypes.types], [`${specifier}/std`, stdTypes && fs.isFile(stdTypes) ? stdTypes : void 0]]) {
      if (!types) continue;
      const resolved = ts7.resolveModuleName(name, joinSourcePath(root, "index.ts"), compilerOptions, ts7.sys ?? {
        fileExists: (path) => fs.isFile(path),
        readFile: (path) => fs.isFile(path) ? fs.read(path) : void 0
      });
      if (!resolved.resolvedModule) compilerOptions.paths = { ...compilerOptions.paths ?? {}, [name]: [types] };
    }
  }
  if (options.surfaceSpecifiers?.length) compilerOptions.paths = {
    ...compilerOptions.paths ?? {},
    ...Object.fromEntries(withNeutral(options.surfaceSpecifiers).map((specifier) => [specifier, [SURFACE_MODULE_FILE]])),
    ...Object.fromEntries(options.surfaceSpecifiers.map((specifier) => [`${specifier}/std`, [STD_MODULE_FILE]]))
  };
  if (bound) compilerOptions.paths = {
    ...compilerOptions.paths ?? {},
    ...Object.fromEntries(bound.specifiers.map((specifier) => [specifier, [bound.types]])),
    ...Object.fromEntries(stdSpecifiers.map((specifier) => [specifier, [stdModule.types]]))
  };
  const runtimeSpecifier = bound?.url ?? options.runtimeSpecifier ?? detectRuntimeSpecifier(fs, rootNames) ?? "@natlang/node";
  const declarationSpecifier = bound?.specifiers[0] ?? runtimeSpecifier;
  const rewrite = new Map((bound?.specifiers ?? []).map((specifier) => [specifier, bound.url]));
  const declarations = {};
  const virtual = /* @__PURE__ */ new Map([[SERVICES_FALLBACK, "declare module 'natlang:services' { const services: Record<string, any>; export = services; }\n"]]);
  for (const [path, record] of namedRecords) {
    const declaration = natlangDeclaration(record, declarationSpecifier);
    const target = path.replace(/\.nl$/, ".d.nl.ts");
    declarations[target] = declaration;
    virtual.set(target, declaration);
  }
  const nzFiles = /* @__PURE__ */ new Map();
  for (const path of walkNz(fs, root)) {
    if (!fs.readBytes) {
      problem(rel(path), "reading .nz files needs binary file access");
      continue;
    }
    try {
      const bytes = fs.readBytes(path);
      const loaded = loadNzSync(bytes);
      nzFiles.set(path, bytes);
      const declaration = nzDeclaration(loaded.header, basename(path), typeScriptText);
      const target = path.replace(/\.nz$/, ".d.nz.ts");
      declarations[target] = declaration;
      virtual.set(target, declaration);
    } catch (error) {
      problem(rel(path), error instanceof Error ? error.message : String(error), "neuralese-file");
    }
  }
  const usesNeuraleseModules = rootNames.some((path) => /['"]natlang:(neuralese|learning)['"]/.test(fs.read(path)));
  if (usesNeuraleseModules) virtual.set(NEURALESE_MODULES, NEURALESE_MODULES_SOURCE);
  const usesGepa = rootNames.some((path) => /['"]natlang:gepa['"]/.test(fs.read(path)));
  if (usesGepa) virtual.set(GEPA_MODULE, GEPA_MODULE_SOURCE);
  const host = createNatlangCompilerHost({
    options: compilerOptions,
    virtual,
    currentDirectory: root,
    files: fs.compiler ?? {
      readFile: (path) => fs.isFile(path) ? fs.read(path) : void 0,
      fileExists: (path) => fs.isFile(path),
      directoryExists: (path) => fs.isDirectory(path),
      getDirectories: (path) => fs.isDirectory(path) ? fs.list(path).filter((entry) => fs.isDirectory(joinSourcePath(path, entry))) : []
    }
  });
  const hasServicesDeclaration = rootNames.some((path) => /declare\s+module\s+['"]natlang:services['"]/.test(fs.read(path)));
  const program = ts7.createProgram({
    rootNames: [
      INTRINSICS_FILE,
      ...hasServicesDeclaration ? [] : [SERVICES_FALLBACK],
      ...usesNeuraleseModules ? [NEURALESE_MODULES] : [],
      ...usesGepa ? [GEPA_MODULE] : [],
      ...rootNames
    ],
    options: compilerOptions,
    host
  });
  for (const diagnostic of ts7.getPreEmitDiagnostics(program))
    if (diagnostic.category === ts7.DiagnosticCategory.Error) diagnostics.push(fromTypeScript(diagnostic, diagnostic.file ? rel(diagnostic.file.fileName) : ""));
  const sources = rootNames.map((path) => program.getSourceFile(path)).filter((file) => !!file);
  const discovered = new Set(sources.map((file) => file.fileName));
  for (const file of program.getSourceFiles().filter((file2) => !discovered.has(file2.fileName) && !file2.isDeclarationFile && file2.fileName.startsWith(root + sep) && !inFolder(file2.fileName) && !rel(file2.fileName).split(sep).includes("node_modules") && /\.(ts|tsx|mts)$/.test(file2.fileName)).sort((a, b) => a.fileName.localeCompare(b.fileName))) sources.push(file);
  if (options.constrained) for (const file of sources) diagnostics.push(...checkConstrainedSource(file, { checker: program.getTypeChecker(), displayPath: (source) => rel(source.fileName) }));
  for (const file of sources) diagnostics.push(...checkSequentialNlLoops(file, (source) => rel(source.fileName)));
  for (const file of sources) diagnostics.push(...checkFixedCursorIterations(file, (source) => rel(source.fileName)));
  diagnostics.push(...checkNlIdiomsIn(
    [...[...namedRecords.values()].map((record) => ({ [record.name]: record })), ...contextRecords.values()],
    (source) => source.startsWith("/") ? rel(source) : source
  ));
  const revision = (file) => `${rel(file.fileName)}@${file.text.length}`;
  const plans = /* @__PURE__ */ new Map();
  const readouts = /* @__PURE__ */ new Map();
  const instantiations = /* @__PURE__ */ new Map();
  for (const file of sources) {
    const analysis = analyzeInlineLambdas(program, [file], { displayPath: (source) => rel(source.fileName), sourceRevision: revision(file), authored: true });
    diagnostics.push(...analysis.diagnostics);
    analysis.plans.forEach((plan) => {
      plan.programId = programId;
    });
    plans.set(file, analysis.plans);
    readouts.set(file, analysis.readouts);
    instantiations.set(file, analysis.instantiations);
    if (collectAdaptation) {
      optimizationSources[rel(file.fileName)] = file.text;
      optimizationComponents.push(...analysis.plans.map((plan) => inlineDescriptor(programId, plan)));
    }
  }
  const rootIsPackage = fs.isFile(joinSourcePath(root, "natlang.json"));
  const collectSources = (dir) => {
    for (const name of fs.list(dir).sort()) {
      if (SKIPPED_DIRS.has(name) || name.startsWith(".") || name === "adaptations" || name.endsWith(".d.nl.ts")) continue;
      const path = joinSourcePath(dir, name);
      if (fs.isDirectory(path)) {
        if (rootIsPackage && fs.isFile(joinSourcePath(path, "natlang.json"))) continue;
        const runManifest = joinSourcePath(path, "manifest.json");
        if (fs.isFile(runManifest)) {
          try {
            if (JSON.parse(fs.read(runManifest))?.schema === "natlang.adaptation-run/v1") continue;
          } catch {
          }
        }
        collectSources(path);
      } else if (dir === root && name === "examples.json") continue;
      else if (fs.isFile(path) && /\.(?:[cm]?ts|[cm]?js|nl|json|yaml|yml)$/.test(name)) {
        let text = fs.read(path);
        if (name.endsWith(".json")) {
          try {
            if (/^natlang\.adaptation(?:\/|-)/.test(JSON.parse(text)?.schema ?? "")) continue;
          } catch {
          }
        }
        if (name === "natlang.json") {
          try {
            const manifest2 = JSON.parse(text);
            if (manifest2.targets) for (const target of Object.values(manifest2.targets)) delete target.adaptation;
            text = JSON.stringify(manifest2);
          } catch {
          }
        }
        optimizationSources[rel(path)] = text;
      }
    }
  };
  if (collectAdaptation) {
    collectSources(root);
    let dependencyRoot = root;
    while (true) {
      for (const lock of ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]) {
        const path = joinSourcePath(dependencyRoot, lock);
        if (fs.isFile(path)) optimizationSources["@dependency-lock/" + lock] = fs.read(path);
      }
      const parent = dirname(dependencyRoot);
      if (parent === dependencyRoot) break;
      dependencyRoot = parent;
    }
  }
  const manifest = {
    version: NATLANG_COMPILE_VERSION,
    inline: [...plans.values()].flat().map((plan) => ({
      id: plan.definitionId,
      source: plan.sourceSpan.file,
      line: plan.sourceSpan.line,
      signature: `(${plan.parameters.map((parameter) => `${parameter.name}: ${parameter.type.text}`).join(", ")}) => ${plan.returns.text}`
    })),
    named: [...namedRecords.values()].map((record) => ({
      id: record.id,
      source: record.source,
      signature: `(${Object.entries(record.args).map(([name, type]) => `${name}: ${type}`).join(", ")}) => ${record.returns}`
    })),
    sites: [],
    ...collectAdaptation ? { adaptation: describeProgram(
      programId,
      optimizationSources,
      optimizationComponents,
      options.guidance,
      options.importedGuidancePrograms,
      options.services ? { declarations: Object.fromEntries(Object.entries(options.services.declarations).map(([name, text]) => [name, /^\s*declare (?:namespace|const) /.test(text) ? text.trim() : declarationNamespace(name, text)])), scopes: options.services.scopes } : void 0
    ) } : {}
  };
  const refinedSlots = [];
  const collectSlots = (level) => {
    for (const item of Object.values(level)) {
      if (item.kind === "natlang") refinedSlots.push(
        ...refinedSlotsOf(item.source, item.name, item.args, item.returns, item.types),
        ...(item.ensures ?? []).map((clause) => ({
          source: item.source,
          function: item.name,
          slot: "ensures",
          predicate: "check" in clause ? clause.check : clause.predicate + (clause.against?.length ? ` (given ${clause.against.join(", ")})` : "")
        }))
      );
      collectSlots(item.codebase);
    }
  };
  for (const record of namedRecords.values()) {
    collectSlots({ [record.name]: record });
  }
  for (const records of contextRecords.values()) collectSlots(records);
  for (const plan of [...plans.values()].flat()) {
    const planAliases = { ...plan.returns.aliases };
    for (const parameter of plan.parameters) Object.assign(planAliases, parameter.type.aliases);
    refinedSlots.push(...refinedSlotsOf(
      plan.sourceSpan.file,
      plan.definitionId,
      Object.fromEntries(plan.parameters.map((parameter) => [parameter.name, parameter.type.natlang ?? parameter.type.text])),
      plan.returns.natlang ?? plan.returns.text,
      planAliases
    ));
  }
  const emitting = options.emit !== false;
  const generated = /* @__PURE__ */ new Map();
  const generatedNz = /* @__PURE__ */ new Map();
  const importsBySource = /* @__PURE__ */ new Map();
  const noNatlangImports = /* @__PURE__ */ new Set();
  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile || program.isSourceFileFromExternalLibrary(file)) continue;
    const found = /* @__PURE__ */ new Set();
    const commonjs = file.impliedNodeFormat === ts7.ModuleKind.CommonJS || compilerOptions.module === ts7.ModuleKind.CommonJS;
    for (const statement of file.statements) {
      if (!ts7.isImportDeclaration(statement) && !ts7.isExportDeclaration(statement) || !statement.moduleSpecifier || !ts7.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (specifier.endsWith(".nz")) {
        const target = resolve(dirname(file.fileName), specifier);
        const bytes = nzFiles.get(target);
        if (!bytes) {
          problem(rel(file.fileName), `cannot import ${specifier}: no such .nz file`);
          continue;
        }
        if (emitting) {
          found.add(specifier);
          generatedNz.set(joinSourcePath(outDir, relative(compilerOptions.rootDir, target)) + ".js", { bytes, commonjs });
        }
      } else if (specifier.endsWith(".nl")) {
        const target = resolve(dirname(file.fileName), specifier);
        const record = namedRecords.get(target);
        if (!record) {
          problem(rel(file.fileName), `cannot import ${specifier}: no such natlang function`);
          continue;
        }
        if (emitting) {
          found.add(specifier);
          generated.set(joinSourcePath(outDir, relative(compilerOptions.rootDir, target)) + ".js", { record, target, commonjs });
        }
      }
    }
    if (found.size) importsBySource.set(file, found);
  }
  const ok = !diagnostics.some((item) => item.severity === "error");
  const outputs = {};
  const rewrites = {};
  if (options.write !== false && options.writeDeclarations !== false && fs.write) {
    for (const [path, text] of Object.entries(declarations))
      if (!fs.isFile(path) || fs.read(path) !== text) fs.write(path, text);
  }
  if (ok && emitting) {
    const fusionSitesOf = (file) => {
      const names = /* @__PURE__ */ new Map();
      for (const statement of file.statements) {
        if (!ts7.isImportDeclaration(statement) || !ts7.isStringLiteral(statement.moduleSpecifier) || !statement.moduleSpecifier.text.endsWith(".nl")) continue;
        const record = namedRecords.get(resolve(dirname(file.fileName), statement.moduleSpecifier.text));
        if (record && statement.importClause?.name) names.set(statement.importClause.name.text, record);
      }
      return fusionCallSites(file, rel(file.fileName), names);
    };
    const specifierFor = (commonjs) => bound ? commonjs && bound.path ? bound.path : bound.url : runtimeSpecifier;
    const byFile = new Map(sources.map((file) => [file.fileName, file]));
    const transformer = (context) => (file) => {
      const source = byFile.get(file.fileName);
      if (!source) return file;
      const contextDir = findApplicationContext(dirname(file.fileName), files);
      const filePlans = plans.get(source) ?? [];
      const fileReadouts = readouts.get(source) ?? [];
      const commonjs = source.impliedNodeFormat === ts7.ModuleKind.CommonJS || compilerOptions.module === ts7.ModuleKind.CommonJS;
      const rewriteFor = new Map([
        ...[...rewrite.keys()].map((specifier) => [specifier, specifierFor(commonjs)]),
        ...stdSpecifiers.map((specifier) => [specifier, commonjs && stdModule.path ? stdModule.path : stdModule.url])
      ]);
      return natlangTransformer({
        ...analysisLowering(
          { plans: filePlans, readouts: fileReadouts, instantiations: instantiations.get(source) ?? [] },
          (item) => `${rel(file.fileName)}:${item.line}`
        ),
        fusionSites: fusionSitesOf(source),
        checker: program.getTypeChecker(),
        runtime: "__natlang",
        context: contextDir && contextRecords.has(contextDir) ? JSON.stringify(contextRecords.get(contextDir)) : void 0,
        constrained: options.constrained ?? false,
        guardPrefix: JSON.stringify([programId, rel(file.fileName)]),
        modulePath: rel(file.fileName),
        browser: options.target === "browser",
        module: { natlangImports: importsBySource.get(source) ?? noNatlangImports, rewrite: rewriteFor }
      })(context)(file);
    };
    const rewriteGate = options.rewriteGate ?? loadRewriteGate(fs, root);
    const emit = (fileName, text) => {
      if ((options.constrained || /\b__natlang\.(?:fuseSite|instantiate)\(/.test(text)) && /\.js$/.test(fileName) && !/(?:\b(?:const|let|var)\s+__natlang\b|\bimport\s*\{[^}]*\b__natlang\b)/.test(text)) {
        const commonjs = compilerOptions.module === ts7.ModuleKind.CommonJS || /Object\.defineProperty\(exports/.test(text);
        text = (commonjs ? `const __natlang = require(${JSON.stringify(specifierFor(true))}).__natlang;
` : `import { __natlang } from ${JSON.stringify(specifierFor(false))};
`) + text;
      }
      if (/\.[cm]?js$/.test(fileName) && /['"]natlang:neuralese['"]/.test(text)) {
        const rewritten = rewriteCombinators(text, { gate: rewriteGate, fileName });
        text = rewritten.code;
        if (rewritten.applied.length) rewrites[fileName] = rewritten.applied;
      }
      outputs[fileName] = text;
      if (options.write !== false) fs.write?.(fileName, text);
    };
    const emitted = program.emit(void 0, emit, void 0, false, { before: [transformer] });
    const sourceNames = new Set(program.getSourceFiles().map((file) => resolve(file.fileName)));
    const refinementsFor = (target) => {
      const top = resolve(compilerOptions.rootDir);
      for (let dir = dirname(resolve(target)); dir === top || dir.startsWith(top + sep); dir = dirname(dir)) {
        const candidate = joinSourcePath(dir, "refinements.ts");
        if (sourceNames.has(candidate)) return candidate;
        if (dir === top) break;
      }
      return void 0;
    };
    for (const [path, { record, commonjs, target }] of generated) {
      const specifier = JSON.stringify(specifierFor(commonjs)), json3 = JSON.stringify(record);
      const crisp = refinementsFor(target);
      let local = "";
      if (crisp) {
        const emitted2 = joinSourcePath(outDir, relative(compilerOptions.rootDir, crisp)).replace(/\.ts$/, ".js");
        const from = relative(dirname(path), emitted2).split(sep).join("/");
        local = JSON.stringify(from.startsWith(".") ? from : `./${from}`);
      }
      emit(path, commonjs ? `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
` + (crisp ? `require(${specifier}).__natlang.registerCrisp(require(${local}).refinements, ${local});
` : "") + `exports.default = require(${specifier}).__natlang.named(${JSON.stringify(record.name)}, ${json3});
` : `import { __natlang } from ${specifier};
` + (crisp ? `import { refinements as __crisp } from ${local};
__natlang.registerCrisp(__crisp, ${local});
` : "") + `export default __natlang.named(${JSON.stringify(record.name)}, ${json3});
`);
    }
    for (const [path, { bytes, commonjs }] of generatedNz) {
      const specifier = JSON.stringify(specifierFor(commonjs));
      const names = Object.keys(loadNzSync(bytes).header.exports);
      const load2 = `__natlang.nzModule(${JSON.stringify(toBase64(bytes))})`;
      emit(path, commonjs ? `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const __nz = require(${specifier}).${load2};
` + names.map((name) => `exports.${name} = __nz.${name};
`).join("") : `import { __natlang } from ${specifier};
const __nz = ${load2};
` + names.map((name) => `export const ${name} = __nz.${name};
`).join(""));
    }
    for (const diagnostic of emitted.diagnostics) if (diagnostic.category === ts7.DiagnosticCategory.Error)
      diagnostics.push(fromTypeScript(diagnostic, diagnostic.file ? rel(diagnostic.file.fileName) : ""));
    if (options.write !== false) fs.write?.(joinSourcePath(outDir, "natlang-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  }
  diagnostics.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start);
  return {
    ok: !diagnostics.some((item) => item.severity === "error"),
    diagnostics,
    outputs,
    declarations,
    manifest,
    outDir,
    rewrites,
    ...refinedSlots.length ? { refinedSlots } : {}
  };
}
function walkNz(fs, root) {
  return walkSources(fs, root, (entry) => entry.endsWith(".nz"));
}
function walkTs(fs, root) {
  return walkSources(fs, root, (entry) => /\.(ts|tsx|mts)$/.test(entry));
}
function walkSources(fs, root, wanted) {
  const out = [];
  const walk = (dir, inPackage) => {
    for (const entry of fs.list(dir)) {
      if (SKIPPED_DIRS.has(entry) || entry.startsWith(".")) continue;
      const path = joinSourcePath(dir, entry);
      if (fs.isDirectory(path)) {
        const isPackage = fs.isFile(joinSourcePath(path, "natlang.json"));
        if (!(isPackage && inPackage)) walk(path, inPackage || isPackage);
      } else if (wanted(entry)) out.push(path);
    }
  };
  walk(root, fs.isFile(joinSourcePath(root, "natlang.json")));
  return out;
}
function detectRuntimeSpecifier(fs, files) {
  for (const path of files) {
    const match = /import\s*\{[^}]*\b(?:nl|iterateOn|createNatlangRuntime)\b[^}]*\}\s*from\s*['"]([^'"]+)['"]/.exec(fs.read(path));
    if (match) return match[1];
  }
  return;
}
function formatDiagnostics(diagnostics) {
  return diagnostics.map((item) => `${item.file}:${item.line}:${item.column} ${item.severity} ${item.code}: ${item.message}` + (item.detail ? `
${item.detail.split("\n").map((line) => `  ${line}`).join("\n")}` : "") + (item.hint ? `
  hint: ${item.hint}` : "")).join("\n");
}

// src/runtime/virtual-project.ts
function virtualProjectFiles(files, root = "/project") {
  const store = new Map(Object.entries(files).map(([path, text]) => [path.startsWith("/") ? path : `${root}/${path}`, text]));
  const outputs = /* @__PURE__ */ new Map();
  const sourceChildren = /* @__PURE__ */ new Map([["/", /* @__PURE__ */ new Set()]]);
  for (const path of store.keys()) {
    let child = path;
    for (let slash = child.lastIndexOf("/"); slash >= 0; slash = child.lastIndexOf("/")) {
      const parent = child.slice(0, slash) || "/";
      let entries = sourceChildren.get(parent);
      if (!entries) {
        entries = /* @__PURE__ */ new Set();
        sourceChildren.set(parent, entries);
      }
      entries.add(child.slice(slash + 1));
      if (slash === 0) break;
      child = parent;
    }
  }
  const directory = (path) => path.replace(/\/$/, "") || "/";
  const prefixOf = (path) => path === "/" ? "/" : path + "/";
  return {
    outputs,
    isFile: (path) => store.has(path) || outputs.has(path),
    isDirectory: (path) => {
      const dir = directory(path);
      if (sourceChildren.has(dir)) return true;
      const prefix = prefixOf(dir);
      for (const output of outputs.keys()) if (output.startsWith(prefix)) return true;
      return false;
    },
    list: (path) => {
      const dir = directory(path);
      if (!outputs.size) return [...sourceChildren.get(dir) ?? []];
      const entries = new Set(sourceChildren.get(dir));
      const prefix = prefixOf(dir);
      for (const output of outputs.keys())
        if (output.startsWith(prefix)) entries.add(output.slice(prefix.length).split("/")[0]);
      return [...entries];
    },
    read: (path) => {
      const text = store.get(path) ?? outputs.get(path);
      if (text === void 0) throw new Error(`no such file ${path}`);
      return text;
    },
    write: (path, text) => {
      outputs.set(path, text);
    }
  };
}
function virtualSourceFiles(files, root = "/project") {
  const virtual = virtualProjectFiles(files, root);
  return {
    join: joinSourcePath,
    dirname: (path) => path.slice(0, path.lastIndexOf("/")) || "/",
    basename: (path, extension) => {
      const base = path.slice(path.lastIndexOf("/") + 1);
      return extension && base.endsWith(extension) ? base.slice(0, -extension.length) : base;
    },
    extname: (path) => {
      const base = path.slice(path.lastIndexOf("/") + 1);
      const at = base.lastIndexOf(".");
      return at > 0 ? base.slice(at) : "";
    },
    isFile: (path) => virtual.isFile(path),
    isDirectory: (path) => virtual.isDirectory(path),
    read: (path) => virtual.read(path),
    list: (path) => virtual.list(path),
    relative: (path) => path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
  };
}
function loadVirtualNatlang(files, path, root = "/project", platform) {
  const record = loadNamedFunction(path.startsWith("/") ? path : `${root}/${path}`, virtualSourceFiles(files, root));
  return namedCallable(record.name, record, void 0, platform);
}
function loadVirtualCallables(files, dir = "", root = "/project", platform) {
  return callableTree(loadCallableFolder(dir ? `${root}/${dir}` : root, virtualSourceFiles(files, root)), void 0, platform);
}
function compileVirtualProjectProduct(project, options) {
  const snapshot3 = structuredClone(project);
  const root = snapshot3.root ?? "/project";
  const files = virtualProjectFiles(snapshot3.files, root);
  const specifiers = [...options.runtimeSpecifiers ?? ["@natlang/browser", "@natlang/node"]];
  const build = compileProject({
    project: root,
    constrained: options.constrained,
    programId: options.programId,
    files,
    outDir: `${root}/.natlang/build`,
    module: "commonjs",
    guidance: options.guidance,
    importedGuidancePrograms: options.importedGuidancePrograms,
    services: options.services,
    target: options.target,
    runtimeSpecifier: specifiers[0],
    write: true,
    emit: options.emit,
    adaptation: options.adaptation,
    surfaceSpecifiers: specifiers
  });
  return { schema: "natlang.virtual-project-product/1", project: snapshot3, runtimeSpecifiers: specifiers, build };
}
function instantiateVirtualProjectProduct(product, runtime, options) {
  const { project, build: result, runtimeSpecifiers: specifiers } = structuredClone(product);
  if (product.schema !== "natlang.virtual-project-product/1") throw new Error("unsupported virtual project product");
  const { platform } = options;
  const root = project.root ?? "/project";
  const cache = /* @__PURE__ */ new Map();
  const load2 = (path) => {
    const found = cache.get(path);
    if (found) return found.exports;
    const text = result.outputs[path];
    if (text === void 0) throw new Error(`module ${path} was not emitted by the project build`);
    const module = { exports: {} };
    cache.set(path, module);
    const require3 = (specifier) => {
      if (specifier === "natlang:services") return servicesModule;
      if (specifiers.includes(specifier) || specifier === NEUTRAL_RUNTIME_SPECIFIER) return runtime;
      if (options.modules && Object.hasOwn(options.modules, specifier)) return options.modules[specifier];
      if (hasBuiltinModule(platform, specifier)) return builtinModule(platform, specifier);
      if (!specifier.startsWith(".")) throw new Error(`module ${specifier} is not available in this virtual project`);
      const base = path.slice(0, path.lastIndexOf("/"));
      const joined = joinSourcePath(base || "/", specifier);
      const candidate = ["", ".js", "/index.js"].map((suffix) => `${joined.replace(/\.ts$/, ".js")}${suffix}`).find((item) => item in result.outputs);
      if (!candidate) throw new Error(`cannot resolve ${specifier} from ${path}`);
      return load2(candidate);
    };
    platformModuleRealm(platform).evaluateModule(text, { exports: module.exports, require: require3, module });
    return module.exports;
  };
  const exported = /* @__PURE__ */ new Map();
  return { ...result, require: (path) => {
    const absolute = path.startsWith("/") ? path : `${root}/${path}`;
    const emitted = `${root}/.natlang/build/${absolute.slice(root.length + 1)}`.replace(/\.m?ts$/, ".js");
    const prior = exported.get(absolute);
    if (prior) return prior;
    const raw = load2(emitted), source = project.files[absolute] ?? project.files[absolute.slice(root.length + 1)];
    if (source === void 0) return raw;
    const record = parseModule(absolute, source, {}, virtualSourceFiles(project.files, root), { compiled: true });
    const bound = Object.create(Object.getPrototypeOf(raw)), wrappers = /* @__PURE__ */ new Map();
    const wrap = (key, value) => {
      if (typeof value !== "function") return value;
      let cache2 = wrappers.get(key);
      if (!cache2) {
        cache2 = /* @__PURE__ */ new WeakMap();
        wrappers.set(key, cache2);
      }
      let wrapped = cache2.get(value);
      if (!wrapped) {
        wrapped = new Proxy(value, { apply(fn, thisArg, args) {
          return invokeNativeEntry(record, key, args, () => Reflect.apply(fn, thisArg, args));
        } });
        cache2.set(value, wrapped);
      }
      return wrapped;
    };
    for (const key of Reflect.ownKeys(raw)) {
      const descriptor = Object.getOwnPropertyDescriptor(raw, key);
      if (typeof key === "string") {
        if ("value" in descriptor) descriptor.value = wrap(key, descriptor.value);
        else if (descriptor.get) {
          const get = descriptor.get;
          descriptor.get = function() {
            return wrap(key, Reflect.apply(get, this, []));
          };
        }
      }
      Object.defineProperty(bound, key, descriptor);
    }
    exported.set(absolute, bound);
    return bound;
  } };
}
function compileVirtualProject(project, runtime, options) {
  const product = compileVirtualProjectProduct(project, {
    ...options,
    target: options.target ?? (moduleTarget(options.platform) === "await-restoring" ? "browser" : "node")
  });
  return instantiateVirtualProjectProduct(product, runtime, options);
}

// src/calls/store-core.ts
var byteLength = (text) => new TextEncoder().encode(text).length;
var SCHEMA = `
CREATE TABLE IF NOT EXISTS blobs (hash TEXT PRIMARY KEY, bytes INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS calls (
  call_id TEXT PRIMARY KEY, parent_call_id TEXT, parent_action_index INTEGER, task_id TEXT, program_id TEXT, build_hash TEXT,
  program_root TEXT, definition_id TEXT NOT NULL, definition_name TEXT NOT NULL, definition_source TEXT, definition_key TEXT NOT NULL,
  interface_hash TEXT, site TEXT, executor TEXT NOT NULL, model_id TEXT, case_hash TEXT, outcome TEXT, started_at TEXT, ended_at TEXT,
  wall_ms INTEGER, tokens_in INTEGER, tokens_out INTEGER, model_requests INTEGER, evals INTEGER, approach_hash TEXT, audit_of TEXT,
  record_hash TEXT NOT NULL, events_hash TEXT, pinned INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS calls_key ON calls(definition_key, started_at);
CREATE INDEX IF NOT EXISTS calls_definition ON calls(definition_id, started_at);
CREATE INDEX IF NOT EXISTS calls_started ON calls(started_at);
CREATE INDEX IF NOT EXISTS calls_case ON calls(case_hash);
CREATE INDEX IF NOT EXISTS calls_parent ON calls(parent_call_id);
CREATE TABLE IF NOT EXISTS call_blobs (call_id TEXT NOT NULL, hash TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY (call_id, hash, kind));
CREATE INDEX IF NOT EXISTS call_blobs_hash ON call_blobs(hash);
CREATE TABLE IF NOT EXISTS annotations (id INTEGER PRIMARY KEY AUTOINCREMENT, call_id TEXT NOT NULL, kind TEXT NOT NULL,
  value TEXT NOT NULL, source TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS annotations_call ON annotations(call_id);
CREATE TABLE IF NOT EXISTS compilations (id TEXT PRIMARY KEY, definition_key TEXT NOT NULL, definition_id TEXT NOT NULL,
  definition_name TEXT NOT NULL, definition_source TEXT, interface_hash TEXT NOT NULL, program_root TEXT, folder_hash TEXT NOT NULL,
  parent_id TEXT, created_at TEXT NOT NULL, status TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS compilations_key ON compilations(definition_key, status);
CREATE TABLE IF NOT EXISTS compilation_files (compilation_id TEXT NOT NULL, path TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY (compilation_id, path));
CREATE INDEX IF NOT EXISTS compilation_files_hash ON compilation_files(hash);
CREATE TABLE IF NOT EXISTS cases (hash TEXT NOT NULL, compilation_id TEXT NOT NULL, position INTEGER NOT NULL, tier TEXT NOT NULL,
  served INTEGER NOT NULL DEFAULT 0, handed_off INTEGER NOT NULL DEFAULT 0, compared INTEGER NOT NULL DEFAULT 0,
  worse INTEGER NOT NULL DEFAULT 0, better INTEGER NOT NULL DEFAULT 0, audited INTEGER NOT NULL DEFAULT 0,
  audit_worse INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, promoted_at TEXT, demoted_at TEXT, note TEXT,
  PRIMARY KEY (hash, compilation_id));
CREATE TABLE IF NOT EXISTS case_calls (case_hash TEXT NOT NULL, call_id TEXT NOT NULL, role TEXT NOT NULL, verdict TEXT,
  created_at TEXT NOT NULL, PRIMARY KEY (case_hash, call_id, role));
CREATE INDEX IF NOT EXISTS case_calls_call ON case_calls(call_id);
CREATE TABLE IF NOT EXISTS declines (definition_key TEXT PRIMARY KEY, definition_id TEXT NOT NULL, reason TEXT NOT NULL, why TEXT NOT NULL,
  calls_at_decline INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, case_hash TEXT NOT NULL, call_id TEXT NOT NULL,
  status TEXT NOT NULL, enqueued_at TEXT NOT NULL, done_at TEXT, verdict TEXT, detail TEXT, UNIQUE (kind, case_hash, call_id));
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS findings (id INTEGER PRIMARY KEY AUTOINCREMENT, fingerprint TEXT NOT NULL UNIQUE, definition_key TEXT NOT NULL,
  definition_id TEXT NOT NULL, definition_name TEXT NOT NULL, definition_source TEXT, kind TEXT NOT NULL, summary TEXT NOT NULL, detail TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS findings_definition ON findings(definition_key, status);
CREATE TABLE IF NOT EXISTS spend (id INTEGER PRIMARY KEY AUTOINCREMENT, definition_key TEXT NOT NULL, activity TEXT NOT NULL,
  tokens INTEGER NOT NULL, wall_ms INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS spend_definition ON spend(definition_key);
CREATE TABLE IF NOT EXISTS iteration_statistics (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS refinement_verdicts (key TEXT PRIMARY KEY, probability REAL NOT NULL, judge TEXT NOT NULL, created_at TEXT NOT NULL);
`;
var BLOB_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS blobs_count_insert AFTER INSERT ON blobs BEGIN
  UPDATE meta SET value = CAST(value AS INTEGER) + NEW.bytes WHERE key = 'blob_bytes';
  UPDATE meta SET value = CAST(value AS INTEGER) + (SELECT CASE WHEN block = 0 THEN 0 ELSE (NEW.bytes + block - 1) / block * block END
    FROM (SELECT CAST(value AS INTEGER) AS block FROM meta WHERE key = 'blob_block_bytes')) WHERE key = 'blob_disk_bytes';
END;
CREATE TRIGGER IF NOT EXISTS blobs_count_delete AFTER DELETE ON blobs BEGIN
  UPDATE meta SET value = CAST(value AS INTEGER) - OLD.bytes WHERE key = 'blob_bytes';
  UPDATE meta SET value = CAST(value AS INTEGER) - (SELECT CASE WHEN block = 0 THEN 0 ELSE (OLD.bytes + block - 1) / block * block END
    FROM (SELECT CAST(value AS INTEGER) AS block FROM meta WHERE key = 'blob_block_bytes')) WHERE key = 'blob_disk_bytes';
END;`;
var now = () => (/* @__PURE__ */ new Date()).toISOString();
var EVICTION_CHUNK = 64;
var VACUUM_STEP_PAGES = 4096;
var refHashes = (ref) => ref?.complete ? [ref.hash] : [];
var CallStore = class _CallStore {
  constructor(root, db, medium) {
    this.root = root;
    this.medium = medium;
    const statements = /* @__PURE__ */ new Map();
    this.db = {
      exec: (sql) => db.exec(sql),
      close: () => {
        statements.clear();
        db.close();
      },
      prepare: (sql) => {
        let statement = statements.get(sql);
        if (!statement) {
          if (statements.size >= 512) statements.clear();
          statements.set(sql, statement = db.prepare(sql));
        }
        return statement;
      }
    };
    this.db.exec(SCHEMA);
    const columns = this.db.prepare("PRAGMA table_info(calls)").all().map((column) => column.name);
    if (!columns.includes("pid")) this.db.exec("ALTER TABLE calls ADD COLUMN pid INTEGER");
    if (!columns.includes("process_scope")) this.db.exec("ALTER TABLE calls ADD COLUMN process_scope TEXT");
    if (!columns.includes("run_label")) this.db.exec("ALTER TABLE calls ADD COLUMN run_label TEXT");
    this.db.exec("CREATE INDEX IF NOT EXISTS calls_run_label ON calls(run_label)");
    const caseColumns = this.db.prepare("PRAGMA table_info(cases)").all().map((column) => column.name);
    if (!caseColumns.includes("live_compared")) this.db.exec("ALTER TABLE cases ADD COLUMN live_compared INTEGER NOT NULL DEFAULT 0");
    if (!caseColumns.includes("live_worse")) this.db.exec("ALTER TABLE cases ADD COLUMN live_worse INTEGER NOT NULL DEFAULT 0");
    this.countBlobs();
    this.markInterrupted();
  }
  root;
  medium;
  /** Opens a store at a path; set by the Node store module (store.ts). */
  static opener;
  static open(root, options) {
    if (!_CallStore.opener) throw new Error("CallStore.open needs the Node store module (calls/store.js)");
    return _CallStore.opener(root, options);
  }
  /** Called when the store closes (the Node module forgets its instance). */
  onClose;
  settingsCache;
  db;
  /** Install the blob byte counters (BLOB_TRIGGERS) once per database, starting them from the blobs already stored. */
  countBlobs() {
    const installed = () => !!this.db.prepare("SELECT 1 AS ok FROM meta WHERE key = 'blob_disk_bytes'").get();
    if (installed()) return;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (!installed()) {
        const block = Math.max(0, Math.floor(this.medium.blobBlockBytes()));
        const sums = this.db.prepare(`SELECT COALESCE(SUM(bytes), 0) AS bytes,
          COALESCE(SUM(${block === 0 ? "0" : `(bytes + ${block - 1}) / ${block} * ${block}`}), 0) AS disk FROM blobs`).get();
        const put = this.db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");
        put.run("blob_block_bytes", String(block));
        put.run("blob_bytes", String(sums.bytes));
        put.run("blob_disk_bytes", String(sums.disk));
        this.db.exec(BLOB_TRIGGERS);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  /** Calls left `running` by a process that is gone (as the medium knows it) become `interrupted`. */
  markInterrupted() {
    const rows = this.db.prepare("SELECT call_id, pid, process_scope FROM calls WHERE outcome = 'running'").all();
    let marked = 0;
    for (const row of rows) {
      if (!this.medium.gone(row.pid, row.process_scope)) continue;
      this.db.prepare("UPDATE calls SET outcome = 'interrupted' WHERE call_id = ? AND outcome = 'running'").run(row.call_id);
      marked++;
    }
    return marked;
  }
  close() {
    this.onClose?.();
    this.db.close();
  }
  // --- Settings ---------------------------------------------------------------------------------------------------
  /** Machine settings: defaults, then the store's config, then the medium's mode override (Node: NATLANG_SPECIALIZATION). Re-read every 5 s. */
  settings() {
    const cached = this.settingsCache;
    if (cached && Date.now() - cached.at < 5e3) return cached.value;
    let file = {};
    try {
      file = this.medium.readConfig();
    } catch {
    }
    const value = { ...DEFAULT_SETTINGS, ...file };
    const mode = this.medium.modeOverride()?.trim();
    if (mode === "off" || mode === "shadow" || mode === "on") value.specialization = mode;
    this.settingsCache = { at: Date.now(), value };
    return value;
  }
  writeSettings(changes) {
    let file = {};
    try {
      file = this.medium.readConfig();
    } catch {
    }
    this.medium.writeConfig({ ...file, ...changes });
    this.settingsCache = void 0;
    return this.settings();
  }
  // --- Blobs ------------------------------------------------------------------------------------------------------
  /** Store `text` under its SHA-256; returns the hash. Existing blobs are not rewritten. */
  putBlob(text, hash = hexDigest(text)) {
    if (this.medium.putBlob(hash, text)) this.created?.push(hash);
    this.db.prepare("INSERT OR IGNORE INTO blobs (hash, bytes) VALUES (?, ?)").run(hash, byteLength(text));
    return hash;
  }
  blob(hash) {
    try {
      return this.medium.blob(hash);
    } catch {
      return void 0;
    }
  }
  /** The value a complete reference names, or `undefined` when it is incomplete or evicted. */
  value(ref) {
    if (!ref?.complete) return void 0;
    const text = this.blob(ref.hash);
    return text === void 0 ? void 0 : JSON.parse(text);
  }
  // --- Calls ------------------------------------------------------------------------------------------------------
  /** Store one call record. `blobs` holds the text of every complete value the record references (by hash). */
  record(record, blobs, events) {
    this.inWrite(() => {
      const kinds = /* @__PURE__ */ new Map();
      for (const [hash, text] of blobs) {
        this.putBlob(text, hash);
        kinds.set(hash, "value");
      }
      let eventsHash = null;
      if (events !== void 0) {
        eventsHash = this.putBlob(events);
        record = { ...record, events: { complete: true, hash: eventsHash, bytes: byteLength(events) } };
      }
      const recordHash = this.putBlob(JSON.stringify(record));
      const definition = record.definition;
      this.db.prepare(`INSERT OR REPLACE INTO calls (call_id, parent_call_id, parent_action_index, task_id, program_id, build_hash,
        program_root, definition_id, definition_name, definition_source, definition_key, interface_hash, site, executor, model_id, case_hash,
        outcome, started_at, ended_at, wall_ms, tokens_in, tokens_out, model_requests, evals, approach_hash, audit_of, record_hash, events_hash, run_label)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        record.call_id,
        record.parent_call_id,
        record.parent_action_index,
        record.task_id,
        record.program_id,
        record.build_hash,
        record.program_root,
        definition.id,
        definition.name,
        definition.source,
        definition.key,
        definition.interface,
        definition.site,
        record.executor.kind,
        record.executor.model_id,
        record.executor.case_hash ?? null,
        record.outcome,
        record.started_at,
        record.ended_at,
        record.cost.wall_ms,
        record.cost.tokens_in,
        record.cost.tokens_out,
        record.cost.model_requests,
        record.cost.evals,
        record.approach.hash,
        record.audit_of ?? null,
        recordHash,
        eventsHash,
        record.run_label ?? null
      );
      const link = this.db.prepare("INSERT OR IGNORE INTO call_blobs (call_id, hash, kind) VALUES (?, ?, ?)");
      link.run(record.call_id, recordHash, "record");
      if (eventsHash) link.run(record.call_id, eventsHash, "events");
      this.db.prepare("DELETE FROM annotations WHERE call_id = ? AND kind = 'call-checkpoint'").run(record.call_id);
      this.db.prepare("DELETE FROM call_blobs WHERE call_id = ? AND kind = 'capture'").run(record.call_id);
      const referenced = [
        definition.instructions,
        ...Object.values(record.inputs),
        ...Object.values(record.captures),
        record.output,
        ...record.capture_writes.map((write) => write.after),
        ...record.effects.flatMap((effect) => [effect.args, effect.result]),
        ...record.folder?.changes.map((change) => change.after) ?? [],
        ...record.code_revisions?.map((revision) => revision.after) ?? []
      ].flatMap(refHashes);
      for (const hash of new Set(referenced)) if (blobs.has(hash) || kinds.has(hash)) link.run(record.call_id, hash, "value");
    });
    this.keepBound();
  }
  /**
   * After a write: when the store is over its bound, a bounded eviction pass (`AUTO_EVICTION_WORK`). Checked on every
   * write from the shared counters, so the bound holds whichever process writes and however few calls each records.
   * An eviction that fails (another writer holds the lock too long) is left to the next write.
   */
  keepBound() {
    try {
      const bound = this.bound();
      if (this.storeBytes() > bound) this.evict(bound, _CallStore.AUTO_EVICTION_WORK);
    } catch {
    }
  }
  /** Work (blob candidates and call rows) of one eviction pass after a write. */
  static AUTO_EVICTION_WORK = 1024;
  /** Save an unfinished call's actual inputs and effects without a fabricated completion. */
  checkpoint(callId, state, blobs, events) {
    if (state.call_id !== callId) throw new Error("call checkpoint identity differs");
    this.inWrite(() => {
      const row = this.db.prepare("SELECT outcome FROM calls WHERE call_id = ?").get(callId);
      if (!row || row.outcome !== "running") return;
      const link = this.db.prepare("INSERT OR IGNORE INTO call_blobs(call_id,hash,kind) VALUES (?,?,'capture')");
      for (const [hash, text] of blobs) {
        this.putBlob(text, hash);
        link.run(callId, hash);
      }
      this.db.prepare("DELETE FROM annotations WHERE call_id = ? AND kind = 'call-checkpoint'").run(callId);
      this.annotate(callId, "call-checkpoint", state, "natlang-call-capture", false);
      if (events !== void 0) this.progressInWrite(callId, events);
    });
  }
  /** A row for a call that has started, so running calls show in listings; `record` replaces it when the call ends. */
  begin(row) {
    this.db.prepare(`INSERT OR IGNORE INTO calls (call_id, parent_call_id, parent_action_index, task_id, program_id, program_root, definition_id,
      definition_name, definition_source, definition_key, interface_hash, site, executor, model_id, outcome, started_at, audit_of, record_hash, pid, process_scope,
      run_label)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'agent', ?, 'running', ?, ?, '', ?, ?, ?)`).run(
      row.callId,
      row.parentCallId,
      row.parentActionIndex,
      row.taskId,
      row.programId,
      row.programRoot,
      row.definition.id,
      row.definition.name,
      row.definition.source,
      row.definition.key,
      row.definition.interface,
      row.definition.site,
      row.modelId,
      row.startedAt,
      row.auditOf,
      this.medium.process.pid,
      this.medium.process.scope,
      row.runLabel ?? null
    );
  }
  /** Remove the row of a call that started and will not be recorded, with the event streams written while it ran. */
  discard(callId) {
    this.inWrite(() => {
      const removed = this.db.prepare("DELETE FROM calls WHERE call_id = ? AND outcome = 'running' RETURNING call_id").get(callId);
      if (!removed) return;
      const hashes = this.db.prepare("SELECT hash FROM call_blobs WHERE call_id = ?").all(callId);
      this.db.prepare("DELETE FROM call_blobs WHERE call_id = ?").run(callId);
      this.collectHashes(hashes.map((row) => row.hash));
    });
  }
  /**
   * The trace events so far of a running call (written every so often while it runs). The stream it replaces is
   * collected at once, and the new blob is linked in the transaction that stores it, so eviction never sees it unlinked.
   */
  progress(callId, events) {
    this.inWrite(() => this.progressInWrite(callId, events));
    this.keepBound();
  }
  progressInWrite(callId, events) {
    if (!this.db.prepare("SELECT 1 AS present FROM calls WHERE call_id = ? AND outcome IN ('running','interrupted')").get(callId)) return;
    const hash = this.putBlob(events);
    const old = this.db.prepare("SELECT hash FROM call_blobs WHERE call_id = ? AND kind = 'events' AND hash != ?").all(callId, hash);
    this.db.prepare("UPDATE calls SET events_hash = ? WHERE call_id = ? AND outcome IN ('running', 'interrupted')").run(hash, callId);
    this.db.prepare("DELETE FROM call_blobs WHERE call_id = ? AND kind = 'events' AND hash != ?").run(callId, hash);
    this.db.prepare("INSERT OR IGNORE INTO call_blobs (call_id, hash, kind) VALUES (?, ?, 'events')").run(callId, hash);
    this.collectHashes(old.map((row) => row.hash));
  }
  /** Blob files the current write transaction created, removed again if it rolls back. */
  created = null;
  /**
   * Run `body` under the write lock (taken before any read, so SQLite never upgrades a reader). When it fails, the blob
   * files it created and no committed row names are removed: they would otherwise stay on disk, counted by nothing.
   */
  inWrite(body) {
    this.db.exec("BEGIN IMMEDIATE");
    const created = [];
    this.created = created;
    try {
      const value = body();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
      }
      for (const hash of created) try {
        if (!this.db.prepare("SELECT 1 AS ok FROM blobs WHERE hash = ?").get(hash)) this.medium.deleteBlob(hash);
      } catch {
      }
      throw error;
    } finally {
      this.created = null;
    }
  }
  call(callId) {
    const row = this.db.prepare("SELECT record_hash FROM calls WHERE call_id = ?").get(callId);
    const text = row && this.blob(row.record_hash);
    return text ? JSON.parse(text) : void 0;
  }
  /** The call's trace events (`natlang.trace`), when they have not been evicted. */
  events(callId) {
    const row = this.db.prepare("SELECT events_hash FROM calls WHERE call_id = ?").get(callId);
    const text = row?.events_hash ? this.blob(row.events_hash) : void 0;
    return text === void 0 ? void 0 : text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  }
  /** Calls matching `filter`, newest first. `after` continues from a call ID of an earlier page. */
  calls(filter = {}) {
    const where = [], params = [];
    const add = (sql2, value) => {
      where.push(sql2);
      params.push(value);
    };
    if (filter.definition) {
      where.push("(definition_id = ? OR definition_name = ? OR definition_source = ?)");
      params.push(filter.definition, filter.definition, filter.definition);
    }
    if (filter.key) add("definition_key = ?", filter.key);
    if (filter.source) add("definition_source = ?", filter.source);
    if (filter.outcome) add("outcome = ?", filter.outcome);
    if (filter.executor) add("executor = ?", filter.executor);
    if (filter.caseHash) add("case_hash = ?", filter.caseHash);
    if (filter.since) add("started_at >= ?", filter.since);
    if (filter.program) add("(program_root = ? OR program_id = ?)", filter.program), params.push(filter.program);
    if (!filter.audits) where.push("audit_of IS NULL");
    if (filter.after) {
      const at = this.db.prepare("SELECT started_at FROM calls WHERE call_id = ?").get(filter.after);
      if (at) {
        where.push("(started_at < ? OR (started_at = ? AND call_id < ?))");
        params.push(at.started_at, at.started_at, filter.after);
      }
    }
    const sql = `SELECT call_id, parent_call_id, definition_id, definition_name, definition_key, definition_source, executor, case_hash,
      outcome, started_at, wall_ms, tokens_in, tokens_out, approach_hash, program_root, audit_of FROM calls
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY started_at DESC, call_id DESC LIMIT ?`;
    return this.db.prepare(sql).all(...params, filter.limit ?? 50);
  }
  /** Definition revisions by volume or cost since `since`. */
  hot(options = {}) {
    const order = options.by === "tokens" ? "tokens" : options.by === "wall_ms" ? "wall_ms" : "calls";
    const where = ["audit_of IS NULL", "site != 'internal'"], params = [];
    if (options.since) {
      where.push("started_at >= ?");
      params.push(options.since);
    }
    if (options.program) {
      where.push("(program_root = ? OR program_id = ?)");
      params.push(options.program, options.program);
    }
    return this.db.prepare(`SELECT definition_key, definition_id, definition_name, MAX(definition_source) AS definition_source,
      MAX(program_root) AS program_root, COUNT(*) AS calls, SUM(executor = 'agent') AS agent_calls,
      SUM(executor = 'crisp') AS crisp_calls, SUM(COALESCE(tokens_in, 0) + COALESCE(tokens_out, 0)) AS tokens,
      SUM(COALESCE(wall_ms, 0)) AS wall_ms, MAX(started_at) AS last_at FROM calls WHERE ${where.join(" AND ")} AND outcome != 'running'
      GROUP BY definition_key ORDER BY ${order} DESC LIMIT ?`).all(...params, options.limit ?? 20);
  }
  /** Successful agent calls of a definition revision, oldest first: the specializer's evidence. */
  agentCalls(definitionKey2, limit = 2e3) {
    return this.db.prepare(`SELECT call_id, parent_call_id, definition_id, definition_name, definition_key, definition_source, executor,
      case_hash, outcome, started_at, wall_ms, tokens_in, tokens_out, approach_hash, program_root, audit_of FROM calls
      WHERE definition_key = ? AND executor != 'crisp' AND audit_of IS NULL ORDER BY started_at ASC LIMIT ?`).all(definitionKey2, limit);
  }
  /** Calls started by a call, oldest first. */
  children(callId) {
    return this.db.prepare(`SELECT call_id, parent_call_id, definition_id, definition_name, definition_key, definition_source, executor,
      case_hash, outcome, started_at, wall_ms, tokens_in, tokens_out, approach_hash, program_root, audit_of, parent_action_index FROM calls
      WHERE parent_call_id = ? ORDER BY started_at ASC`).all(callId);
  }
  /**
   * Calls a typed ID may mean, newest first: the exact ID, else every ID starting with `prefix`, or whose short form
   * (the ID without its task name and ordinal, `task-3-`) does.
   */
  matchCalls(prefix, limit = 20) {
    const columns = "call_id, parent_call_id, definition_name, outcome, started_at";
    const exact = this.db.prepare(`SELECT ${columns} FROM calls WHERE call_id = ?`).all(prefix);
    if (exact.length || !prefix) return exact;
    const like = prefix.replace(/[\\%_]/g, (character) => `\\${character}`);
    const rows = this.db.prepare(`SELECT ${columns} FROM calls WHERE call_id LIKE ? ESCAPE '\\' OR call_id LIKE ? ESCAPE '\\'
      ORDER BY started_at DESC, call_id DESC`).all(`${like}%`, `%-${like}%`);
    return rows.filter((row) => row.call_id.startsWith(prefix) || row.call_id.replace(/^[^/]*?-\d+-/, "").startsWith(prefix)).slice(0, limit);
  }
  countCalls(definitionKey2) {
    return Number(this.db.prepare("SELECT COUNT(*) AS n FROM calls WHERE definition_key = ? AND audit_of IS NULL AND executor != 'crisp'").get(definitionKey2).n);
  }
  /** Attach evidence to a call; it is pinned unless `pin` is false (routine annotations such as evaluation scores). */
  annotate(callId, kind2, value, source, pin = true) {
    this.db.prepare("INSERT INTO annotations (call_id, kind, value, source, created_at) VALUES (?, ?, ?, ?, ?)").run(callId, kind2, JSON.stringify(value), source ?? null, now());
    if (pin) this.pin(callId);
  }
  /** Tier events (calls/tiers.ts) in order, with the cost of the call each is attached to. */
  tierRows() {
    return this.db.prepare(`SELECT a.call_id, a.value, c.definition_name, c.executor, c.model_id, COALESCE(c.tokens_in, 0) AS tokens_in,
      COALESCE(c.tokens_out, 0) AS tokens_out, COALESCE(c.wall_ms, 0) AS wall_ms FROM annotations a LEFT JOIN calls c ON c.call_id = a.call_id
      WHERE a.kind = 'tier' ORDER BY a.id`).all().map((row) => ({ ...row, value: JSON.parse(row.value) }));
  }
  annotations(callId) {
    return this.db.prepare("SELECT kind, value, source, created_at FROM annotations WHERE call_id = ? ORDER BY id").all(callId).map((row) => ({ ...row, value: JSON.parse(row.value) }));
  }
  /** Keep a call (and its values) when the store evicts. */
  pin(callId, pinned = true) {
    this.db.prepare("UPDATE calls SET pinned = ? WHERE call_id = ?").run(pinned ? 1 : 0, callId);
  }
  // --- Bounds -----------------------------------------------------------------------------------------------------
  counter(key) {
    const row = this.db.prepare("SELECT CAST(value AS INTEGER) AS n FROM meta WHERE key = ?").get(key);
    return Number(row?.n ?? 0);
  }
  /** Bytes of the stored blob texts. */
  totalBytes() {
    return this.counter("blob_bytes");
  }
  /** Bytes of database pages not in use (reused by later writes; returned to the medium by `compact` and incremental vacuum). */
  freeDatabaseBytes() {
    const pages = this.db.prepare("PRAGMA freelist_count").get();
    const size = this.db.prepare("PRAGMA page_size").get();
    return Number(pages.freelist_count) * Number(size.page_size);
  }
  /**
   * What the store occupies and eviction can reduce: blob files as allocated (blobs in the database count as its
   * pages) plus the database pages in use. Eviction cannot shrink the write-ahead log (it writes to it), so `bound`
   * leaves its room (`StoreMedium.logBytes`) out of `maxStoreBytes` instead.
   */
  storeBytes() {
    const pages = this.db.prepare("PRAGMA page_count").get();
    const size = this.db.prepare("PRAGMA page_size").get();
    return this.counter("blob_disk_bytes") + Number(pages.page_count) * Number(size.page_size) - this.freeDatabaseBytes();
  }
  /**
   * The store's bound now (on `storeBytes`): its size limit less the room of the database's log, so the files on disk
   * stay within `maxStoreBytes`; lowered further so the filesystem keeps `minFreeBytes` free.
   */
  bound() {
    const settings = this.settings();
    let free = Infinity;
    try {
      free = this.medium.freeBytes();
    } catch {
    }
    const total = this.storeBytes();
    let log = 0;
    try {
      log = this.medium.logBytes();
    } catch {
    }
    return Math.max(0, Math.min(settings.maxStoreBytes - log, free < settings.minFreeBytes ? total - (settings.minFreeBytes - free) : Infinity));
  }
  /**
   * Bring the store (`storeBytes`) under its bound, to 90% of it: first unlinked blobs, then the event streams of
   * unpinned calls, oldest first, then whole unpinned calls. A call is pinned when it is marked so, annotated, or linked
   * to a case. Returns the bytes freed.
   *
   * Work happens in short write transactions (one page of blob candidates or `EVICTION_CHUNK` calls), so writers in
   * other processes wait at most one of them. A finite work limit bounds the inspected blob candidates and processed call
   * rows; the orphan and event sweeps keep cursors in `meta`, so repeated passes resume instead of rescanning what they
   * passed. Automatic writes use that mode so a large store cannot stall the executing model; explicit eviction defaults
   * to all the work needed for the bound. Freed database pages go back to the medium when the database has incremental
   * auto-vacuum (`compact` converts an older one).
   */
  evict(maxBytes = this.bound(), workLimit = Infinity) {
    if (workLimit !== Infinity && (!Number.isSafeInteger(workLimit) || workLimit < 2))
      throw new RangeError("eviction work limit must be an integer of at least 2");
    const before = this.storeBytes();
    if (before <= maxBytes) return 0;
    const target = Math.floor(maxBytes * 0.9);
    const unpinned = `pinned = 0 AND call_id NOT IN (SELECT call_id FROM case_calls)`;
    const over = () => this.storeBytes() > target;
    let remaining = workLimit;
    const cursor = (key) => this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key)?.value ?? "";
    const setCursor = (key, value) => this.db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
    const orphanPage = (after, size) => {
      const rows = this.db.prepare("SELECT hash FROM blobs WHERE hash > ? ORDER BY hash LIMIT ?").all(after, size);
      this.collectHashes(rows.map((row) => row.hash));
      return rows.map((row) => row.hash);
    };
    if (remaining !== Infinity) {
      const size = Math.min(256, Math.floor(remaining / 2));
      remaining -= this.inWrite(() => {
        const start = cursor("orphan_sweep_cursor");
        let hashes = orphanPage(start, size);
        if (!hashes.length && start) hashes = orphanPage("", size);
        setCursor("orphan_sweep_cursor", hashes.at(-1) ?? "");
        return hashes.length;
      });
    } else {
      for (let after = ""; over(); ) {
        const hashes = this.inWrite(() => orphanPage(after, 256));
        if (hashes.length < 256) break;
        after = hashes.at(-1);
      }
    }
    let eventsCursor = cursor("events_sweep_cursor");
    while (over() && remaining > 0) {
      const count = this.inWrite(() => {
        const [at = "", id = ""] = eventsCursor ? JSON.parse(eventsCursor) : [];
        const rows = this.db.prepare(`SELECT call_id, started_at FROM calls WHERE events_hash IS NOT NULL AND ${unpinned}
          AND started_at >= ? AND (started_at > ? OR call_id > ?) ORDER BY started_at ASC, call_id ASC LIMIT ?`).all(at, at, id, Math.min(EVICTION_CHUNK, remaining));
        for (const row of rows) {
          if (!over()) break;
          const hashes = this.db.prepare("SELECT hash FROM call_blobs WHERE call_id = ? AND kind = 'events'").all(row.call_id);
          this.db.prepare("UPDATE calls SET events_hash = NULL WHERE call_id = ?").run(row.call_id);
          this.db.prepare("DELETE FROM call_blobs WHERE call_id = ? AND kind = 'events'").run(row.call_id);
          this.collectHashes(hashes.map((item) => item.hash));
          eventsCursor = JSON.stringify([row.started_at, row.call_id]);
        }
        if (!rows.length) eventsCursor = "";
        setCursor("events_sweep_cursor", eventsCursor);
        return rows.length;
      });
      if (!count) break;
      remaining -= count;
    }
    while (over() && remaining > 0) {
      const count = this.inWrite(() => {
        const rows = this.db.prepare(`SELECT call_id FROM calls WHERE ${unpinned} ORDER BY started_at ASC LIMIT ?`).all(Math.min(EVICTION_CHUNK, remaining));
        for (const row of rows) {
          if (!over()) break;
          const hashes = this.db.prepare("SELECT hash FROM call_blobs WHERE call_id = ?").all(row.call_id);
          this.db.prepare("DELETE FROM calls WHERE call_id = ?").run(row.call_id);
          this.db.prepare("DELETE FROM call_blobs WHERE call_id = ?").run(row.call_id);
          this.collectHashes(hashes.map((item) => item.hash));
        }
        return rows.length;
      });
      if (!count) break;
      remaining -= count;
    }
    this.vacuumFreePages();
    return Math.max(0, before - this.storeBytes());
  }
  /** With incremental auto-vacuum, give free database pages back to the medium, a bounded step per transaction. */
  vacuumFreePages() {
    const mode = this.db.prepare("PRAGMA auto_vacuum").get();
    if (Number(mode.auto_vacuum) !== 2) return;
    for (let step = 0; step < 4096 && this.freeDatabaseBytes() > 0; step++) this.db.exec(`PRAGMA incremental_vacuum(${VACUUM_STEP_PAGES})`);
  }
  /**
   * Return the database's free pages to the medium. A database made before incremental auto-vacuum is converted first
   * (one VACUUM, which rewrites the database under the write lock: run it after `evict` has made the database small).
   * Returns the bytes the database files shrank by.
   */
  compact() {
    const before = this.medium.databaseBytes();
    const mode = this.db.prepare("PRAGMA auto_vacuum").get();
    if (Number(mode.auto_vacuum) !== 2) this.db.exec("PRAGMA auto_vacuum = INCREMENTAL; VACUUM;");
    this.vacuumFreePages();
    try {
      this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
    }
    return Math.max(0, before - this.medium.databaseBytes());
  }
  /** Delete affected blobs only when no call or compilation still references them. */
  collectHashes(hashes) {
    const orphan = this.db.prepare(`SELECT hash, bytes FROM blobs WHERE hash = ?
      AND NOT EXISTS (SELECT 1 FROM call_blobs WHERE call_blobs.hash = blobs.hash)
      AND NOT EXISTS (SELECT 1 FROM compilation_files WHERE compilation_files.hash = blobs.hash)`);
    const remove = this.db.prepare("DELETE FROM blobs WHERE hash = ?");
    let freed = 0;
    for (const hash of new Set(hashes)) {
      const row = orphan.get(hash);
      if (!row) continue;
      this.medium.deleteBlob(hash);
      remove.run(hash);
      freed += row.bytes;
    }
    return freed;
  }
  // --- Compilations -----------------------------------------------------------------------------------------------
  /** Bumped whenever compilations or case tiers change, so runtimes know to reload. */
  version() {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'compilations_version'").get();
    return row ? Number(row.value) : 0;
  }
  bump() {
    this.db.prepare(`INSERT INTO meta (key, value) VALUES ('compilations_version', '1')
      ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1`).run();
  }
  /** The compilation in use for a definition revision, with its files and cases. */
  currentCompilation(definitionKey2) {
    const row = this.db.prepare("SELECT * FROM compilations WHERE definition_key = ? AND status = 'current' ORDER BY created_at DESC LIMIT 1").get(definitionKey2);
    return row ? this.withFiles(row) : void 0;
  }
  compilation(id) {
    const row = this.db.prepare("SELECT * FROM compilations WHERE id = ?").get(id);
    return row ? this.withFiles(row) : void 0;
  }
  withFiles(row) {
    const files = Object.fromEntries(this.db.prepare("SELECT path, hash FROM compilation_files WHERE compilation_id = ?").all(row.id).map((file) => [file.path, this.blob(file.hash) ?? ""]));
    return { ...row, files, cases: this.cases(row.id) };
  }
  cases(compilationId) {
    return this.db.prepare("SELECT * FROM cases WHERE compilation_id = ? ORDER BY position").all(compilationId);
  }
  caseStats(hash) {
    return this.db.prepare(`SELECT cases.* FROM cases JOIN compilations ON compilations.id = cases.compilation_id
      WHERE cases.hash = ? ORDER BY compilations.status = 'current' DESC, compilations.created_at DESC LIMIT 1`).get(hash);
  }
  /** Compilations, newest first. */
  compilations(filter = {}) {
    const where = [], params = [];
    if (filter.definition) {
      where.push("(definition_key = ? OR definition_id = ? OR definition_name = ? OR definition_source = ?)");
      params.push(filter.definition, filter.definition, filter.definition, filter.definition);
    }
    if (filter.program) {
      where.push("program_root = ?");
      params.push(filter.program);
    }
    if (filter.status) {
      where.push("status = ?");
      params.push(filter.status);
    }
    return this.db.prepare(`SELECT * FROM compilations ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC LIMIT ?`).all(...params, filter.limit ?? 100);
  }
  /**
   * Store a compilation folder as the current one for its definition revision. Cases whose hash the previous
   * compilation already had keep their tier and counts; new cases start in shadow. Returns the compilation ID.
   */
  saveCompilation(input) {
    const folderHash = hexDigest(JSON.stringify(Object.entries(input.files).sort(([a], [b]) => a.localeCompare(b))));
    const id = `${input.definitionKey.slice(0, 12)}-${folderHash.slice(0, 12)}`;
    const previous = this.currentCompilation(input.definitionKey);
    const created = now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (previous && previous.id !== id)
        this.db.prepare("UPDATE compilations SET status = 'superseded' WHERE definition_key = ? AND status = 'current'").run(input.definitionKey);
      this.db.prepare(`INSERT OR REPLACE INTO compilations (id, definition_key, definition_id, definition_name, definition_source,
        interface_hash, program_root, folder_hash, parent_id, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'current')`).run(
        id,
        input.definitionKey,
        input.definitionId,
        input.definitionName,
        input.definitionSource,
        input.interfaceHash,
        input.programRoot,
        folderHash,
        previous && previous.id !== id ? previous.id : previous?.parent_id ?? null,
        created
      );
      this.db.prepare("DELETE FROM compilation_files WHERE compilation_id = ?").run(id);
      for (const [path, text] of Object.entries(input.files))
        this.db.prepare("INSERT INTO compilation_files (compilation_id, path, hash) VALUES (?, ?, ?)").run(id, path, this.putBlob(text));
      const kept = new Map((previous?.cases ?? []).map((item) => [item.hash, item]));
      this.db.prepare("DELETE FROM cases WHERE compilation_id = ?").run(id);
      input.caseHashes.forEach((hash, position) => {
        const old = kept.get(hash);
        this.db.prepare(`INSERT INTO cases (hash, compilation_id, position, tier, served, handed_off, compared, worse, better, audited,
          audit_worse, live_compared, live_worse, created_at, promoted_at, demoted_at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          hash,
          id,
          position,
          old?.tier ?? "shadow",
          old?.served ?? 0,
          old?.handed_off ?? 0,
          old?.compared ?? 0,
          old?.worse ?? 0,
          old?.better ?? 0,
          old?.audited ?? 0,
          old?.audit_worse ?? 0,
          old?.live_compared ?? 0,
          old?.live_worse ?? 0,
          old?.created_at ?? created,
          old?.promoted_at ?? null,
          old?.demoted_at ?? null,
          old?.note ?? null
        );
      });
      for (const link of input.links ?? []) this.linkCase(link.caseHash, link.callId, link.role, link.verdict ?? null);
      this.db.prepare("DELETE FROM declines WHERE definition_key = ?").run(input.definitionKey);
      this.bump();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    for (const hash of input.caseHashes) this.reviewTier(hash);
    return id;
  }
  setCompilationStatus(id, status) {
    this.db.prepare("UPDATE compilations SET status = ? WHERE id = ?").run(status, id);
    this.bump();
  }
  linkCase(caseHash, callId, role, verdict = null) {
    this.db.prepare(`INSERT INTO case_calls (case_hash, call_id, role, verdict, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(case_hash, call_id, role) DO UPDATE SET verdict = excluded.verdict`).run(caseHash, callId, role, verdict, now());
  }
  caseCalls(caseHash, role, limit = 100) {
    return this.db.prepare(`SELECT call_id, role, verdict, created_at FROM case_calls WHERE case_hash = ? ${role ? "AND role = ?" : ""}
      ORDER BY created_at DESC LIMIT ?`).all(...role ? [caseHash, role, limit] : [caseHash, limit]);
  }
  /** The cases a call is linked to (served by, learned from, audited by, ...). */
  callCases(callId) {
    return this.db.prepare("SELECT case_hash, role, verdict FROM case_calls WHERE call_id = ?").all(callId);
  }
  /** Count a served call or a hand-off for a case, and review its tier. */
  caseServed(caseHash, callId, handedOff) {
    this.db.prepare(`UPDATE cases SET ${handedOff ? "handed_off = handed_off + 1" : "served = served + 1"}
      WHERE hash = ? AND compilation_id IN (SELECT id FROM compilations WHERE status = 'current')`).run(caseHash);
    this.linkCase(caseHash, callId, handedOff ? "handed-off" : "served");
    if (handedOff) this.reviewTier(caseHash);
  }
  /** Record a comparison of a case against the agent (held-out replay, shadow, audit) and review its tier. */
  caseVerdict(caseHash, callId, role, verdict) {
    const worse = verdict === "worse" || verdict === "diverged" ? 1 : 0, better2 = verdict === "better" ? 1 : 0;
    const audit = role === "audit" ? 1 : 0, live2 = role === "held-out" ? 0 : 1;
    this.db.prepare(`UPDATE cases SET compared = compared + 1, worse = worse + ?, better = better + ?, audited = audited + ?,
      audit_worse = audit_worse + ?, live_compared = live_compared + ?, live_worse = live_worse + ?
      WHERE hash = ? AND compilation_id IN (SELECT id FROM compilations WHERE status = 'current')`).run(worse, better2, audit, audit * worse, live2, live2 * worse, caseHash);
    this.linkCase(caseHash, callId, role, verdict);
    this.reviewTier(caseHash);
  }
  /** A case's evidence in the shape every promotion policy judges (calls/evidence.ts), with its latest comparisons for recency. */
  caseSummary(caseHash) {
    const stats = this.caseStats(caseHash);
    if (!stats) return;
    const recent = this.db.prepare(`SELECT verdict FROM case_calls WHERE case_hash = ? AND verdict IS NOT NULL AND role IN ('held-out', 'shadow', 'audit')
      ORDER BY created_at DESC LIMIT ?`).all(caseHash, RECENT);
    return {
      subject: "case",
      id: caseHash,
      state: stats.tier,
      rule: ruleOf(this.settings()),
      evidence: {
        served: stats.served,
        handed_off: stats.handed_off,
        guard_misses: 0,
        infrastructure: 0,
        compared: stats.compared,
        worse: stats.worse,
        better: stats.better,
        live_compared: stats.live_compared ?? 0,
        live_worse: stats.live_worse ?? 0,
        audited: stats.audited,
        audit_worse: stats.audit_worse,
        recent_compared: recent.length,
        recent_worse: recent.filter((row) => row.verdict === "worse" || row.verdict === "diverged").length
      }
    };
  }
  /**
   * Promotion and demotion by evidence (§6.2), by the shared rule `crispPolicy` (calls/evidence.ts), applied as evidence
   * arrives. Under `promotionPolicy: 'nl'` the natural-language policy decides instead, from the specializer loop
   * (`reviewPromotions`, runtime/promotion.ts), so nothing happens here.
   */
  reviewTier(caseHash) {
    const summary = this.caseSummary(caseHash);
    if (!summary) return;
    if (this.settings().promotionPolicy === "nl") return summary.state;
    return this.decideTier(summary, crispPolicy(summary));
  }
  /** Apply a policy's decision about a case; `by` names the policy in the case's note. */
  decideTier(summary, verdict, by) {
    const tier = applyDecision(summary.state, verdict.decision);
    if (tier !== summary.state)
      this.setTier(summary.id, tier, `${tier === "demoted" ? "demoted" : "promoted"} by ${by ? `${by} policy: ${verdict.reason}` : "evidence"}`.slice(0, 300));
    return tier;
  }
  setTier(caseHash, tier, note) {
    const column = tier === "active" ? ", promoted_at = ?" : tier === "demoted" || tier === "disabled" ? ", demoted_at = ?" : "";
    this.db.prepare(`UPDATE cases SET tier = ?, note = ?${column} WHERE hash = ? AND compilation_id IN
      (SELECT id FROM compilations WHERE status = 'current')`).run(...[tier, note ?? null, ...column ? [now()] : [], caseHash]);
    this.bump();
  }
  // --- Declines ---------------------------------------------------------------------------------------------------
  decline(input) {
    this.db.prepare(`INSERT OR REPLACE INTO declines (definition_key, definition_id, reason, why, calls_at_decline, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(input.definitionKey, input.definitionId, input.reason, input.why, input.calls, now());
  }
  declineFor(definitionKey2) {
    return this.db.prepare("SELECT * FROM declines WHERE definition_key = ?").get(definitionKey2);
  }
  declines(limit = 100) {
    return this.db.prepare("SELECT * FROM declines ORDER BY created_at DESC LIMIT ?").all(limit);
  }
  // --- Findings: what compiling learned about the program or its executor (§5.3) ----------------------------------
  /** Record a finding; the same finding again (definition, kind, summary) updates it and counts it. */
  finding(input) {
    const fingerprint2 = hexDigest(JSON.stringify([input.definitionKey, input.kind, input.summary])).slice(0, 32);
    const at = now();
    this.db.prepare(`INSERT INTO findings (fingerprint, definition_key, definition_id, definition_name, definition_source, kind, summary, detail,
      created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(fingerprint) DO UPDATE SET detail = excluded.detail,
      seen = seen + 1, updated_at = excluded.updated_at`).run(
      fingerprint2,
      input.definitionKey,
      input.definitionId,
      input.definitionName,
      input.definitionSource,
      input.kind,
      input.summary,
      JSON.stringify(input.detail ?? {}),
      at,
      at
    );
  }
  /** Findings, newest first: open ones unless `all`. */
  findings(filter = {}) {
    const where = [], params = [];
    if (!filter.all) where.push("status = 'open'");
    if (filter.definition) {
      where.push("(definition_key = ? OR definition_id = ? OR definition_name = ? OR definition_source = ?)");
      params.push(...Array(4).fill(filter.definition));
    }
    return this.db.prepare(`SELECT * FROM findings ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC LIMIT ?`).all(...params, filter.limit ?? 100).map((row) => ({ ...row, detail: JSON.parse(row.detail) }));
  }
  /** Mark a finding acknowledged (it stays, and comes back open only if it is found again with a new summary). */
  acknowledgeFinding(id) {
    const row = this.db.prepare("UPDATE findings SET status = 'acknowledged' WHERE id = ? RETURNING id").get(id);
    return !!row;
  }
  // --- Spend and savings (what specializing costs, what serving saves) --------------------------------------------
  /** Tokens and time the specializer spent on a definition revision (writing, verifying, shadow replays, audits). */
  spent(definitionKey2, activity, tokens2, wallMs) {
    if (tokens2 <= 0 && wallMs <= 0) return;
    this.db.prepare("INSERT INTO spend (definition_key, activity, tokens, wall_ms, created_at) VALUES (?, ?, ?, ?, ?)").run(definitionKey2, activity, Math.round(tokens2), Math.round(wallMs), now());
  }
  /**
   * Per definition revision with a compilation or spend: calls served by cases, what the agent costs per call (the
   * average of its successful calls), the tokens and time saved by serving, and what specializing has cost.
   */
  savings(filter = {}) {
    const keys = this.db.prepare(`SELECT DISTINCT definition_key FROM compilations UNION SELECT DISTINCT definition_key FROM spend`).all();
    const rows = [];
    for (const { definition_key: key } of keys) {
      const agent = this.db.prepare(`SELECT definition_name, definition_source, COUNT(*) AS n, AVG(COALESCE(tokens_in, 0) + COALESCE(tokens_out, 0)) AS tokens,
        AVG(COALESCE(wall_ms, 0)) AS wall FROM calls WHERE definition_key = ? AND executor = 'agent' AND outcome = 'done' AND audit_of IS NULL`).get(key);
      const crisp = this.db.prepare(`SELECT COUNT(*) AS n, AVG(COALESCE(wall_ms, 0)) AS wall FROM calls WHERE definition_key = ? AND executor = 'crisp'`).get(key);
      const spend = this.db.prepare("SELECT COALESCE(SUM(tokens), 0) AS tokens, COALESCE(SUM(wall_ms), 0) AS wall FROM spend WHERE definition_key = ?").get(key);
      const name = agent.definition_name ?? this.db.prepare("SELECT definition_name FROM compilations WHERE definition_key = ? LIMIT 1").get(key)?.definition_name ?? key;
      if (filter.definition && ![key, name, agent.definition_source].includes(filter.definition)) continue;
      const tokensPerCall = Number(agent.tokens ?? 0), wallPerCall = Number(agent.wall ?? 0);
      rows.push({
        definition_key: key,
        definition_name: name,
        definition_source: agent.definition_source,
        agent_calls: Number(agent.n),
        served: Number(crisp.n),
        agent_tokens_per_call: Math.round(tokensPerCall),
        agent_ms_per_call: Math.round(wallPerCall),
        crisp_ms_per_call: Math.round(Number(crisp.wall ?? 0)),
        saved_tokens: Math.round(Number(crisp.n) * tokensPerCall),
        saved_ms: Math.round(Number(crisp.n) * Math.max(0, wallPerCall - Number(crisp.wall ?? 0))),
        spent_tokens: Number(spend.tokens),
        spent_ms: Number(spend.wall)
      });
    }
    return rows.sort((a, b) => b.saved_tokens - b.spent_tokens - (a.saved_tokens - a.spent_tokens));
  }
  // --- Offline jobs (shadow replays and audits) -------------------------------------------------------------------
  enqueue(kind2, caseHash, callId) {
    this.db.prepare(`INSERT OR IGNORE INTO jobs (kind, case_hash, call_id, status, enqueued_at) VALUES (?, ?, ?, 'pending', ?)`).run(kind2, caseHash, callId, now());
    this.pin(callId);
  }
  pendingJobs(limit = 50) {
    return this.db.prepare("SELECT id, kind, case_hash, call_id, enqueued_at FROM jobs WHERE status = 'pending' ORDER BY id LIMIT ?").all(limit);
  }
  finishJob(id, status, verdict, detail) {
    this.db.prepare("UPDATE jobs SET status = ?, verdict = ?, detail = ?, done_at = ? WHERE id = ?").run(status, verdict ?? null, detail ?? null, now(), id);
  }
  jobs(caseHash, limit = 100) {
    return this.db.prepare(`SELECT * FROM jobs ${caseHash ? "WHERE case_hash = ?" : ""} ORDER BY id DESC LIMIT ?`).all(...caseHash ? [caseHash, limit] : [limit]);
  }
  /** iterateOn site statistics kept in the store (runtime/iterate.ts), shared by every runtime on the machine. */
  iterationStatistics() {
    return this.statistics ??= {
      read: (key) => {
        const row = this.db.prepare("SELECT value FROM iteration_statistics WHERE key = ?").get(key);
        return row ? JSON.parse(row.value) : void 0;
      },
      write: (key, value) => {
        this.db.prepare(`INSERT INTO iteration_statistics (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(key, JSON.stringify(value), now());
      },
      reset: (prefix = "") => {
        this.db.prepare("DELETE FROM iteration_statistics WHERE key LIKE ? ESCAPE '\\'").run(`${prefix.replace(/[\\%_]/g, (character) => `\\${character}`)}%`);
      },
      export: () => Object.fromEntries(this.db.prepare("SELECT key, value FROM iteration_statistics").all().map((row) => [row.key, JSON.parse(row.value)]))
    };
  }
  statistics;
  /**
   * Refinement verdicts (`Is<T, P>`, native/refinement.ts) kept with the machine's records: P(true) by content key
   * (value hash, normalized predicate, judge id), so a value is not judged twice in any process. The table is created on
   * open like every other, so existing stores gain it without a version bump.
   */
  refinementVerdicts() {
    return this.verdicts ??= {
      get: (key) => {
        const row = this.db.prepare("SELECT probability, judge FROM refinement_verdicts WHERE key = ?").get(key);
        return row ? { probability: row.probability, judge: row.judge } : void 0;
      },
      set: (key, verdict) => {
        this.db.prepare(`INSERT INTO refinement_verdicts (key, probability, judge, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET probability = excluded.probability, judge = excluded.judge, created_at = excluded.created_at`).run(key, verdict.probability, verdict.judge, now());
      },
      count: () => this.db.prepare("SELECT COUNT(*) AS n FROM refinement_verdicts").get().n,
      clear: () => {
        this.db.prepare("DELETE FROM refinement_verdicts").run();
      }
    };
  }
  verdicts;
  /** Bytes the store's files take on the medium now: blob files as allocated and the database files, free pages included. */
  diskBytes() {
    let bytes = this.counter("blob_disk_bytes");
    try {
      bytes += this.medium.databaseBytes();
    } catch {
    }
    return bytes;
  }
};

// src/calls/store.ts
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, statfsSync, writeFileSync } from "node:fs";
import { dirname as dirname2, join, resolve as resolve2 } from "node:path";
var PROCESS_SCOPE = (() => {
  let boot = "", namespace = "";
  try {
    boot = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
  } catch {
  }
  try {
    namespace = readlinkSync("/proc/self/ns/pid").replace(/\D/g, "");
  } catch {
  }
  return `${boot}:${namespace}`;
})();
var require2 = createRequire(import.meta.url);
var DatabaseSync;
function sqlite() {
  if (DatabaseSync) return DatabaseSync;
  const emit = process.emitWarning;
  process.emitWarning = ((warning2, ...rest) => {
    if (String(warning2?.message ?? warning2).includes("SQLite")) return;
    return emit.call(process, warning2, ...rest);
  });
  try {
    DatabaseSync = require2("node:sqlite").DatabaseSync;
  } finally {
    process.emitWarning = emit;
  }
  return DatabaseSync;
}
var FileMedium = class {
  constructor(root, mode) {
    this.root = root;
    this.mode = mode;
    mkdirSync(join(root, "blobs"), { recursive: true });
  }
  root;
  mode;
  process = { pid: process.pid, scope: PROCESS_SCOPE };
  blobPath(hash) {
    return join(this.root, "blobs", hash.slice(0, 2), hash.slice(2));
  }
  putBlob(hash, text) {
    const path = this.blobPath(hash);
    if (existsSync(path)) return false;
    mkdirSync(dirname2(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}`;
    writeFileSync(temporary, text);
    renameSync(temporary, path);
    return true;
  }
  blob(hash) {
    try {
      return readFileSync(this.blobPath(hash), "utf8");
    } catch {
      return void 0;
    }
  }
  deleteBlob(hash) {
    rmSync(this.blobPath(hash), { force: true });
  }
  readConfig() {
    return JSON.parse(readFileSync(join(this.root, "config.json"), "utf8"));
  }
  writeConfig(config) {
    writeFileSync(join(this.root, "config.json"), JSON.stringify(config, null, 2) + "\n");
  }
  freeBytes() {
    const stats = statfsSync(this.root);
    return Number(stats.bavail) * Number(stats.bsize);
  }
  databaseBytes() {
    let bytes = 0;
    for (const name of ["calls.sqlite", "calls.sqlite-wal", "calls.sqlite-shm"]) try {
      bytes += statSync(join(this.root, name)).size;
    } catch {
    }
    return bytes;
  }
  blobBlockBytes() {
    return Number(statfsSync(this.root).bsize) || 4096;
  }
  /** The WAL and its index as they are, at least the WAL's truncation size (JOURNAL_SIZE_LIMIT) plus the index. */
  logBytes() {
    let wal = 0, shm = 0;
    try {
      wal = statSync(join(this.root, "calls.sqlite-wal")).size;
    } catch {
    }
    try {
      shm = statSync(join(this.root, "calls.sqlite-shm")).size;
    } catch {
    }
    return Math.max(wal, JOURNAL_SIZE_LIMIT) + Math.max(shm, 32768);
  }
  modeOverride() {
    return this.mode?.();
  }
  /**
   * A row's process is known gone when the row is from an earlier boot, or from this PID namespace and no process has
   * its PID. A row from another namespace (a container) is not: its PID means nothing here.
   */
  gone(pid, scope) {
    const [boot, namespace] = PROCESS_SCOPE.split(":");
    const [rowBoot, rowNamespace] = (scope ?? "").split(":");
    if (rowBoot && boot && rowBoot !== boot) return true;
    if (pid === null || (rowNamespace ? rowNamespace !== namespace : !!scope)) return false;
    try {
      process.kill(pid, 0);
      return false;
    } catch (error) {
      return error.code === "ESRCH";
    }
  }
};
var JOURNAL_SIZE_LIMIT = 4 * 2 ** 20;
var opened = /* @__PURE__ */ new Map();
function openCallStore(root, options = {}) {
  const absolute = resolve2(root);
  let store = opened.get(absolute);
  if (store) return store;
  const medium = new FileMedium(absolute, options.mode);
  const db = new (sqlite())(join(absolute, "calls.sqlite"));
  db.exec(`PRAGMA busy_timeout = 60000; PRAGMA auto_vacuum = INCREMENTAL; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA journal_size_limit = ${JOURNAL_SIZE_LIMIT};`);
  store = new CallStore(absolute, db, medium);
  store.onClose = () => opened.delete(absolute);
  opened.set(absolute, store);
  return store;
}
CallStore.opener = openCallStore;

// src/machine-store.ts
import { homedir, tmpdir } from "node:os";
import { join as join2, resolve as resolve3 } from "node:path";
function machineStoreRoot(env = process.env, home = homedir()) {
  const configured = env.NATLANG_CALL_STORE?.trim();
  if (configured && ["off", "0", "false", "none"].includes(configured.toLowerCase())) return null;
  return resolve3(configured || join2(env.XDG_DATA_HOME || join2(home, ".local", "share"), "natlang", "calls"));
}
function openMachineStore(root, env = process.env) {
  return CallStore.open(root, { mode: () => env.NATLANG_SPECIALIZATION });
}

// src/runtime/platform.ts
function realmPlatform(config) {
  const authority = config.authority ?? `${config.name}-realm`;
  const environment = (mode) => new RealmEnvironment({
    authority,
    mode,
    realm: () => config.realm,
    bindAwait: config.contextStore.bindAwait?.bind(config.contextStore),
    fork: () => environment("fresh")
  });
  return {
    name: config.name,
    contextStore: config.contextStore,
    environment: () => environment("fresh"),
    moduleRealm: () => environment("retained"),
    callStore: config.callStore,
    builtinModules: config.builtinModules
  };
}

// src/runtime/promotion.ts
function sanitizeDecision(value) {
  const answer = value;
  const decision = answer?.decision;
  if (decision === "promote" || decision === "keep" || decision === "demote")
    return { decision, reason: typeof answer?.reason === "string" && answer.reason ? answer.reason : "(no reason given)" };
  return { decision: "keep", reason: "the policy gave no valid decision" };
}
function promotionPolicy(mode, nl2) {
  return pluggable(
    {
      crisp: (summary) => crispPolicy(summary),
      nl: async (summary) => sanitizeDecision(await nl2(summary))
    },
    mode,
    { name: "promotion", serve: "crisp", same: (crisp, other) => crisp.decision === other.decision }
  );
}
async function reviewPromotions(store, nl2, options = {}) {
  const mode = options.mode ?? store.settings().promotionPolicy;
  if (mode === "crisp") return [];
  const policy = promotionPolicy(mode, nl2);
  const reviewed = [];
  const apply = mode === "nl";
  for (const compilation of store.compilations({ status: "current", limit: 1e3 })) {
    for (const item of store.cases(compilation.id)) {
      if (item.tier === "disabled" || item.tier === "demoted") continue;
      const summary = store.caseSummary(item.hash);
      if (!summary) continue;
      const decision = await policy(summary);
      const tier = apply ? store.decideTier(summary, decision, "nl") : summary.state;
      reviewed.push({ subject: "case", id: item.hash, state: summary.state, decision, applied: tier !== summary.state });
    }
  }
  const rule = ruleOf(store.settings());
  const ledger = new TierLedger();
  ledger.hydrate(store, void 0, (tier) => tier === "tier2" || tier.startsWith("tier3:") ? "shadow" : "active", rule);
  for (const { fn, tier, row, call } of ledger.entries()) {
    if (tier === "tier0" || tier === "tier3") continue;
    const state = row.state;
    const decision = await policy(summaryOfTier(`${fn}/${tier}`, row, rule));
    const event = apply ? ledger.decide(fn, tier, decision, "nl") : void 0;
    if (event && call) store.annotate(call, "tier", { ...event, call_id: call, state }, "policy", false);
    reviewed.push({ subject: "tier", id: `${fn}/${tier}`, state, decision, applied: !!event });
  }
  return reviewed;
}

// src/runtime/selected-events.ts
function eventData(value, active = /* @__PURE__ */ new Set()) {
  if (value === null || ["string", "boolean"].includes(typeof value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object" || active.has(value)) throw new TypeError("Event payloads require acyclic finite JSON data");
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if (!array && prototype !== null && prototype !== Object.prototype) throw new TypeError("Event payloads require ordinary data records");
  active.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value), result = array ? [] : /* @__PURE__ */ Object.create(null);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (array && key === "length") continue;
    const descriptor = Reflect.get(descriptors, key);
    if (typeof key !== "string" || !("value" in descriptor) || !descriptor.enumerable)
      throw new TypeError("Event payloads cannot contain accessors, symbols or hidden properties");
    Object.defineProperty(result, key, { value: eventData(descriptor.value, active), enumerable: true, writable: true, configurable: true });
  }
  if (array && (result.length !== descriptors.length.value || Object.keys(result).length !== result.length))
    throw new TypeError("Event payload arrays must be dense JSON arrays");
  active.delete(value);
  return result;
}
var SelectedEventQueue = class _SelectedEventQueue {
  constructor(source, capacity, receipt = () => {
  }, historyCapacity = 65536) {
    this.source = source;
    this.capacity = capacity;
    this.receipt = receipt;
    this.historyCapacity = historyCapacity;
    if (typeof source !== "string" || !source || !Number.isSafeInteger(capacity) || capacity < 1 || !Number.isSafeInteger(historyCapacity) || historyCapacity < capacity)
      throw new TypeError("Event ingress needs a source identity and positive bounded capacity");
  }
  source;
  capacity;
  receipt;
  historyCapacity;
  buffered = [];
  seen = /* @__PURE__ */ new Map();
  space = [];
  waiting;
  state = "open";
  failure;
  receiptFailed = false;
  position = 0;
  [Symbol.asyncIterator]() {
    return this;
  }
  get pending() {
    return this.buffered.length;
  }
  get status() {
    return this.state;
  }
  emit(value) {
    if (this.receiptFailed) return;
    try {
      this.receipt(Object.freeze(value));
    } catch (error) {
      this.receiptFailed = true;
      this.failure = this.state === "failed" || this.state === "cancelled" ? new AggregateError([this.failure, error], "Event source and receipt observer failed") : error;
      if (this.state !== "cancelled") this.state = "failed";
      for (const writer of this.space.splice(0)) writer.reject(this.failure);
      this.waiting?.reject(this.failure);
      this.waiting = void 0;
    }
  }
  open() {
    if (this.state !== "open") throw this.failure ?? new Error(`Event source is ${this.state}`);
  }
  /** A pausable source awaits admission. Concurrent producers remain bounded. */
  async push(id, value) {
    if (typeof id !== "string" || !id) throw new TypeError("Event delivery requires a stable identity");
    const text = canonical(eventData(value)), digest = fingerprint(text, "natlang.event/1");
    const known = this.seen.get(id);
    if (known) {
      if (known.digest !== digest) throw new Error("Event identity was reused with another payload");
      const receipt2 = { source: this.source, id, position: known.position, disposition: "duplicate" };
      this.emit(receipt2);
      return receipt2;
    }
    this.open();
    while (this.buffered.length >= this.capacity && !this.seen.has(id)) {
      this.open();
      if (this.space.length >= this.capacity) {
        this.emit({ source: this.source, id, disposition: "overflow" });
        throw new RangeError("Event ingress waiting producers exceed its bound");
      }
      await new Promise((resolve7, reject) => this.space.push({ resolve: resolve7, reject }));
    }
    const receipt = this.post(id, JSON.parse(text));
    if (this.buffered.length < this.capacity) this.space.shift()?.resolve();
    return receipt;
  }
  /** A source that cannot pause gets an explicit overflow disposition. */
  post(id, value) {
    if (typeof id !== "string" || !id) throw new TypeError("Event delivery requires a stable identity");
    const text = canonical(eventData(value)), digest = fingerprint(text, "natlang.event/1");
    const known = this.seen.get(id);
    if (known) {
      if (known.digest !== digest) throw new Error("Event identity was reused with another payload");
      const receipt2 = { source: this.source, id, position: known.position, disposition: "duplicate" };
      this.emit(receipt2);
      return receipt2;
    }
    this.open();
    if (this.seen.size >= this.historyCapacity) {
      this.emit({ source: this.source, id, disposition: "overflow" });
      throw new RangeError("Event delivery history is full; checkpoint and rotate the declared source epoch");
    }
    if (this.buffered.length >= this.capacity) {
      this.emit({ source: this.source, id, disposition: "overflow" });
      throw new RangeError("Event queue overflow; pause the producer or increase its declared capacity");
    }
    const event = Object.freeze({ source: this.source, id, position: this.position++, value: JSON.parse(text) });
    this.seen.set(id, { position: event.position, digest });
    const receipt = { source: this.source, id, position: event.position, disposition: "buffered" };
    const waiting = this.waiting;
    this.waiting = void 0;
    if (waiting) waiting.resolve({ value: event, done: false });
    else this.buffered.push(event);
    this.emit(receipt);
    if (waiting) this.emit({ ...receipt, disposition: "delivered" });
    return receipt;
  }
  next() {
    if (this.buffered.length) {
      const value = this.buffered.shift();
      this.space.shift()?.resolve();
      this.emit({ source: this.source, id: value.id, position: value.position, disposition: "delivered" });
      return Promise.resolve({ value, done: false });
    }
    if (this.state === "failed" || this.state === "cancelled") return Promise.reject(this.failure);
    if (this.state === "closed") return Promise.resolve({ value: void 0, done: true });
    if (this.waiting) return Promise.reject(new Error("Event source has one owning consumer"));
    return new Promise((resolve7, reject) => {
      this.waiting = { resolve: resolve7, reject };
    });
  }
  close() {
    if (this.state !== "open") return;
    this.state = "closed";
    this.emit({ source: this.source, disposition: "closed" });
    for (const writer of this.space.splice(0)) writer.reject(new Error("Event source closed before admission"));
    this.waiting?.resolve({ value: void 0, done: true });
    this.waiting = void 0;
  }
  fail(error) {
    this.stop("failed", error);
  }
  cancel(error = new Error("Event source cancelled")) {
    this.stop("cancelled", error);
  }
  stop(state, error) {
    if (this.state === "failed" || this.state === "cancelled" || this.state === "closed" && state !== "cancelled") return;
    this.state = state;
    this.failure = error;
    this.emit({ source: this.source, disposition: state });
    for (const writer of this.space.splice(0)) writer.reject(error);
    this.waiting?.reject(error);
    this.waiting = void 0;
    if (state === "cancelled") for (const event of this.buffered.splice(0))
      this.emit({ source: this.source, id: event.id, position: event.position, disposition: "cancelled" });
  }
  return() {
    this.cancel();
    return Promise.resolve({ value: void 0, done: true });
  }
  checkpoint() {
    if (this.waiting || this.space.length || !["open", "closed"].includes(this.state))
      throw new Error("Checkpoint event ingress at a settled admission boundary");
    return structuredClone({
      schema: "natlang-event-queue/1",
      source: this.source,
      capacity: this.capacity,
      historyCapacity: this.historyCapacity,
      nextPosition: this.position,
      state: this.state,
      buffered: this.buffered,
      seen: [...this.seen]
    });
  }
  static restore(snapshot3, receipt) {
    if (snapshot3?.schema !== "natlang-event-queue/1" || !["open", "closed"].includes(snapshot3.state) || !Number.isSafeInteger(snapshot3.nextPosition) || snapshot3.nextPosition < 0 || !Array.isArray(snapshot3.buffered) || !Array.isArray(snapshot3.seen))
      throw new TypeError("Invalid selected event checkpoint");
    const queue = new _SelectedEventQueue(snapshot3.source, snapshot3.capacity, receipt, snapshot3.historyCapacity);
    if (snapshot3.seen.length > queue.historyCapacity) throw new RangeError("Event checkpoint exceeds history capacity");
    if (snapshot3.buffered.length > snapshot3.capacity) throw new RangeError("Event checkpoint exceeds queue capacity");
    const positions = /* @__PURE__ */ new Set();
    for (const [id, record] of snapshot3.seen) {
      if (typeof id !== "string" || !id || queue.seen.has(id) || !Number.isSafeInteger(record.position) || record.position < 0 || record.position >= snapshot3.nextPosition || positions.has(record.position) || !/^[0-9a-f]{64}$/.test(record.digest))
        throw new TypeError("Invalid event delivery ledger");
      positions.add(record.position);
      queue.seen.set(id, { ...record });
    }
    if (positions.size !== snapshot3.nextPosition) throw new TypeError("Event checkpoint is missing delivery history");
    let prior = -1;
    for (const event of snapshot3.buffered) {
      const known = queue.seen.get(event.id);
      if (event.source !== snapshot3.source || event.position <= prior || known?.position !== event.position || known.digest !== fingerprint(canonical(eventData(event.value)), "natlang.event/1"))
        throw new TypeError("Event checkpoint payload or order disagrees with delivery ledger");
      prior = event.position;
      queue.buffered.push(structuredClone(event));
    }
    queue.position = snapshot3.nextPosition;
    queue.state = snapshot3.state;
    return queue;
  }
};
async function foldSelectedEvents(source, initial, step) {
  let state = initial;
  for await (const event of source) state = await step(state, event.value, event);
  return state;
}
function mapSelectedEvents(source, select, concurrency) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1)
    throw new RangeError("Selected Map concurrency must be a positive integer");
  const iterator = source[Symbol.asyncIterator]();
  const abort = new AbortController();
  let closed = false, cancelled = false, stop, closing = null;
  const cancellation = new Promise((resolve7) => {
    stop = () => resolve7({ kind: "cancel" });
  });
  const closeInput = () => closed ? Promise.resolve() : closing ??= Promise.resolve().then(() => iterator.return?.());
  const pending = [];
  const output = (async function* () {
    let reading = null;
    try {
      while (!closed || pending.length) {
        if (cancelled) return;
        if (!closed && !reading && pending.length < concurrency)
          reading = Promise.resolve(iterator.next()).then(
            (next) => ({ kind: "input", next }),
            (error) => ({ kind: "input-error", error })
          );
        const candidates = [cancellation];
        if (reading) candidates.push(reading);
        if (pending.length) candidates.push(pending[0].then((result) => ({ kind: "output", result })));
        const ready = await Promise.race(candidates);
        if (cancelled || ready.kind === "cancel") return;
        if (ready.kind === "input-error") throw ready.error;
        if (ready.kind === "input") {
          reading = null;
          if (ready.next.done) {
            closed = true;
            continue;
          }
          const event = ready.next.value;
          pending.push(Promise.resolve().then(() => select(event.value, event, abort.signal)).then(
            (value) => ({ value: Object.freeze({ ...event, value }) }),
            (error) => ({ error })
          ));
        } else {
          pending.shift();
          if ("error" in ready.result) throw ready.result.error;
          yield ready.result.value;
        }
      }
    } finally {
      abort.abort(new Error("Selected Map consumer closed"));
      await closeInput();
      void Promise.all(pending);
    }
  })();
  const finish = output.return.bind(output), fail2 = output.throw.bind(output);
  const cancel = (reason) => {
    cancelled = true;
    abort.abort(reason);
    stop();
    return closeInput();
  };
  output.return = (value) => {
    const closing2 = cancel(new Error("Selected Map consumer closed"));
    return Promise.all([finish(value), closing2]).then(([result]) => result);
  };
  output.throw = (error) => {
    const closing2 = cancel(error);
    return Promise.all([fail2(error), closing2]).then(([result]) => result);
  };
  return output;
}

// src/exact-capture/host-capture.ts
var OUTPUT_ORIGIN = "observed-host-result; not a model-generated writer target";
function hostCaptures(store, callId, spec = {}) {
  const record = store.call(callId);
  if (!record) return void 0;
  const base = { call_id: record.call_id, parent_call_id: record.parent_call_id, definition_source: record.definition.source };
  const exact = (ref) => {
    if (!ref) return { complete: false, reason: "missing" };
    if (!ref.complete) return { complete: false, reason: ref.reason === "oversize" ? "oversize" : "nonportable" };
    if (spec.maxBytes !== void 0 && ref.bytes > spec.maxBytes) return { complete: false, reason: "oversize" };
    const value = store.value(ref);
    if (value === void 0) return { complete: false, reason: "nonportable" };
    return { complete: true, value, bytes: ref.bytes, value_sha256: ref.hash };
  };
  const captures = (spec.inputArguments ?? []).map((name) => ({
    capture_kind: "invocation_input",
    ...base,
    name,
    ...exact(record.inputs[name])
  }));
  if (spec.output && record.outcome === "done") {
    const actions = store.events?.(callId)?.filter((event) => event.kind === "action");
    captures.push({
      capture_kind: "invocation_output",
      ...base,
      name: "return",
      ...exact(record.output),
      result_type: record.definition.returns ?? null,
      terminal_action_seq: actions?.at(-1)?.seq ?? null,
      origin: OUTPUT_ORIGIN
    });
  }
  return captures;
}

// src/calls/replay.ts
var ReplayDivergence = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ReplayDivergence";
  }
};
var canonical2 = (value) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
var sameData = (left, right) => {
  try {
    return canonical2(left ?? null) === canonical2(right ?? null);
  } catch {
    return false;
  }
};
var plain = (value) => {
  try {
    return value === void 0 ? void 0 : JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};
function subtreeEffects(store, record) {
  const pending = [record], records = [], seen = /* @__PURE__ */ new Set();
  while (pending.length) {
    const current2 = pending.pop();
    if (seen.has(current2.call_id)) throw new ReplayDivergence("call graph repeats an invocation or contains a cycle");
    seen.add(current2.call_id);
    if (current2.task_id !== record.task_id) throw new ReplayDivergence("call graph crosses task identities");
    records.push(current2);
    const children = store.children(current2.call_id);
    const ids = children.map((child) => child.call_id);
    if (new Set(ids).size !== ids.length) throw new ReplayDivergence("call store repeats a child identity");
    if (current2.graph_custody && !graphCustodyMatches(current2, ids))
      throw new ReplayDivergence("captured child inventory differs from stored call graph");
    for (const id of ids) {
      const child = store.call(id);
      if (!child || child.parent_call_id !== current2.call_id) throw new ReplayDivergence("recorded child call is missing or has another parent");
      pending.push(child);
    }
  }
  const current = records.some((item) => !!item.graph_custody);
  if (current && records.some((item) => !item.graph_custody))
    throw new ReplayDivergence("call graph has incomplete chronology custody");
  const effects = records.flatMap((item) => item.effects.map((effect) => ({ effect, call: item.call_id })));
  if (!current) {
    if (records.length > 1 && effects.length > 0)
      throw new ReplayDivergence("historical cross-call effect chronology is unknown");
    if (effects.length > 0)
      throw new ReplayDivergence("historical cached-effect value custody is unknown");
    return [];
  }
  const orders = /* @__PURE__ */ new Set();
  for (const { effect } of effects) {
    const order = effect.graph_order;
    if (!Number.isSafeInteger(order) || order < 0 || orders.has(order))
      throw new ReplayDivergence("task-wide effect chronology is missing or repeated");
    orders.add(order);
  }
  return effects.sort((a, b) => a.effect.graph_order - b.effect.graph_order).map((item) => loadEffect(store, item.effect));
}
function checkedValue(store, ref) {
  if (!ref?.complete) return void 0;
  const value = store.value(ref);
  if (value === void 0) throw new ReplayDivergence("recorded value is missing");
  const text = JSON.stringify(value);
  if (typeof text !== "string" || hexDigest(text) !== ref.hash || new TextEncoder().encode(text).byteLength !== ref.bytes)
    throw new ReplayDivergence("recorded value differs from its content binding");
  return value;
}
function loadEffect(store, effect) {
  return {
    service: effect.service,
    method: effect.method,
    args: checkedValue(store, effect.args),
    result: checkedValue(store, effect.result),
    async: effect.async ?? false,
    ...effect.error ? { error: effect.error } : {},
    complete: effect.args.complete && (effect.error !== void 0 || !!effect.result?.complete)
  };
}
var ReplayServices = class {
  constructor(effects, names = [], options = {}) {
    this.effects = effects;
    this.options = options;
    if (options.mode === "independent-exact") {
      const contract = options.contract;
      if (!contract || contract.schema !== "natlang.independent-service-replay/1" || contract.semantics !== "stateless-independent" || !Array.isArray(contract.methods) || contract.methods.some((method) => typeof method !== "string") || new Set(contract.methods).size !== contract.methods.length || effects.some((effect) => !contract.methods.includes(`${effect.service}.${effect.method}`)) || contract.effects_sha256 !== hexDigest(canonical2(effects)) || contract.sha256 !== hexDigest(canonical2({
        schema: contract.schema,
        semantics: contract.semantics,
        methods: contract.methods,
        effects_sha256: contract.effects_sha256
      })))
        throw new Error("independent replay requires an exact source-bound stateless service contract");
    }
    const all = [.../* @__PURE__ */ new Set([...names, ...effects.map((effect) => effect.service)])];
    this.services = Object.fromEntries(all.map((name) => [name, new Proxy(/* @__PURE__ */ Object.create(null), {
      get: (_target, property) => typeof property !== "string" || property === "then" ? void 0 : (...args) => this.answer(name, property, args),
      has: () => true
    })]));
  }
  effects;
  options;
  services;
  observed = [];
  divergences = [];
  used = /* @__PURE__ */ new Set();
  answer(service, method, given) {
    const args = plain(given);
    this.observed.push({ service, method, args });
    const open = (effect2, at) => !this.used.has(at) && effect2.service === service && effect2.method === method && effect2.complete;
    const ordered = this.options.mode !== "independent-exact";
    let index = ordered ? this.used.size : this.effects.findIndex((effect2, at) => open(effect2, at) && sameData(effect2.args, args));
    if (ordered) {
      const expected = this.effects[index];
      if (!expected || !open(expected, index) || !sameData(expected.args, args)) index = -1;
    }
    if (index < 0) {
      const message = `no recorded result for ${service}.${method}(${JSON.stringify(args).slice(1, -1).slice(0, 300)})`;
      this.divergences.push(message);
      throw new ReplayDivergence(`${message}: a replay cannot perform new effects`);
    }
    this.used.add(index);
    const effect = this.effects[index];
    if (effect.error !== void 0) {
      const error = new Error(effect.error);
      if (effect.async) return Promise.reject(error);
      throw error;
    }
    const result = plain(effect.result);
    return effect.async ? Promise.resolve(result) : result;
  }
  /** Recorded effects no replayed call used. */
  unused() {
    return this.effects.filter((_effect, index) => !this.used.has(index));
  }
};
function recordedArguments(store, record) {
  const args = {};
  for (const [name, ref] of [...Object.entries(record.captures), ...Object.entries(record.inputs)]) {
    if (!ref.complete) return void 0;
    const value = checkedValue(store, ref);
    if (name === "folder" && value && typeof value === "object" && "$folder" in value) {
      const files = {};
      for (const [path, file] of Object.entries(value.$folder)) {
        if (!file.complete) return void 0;
        files[path] = checkedValue(store, file);
      }
      args.folder = Folder.fromFiles(files).root();
      continue;
    }
    if (value === void 0) return void 0;
    args[name] = value;
  }
  return args;
}
async function replay(runtime, run, args, effects, options = {}) {
  const services = new ReplayServices(effects, options.serviceNames, { mode: options.replayMode, contract: options.contract });
  const before = Object.fromEntries((options.captureNames ?? []).map((name) => [name, args[name]]));
  const folder = args.folder;
  let value, error;
  try {
    value = await runtime.run(async () => {
      const frame = currentFrame();
      return runInFrame({ ...frame, services: services.services }, () => run(args));
    }, { name: "replay", ...options.taskOptions, services: services.services, specialization: "off" });
    value = plain(value);
  } catch (caught) {
    error = caught instanceof Error ? `${caught.name === "Error" ? "" : `${caught.name}: `}${caught.message}` : String(caught);
  }
  const captureWrites = Object.fromEntries(Object.entries(before).filter(([name, old]) => !Object.is(args[name], old)).map(([name]) => [name, plain(args[name])]));
  const files = folder?.folder ? folder.folder.diffSync().changes.map((change) => ({
    path: change.path,
    kind: change.kind,
    ...change.after ? { text: new TextDecoder().decode(change.after) } : {}
  })) : void 0;
  return {
    ...error === void 0 ? { value } : { error },
    observed: services.observed,
    divergences: services.divergences,
    captureWrites,
    ...files ? { files } : {}
  };
}

// src/calls/judge.ts
function recordedBehavior(store, record) {
  const failed = record.outcome !== "done";
  return {
    ...failed ? { error: `${record.outcome}: ${record.detail}` } : { value: store.value(record.output) },
    effects: subtreeEffects(store, record).map((effect) => ({ service: effect.service, method: effect.method, args: effect.args })),
    captureWrites: Object.fromEntries(record.capture_writes.map((write) => [write.name, store.value(write.after)])),
    files: record.folder?.changes.map((change) => ({
      path: change.path,
      kind: change.kind,
      ...change.after?.complete ? { text: store.value(change.after) } : {}
    })) ?? []
  };
}
function compareBehaviors(reference, candidate) {
  const differences = [];
  if (!!reference.error !== !!candidate.error) differences.push(reference.error ? "the reference failed; the candidate returned a value" : `the candidate failed: ${candidate.error}`);
  else if (!reference.error && !sameData(reference.value, candidate.value)) differences.push("the results differ");
  const key = (effect) => `${effect.service}.${effect.method}(${JSON.stringify(effect.args)})`;
  const left = reference.effects.map(key), right = candidate.effects.map(key);
  if (left.join("\n") !== right.join("\n")) {
    const sortedSame = [...left].sort().join("\n") === [...right].sort().join("\n");
    differences.push(sortedSame ? "the same service calls in a different order" : "the service calls differ");
  }
  if (!sameData(reference.captureWrites ?? {}, candidate.captureWrites ?? {})) differences.push("the captured variables written differ");
  const files = (behavior) => (behavior.files ?? []).map((file) => `${file.kind} ${file.path} ${file.text ?? ""}`).sort();
  if (!sameData(files(reference), files(candidate))) differences.push("the file changes differ");
  return { equal: differences.length === 0, differences };
}
var judgeDefinition = () => builtinDefinition("compareBehaviors");
var describe = (behavior) => {
  const cap = (text, limit = 6e3) => text.length > limit ? `${text.slice(0, limit)} \u2026(${text.length} characters)` : text;
  const json3 = (value) => {
    try {
      return JSON.stringify(value, null, 1) ?? "undefined";
    } catch {
      return String(value);
    }
  };
  return [
    behavior.error ? `It failed: ${behavior.error}` : `Result: ${cap(json3(behavior.value))}`,
    behavior.effects.length ? `Service calls, in order:
${behavior.effects.map((effect) => `- ${effect.service}.${effect.method}(${cap(JSON.stringify(effect.args ?? []).slice(1, -1), 600)})`).join("\n")}` : "No service calls.",
    ...behavior.captureWrites && Object.keys(behavior.captureWrites).length ? [`Variables written: ${cap(json3(behavior.captureWrites), 2e3)}`] : [],
    ...behavior.files?.length ? [`Files changed:
${behavior.files.map((file) => `- ${file.kind} ${file.path}${file.text !== void 0 ? `:
${cap(file.text, 2e3)}` : ""}`).join("\n")}`] : []
  ].join("\n");
};
async function judge(runtime, input) {
  const { equal, differences } = compareBehaviors(input.reference, input.candidate);
  if (equal) return { verdict: "equal", differences };
  const candidateFirst = parseInt(hexDigest(input.seed).slice(0, 2), 16) % 2 === 0;
  const task = [
    `Instructions:
${input.instructions}`,
    `Signature: ${input.signature}`,
    `Inputs: ${JSON.stringify(input.inputs, null, 1)?.slice(0, 8e3)}`,
    ...input.annotations?.length ? [`Feedback recorded about this call: ${JSON.stringify(input.annotations).slice(0, 3e3)}`] : []
  ].join("\n\n");
  const [first, second] = candidateFirst ? [input.candidate, input.reference] : [input.reference, input.candidate];
  const answer = await runtime.run(() => invokeDefinition(
    currentFrame(),
    judgeDefinition(),
    [task, describe(first), describe(second)],
    { manifest: { internal: true } }
  ), { specialization: "off", name: "judge" });
  const candidateWon = answer === "first" === candidateFirst;
  return { verdict: answer === "equal" ? "equivalent" : candidateWon ? "better" : "worse", differences };
}

// src/calls/mining.ts
import ts8 from "typescript";
function behaviorLabel(steps) {
  const folded = steps.filter((step, index) => step !== steps[index - 1]);
  return folded.length ? folded.join(" > ") : "none";
}
var splitOf = (callId) => parseInt(hexDigest(callId).slice(0, 4), 16) % 5 === 0 ? "held-out" : "training";
var LITERALS = /* @__PURE__ */ new Set([ts8.SyntaxKind.StringLiteral, ts8.SyntaxKind.NumericLiteral, ts8.SyntaxKind.NoSubstitutionTemplateLiteral]);
function scan(text) {
  const scanner = ts8.createScanner(ts8.ScriptTarget.ES2022, true, ts8.LanguageVariant.Standard, text);
  const out = [];
  for (let kind2 = scanner.scan(); kind2 !== ts8.SyntaxKind.EndOfFileToken; kind2 = scanner.scan()) out.push({ kind: kind2, text: scanner.getTokenText() });
  return out;
}
function approaches(examples) {
  const normalized = new Map(examples.map((example) => {
    const leaves = inputLeaves(example.args);
    return [example.callId, example.evals.map((code) => normalizeProgram(code, example.args, leaves))];
  }));
  const shapes = /* @__PURE__ */ new Map();
  for (const example of examples) {
    const programs = normalized.get(example.callId);
    const shape = programs.length ? programs.map((program) => scan(program).map((token) => LITERALS.has(token.kind) ? "$lit" : token.text).join(" ")).join("\n;;\n") : "";
    const list = shapes.get(shape) ?? [];
    list.push(example);
    shapes.set(shape, list);
  }
  const result = [];
  for (const [shape, group] of shapes) {
    const programs = group.map((example) => normalized.get(example.callId).map(scan));
    const template = [], holes = Object.fromEntries(group.map((example) => [example.callId, []]));
    let hole = 0;
    (programs[0] ?? []).forEach((first, programIndex) => {
      template.push(first.map((token, tokenIndex) => {
        const values = programs.map((program) => program[programIndex]?.[tokenIndex]?.text ?? "");
        if (!LITERALS.has(token.kind) || values.every((value) => value === token.text)) return token.text;
        const name = `$h${hole++}`;
        group.forEach((example, index) => holes[example.callId].push(values[index]));
        return name;
      }).join(" "));
    });
    result.push({ id: "", calls: group.map((example) => example.callId), answerOnly: shape === "", template, holes });
  }
  result.sort((a, b) => b.calls.length - a.calls.length);
  result.forEach((approach, index) => {
    approach.id = approach.answerOnly ? `answer-only` : `a${index + 1}`;
  });
  return result;
}
function accessor(path) {
  const match = /^([A-Za-z_$][\w$]*)(.*)$/s.exec(path);
  if (!match) return `args[${JSON.stringify(path)}]`;
  return `args.${match[1]}${match[2].replace(/\.(?=[A-Za-z_$])/g, "?.").replace(/\[/g, "?.[")}`;
}
var regexText = (pattern) => `/${pattern.source}/${pattern.flags}`;
var escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
function compileGuard(text) {
  return predicate(text);
}
function predicate(text) {
  try {
    const fn = new Function("args", `"use strict"; return (${text});`);
    return { text, test: (args) => {
      try {
        return fn(args) === true;
      } catch {
        return false;
      }
    } };
  } catch {
    return void 0;
  }
}
function candidatePredicates(examples) {
  const texts = /* @__PURE__ */ new Set();
  const numbers = /* @__PURE__ */ new Map();
  for (const example of examples) for (const [key, value] of Object.entries(example.features)) {
    const [family, ...rest] = key.split(":");
    const path = family === "tok" || family === "cls" ? rest.slice(0, -1).join(":") : rest.join(":");
    const at = accessor(path);
    if (family === "str") texts.add(`${at} === ${JSON.stringify(value)}`);
    else if (family === "tok") {
      const word = rest.at(-1);
      texts.add(/^[\w]+$/.test(word) ? `typeof ${at} === 'string' && /\\b${escapeRegex(word)}\\b/i.test(${at})` : `typeof ${at} === 'string' && /(^|[^\\p{L}\\p{N}_])${escapeRegex(word)}($|[^\\p{L}\\p{N}_])/iu.test(${at})`);
    } else if (family === "cls") {
      const pattern = VALUE_CLASSES[rest.at(-1)];
      if (pattern) texts.add(`typeof ${at} === 'string' && ${regexText(pattern)}.test(${at})`);
    } else if (family === "bool") texts.add(`${at} === ${value}`);
    else if (family === "null") texts.add(`${at} == null`);
    else if (family === "num" || family === "len" || family === "arr") {
      const target = family === "num" ? at : `${at}?.length`;
      const set = numbers.get(target) ?? /* @__PURE__ */ new Set();
      set.add(Number(value));
      numbers.set(target, set);
      if (family === "arr") {
        texts.add(`${at}?.length === 0`);
        texts.add(`(${at}?.length ?? 0) > 0`);
      }
    }
  }
  for (const [target, values] of numbers) {
    const sorted = [...values].sort((a, b) => a - b);
    const step = Math.max(1, Math.floor(sorted.length / 12));
    for (let index = 0; index < sorted.length; index += step) {
      const value = sorted[index];
      texts.add(`typeof ${target} === 'number' && ${target} <= ${value}`);
      texts.add(`typeof ${target} === 'number' && ${target} >= ${value}`);
    }
  }
  return [...texts].map(predicate).filter((item) => !!item);
}
var labelOf = (example) => example.behavior ?? example.approach;
function induceRules(examples, options = {}) {
  const minSupport = options.minSupport ?? 3;
  if (new Set(examples.map((example) => example.behavior)).size < 2) examples = examples.map(({ behavior: _behavior, ...example }) => example);
  const training = examples.filter((example) => example.split === "training");
  const heldOut = examples.filter((example) => example.split === "held-out");
  const predicates = candidatePredicates(training);
  const truth = new Map(predicates.map((item) => [item.text, new Set(training.filter((example) => item.test(example.args)).map((example) => example.callId))]));
  const label = new Map(training.map((example) => [example.callId, labelOf(example)]));
  let remaining = new Set(training.map((example) => example.callId));
  const rules = [];
  const pure2 = (covered) => {
    const labels = new Set(covered.map((id) => label.get(id)));
    return labels.size === 1 ? [...labels][0] : void 0;
  };
  while (rules.length < (options.maxRules ?? 12)) {
    let best;
    const singles = predicates.map((item) => ({ item, covered: [...truth.get(item.text)].filter((id) => remaining.has(id)) })).filter((entry) => entry.covered.length >= minSupport);
    for (const { item, covered } of singles) {
      const approach = pure2(covered);
      if (approach && (!best || covered.length > best.covered.length || covered.length === best.covered.length && item.text.length < best.guard.length))
        best = { guard: item.text, covered, approach };
    }
    const wide = singles.filter((entry) => !pure2(entry.covered)).sort((a, b) => b.covered.length - a.covered.length).slice(0, options.maxPairs ?? 40);
    for (let i = 0; i < wide.length; i++) for (let j = i + 1; j < wide.length; j++) {
      const second = new Set(wide[j].covered);
      const covered = wide[i].covered.filter((id) => second.has(id));
      if (covered.length < minSupport || best && covered.length <= best.covered.length) continue;
      const approach = pure2(covered);
      if (approach) best = { guard: `(${wide[i].item.text}) && (${wide[j].item.text})`, covered, approach };
    }
    if (!best) break;
    const chosen = predicate(best.guard);
    const earlier = rules.map((rule) => predicate(rule.guard));
    const heldCovered = heldOut.filter((example) => chosen.test(example.args) && !earlier.some((rule) => rule.test(example.args)));
    rules.push({
      label: best.approach,
      guard: best.guard,
      covers: best.covered,
      heldOut: { covered: heldCovered.length, correct: heldCovered.filter((example) => labelOf(example) === best.approach).length }
    });
    remaining = new Set([...remaining].filter((id) => !best.covered.includes(id)));
  }
  return { rules, unclassified: [...remaining] };
}
function measureGuard(guard, label, examples) {
  const item = predicate(guard);
  if (!item) return { valid: false, error: "the guard is not a JavaScript expression over args", covered: 0, correct: 0, counterexamples: [] };
  const covered = examples.filter((example) => item.test(example.args));
  return {
    valid: true,
    covered: covered.length,
    correct: covered.filter((example) => labelOf(example) === label).length,
    counterexamples: covered.filter((example) => labelOf(example) !== label).map((example) => example.callId)
  };
}

// src/runtime/node-files.ts
import { appendFileSync, existsSync as existsSync4, mkdirSync as mkdirSync3, readdirSync, readFileSync as readFileSync3, statSync as statSync2, writeFileSync as writeFileSync4 } from "node:fs";
import { basename as basename2, dirname as dirname4, extname as extname2, join as join5, relative as relative2, resolve as resolve6 } from "node:path";

// src/runtime/node.ts
var node_exports = {};
__export(node_exports, {
  AUDIT_MINIMUM: () => AUDIT_MINIMUM,
  CALLS_VERSION: () => CALLS_VERSION,
  CALL_MINIMUM: () => CALL_MINIMUM,
  CallCapture: () => CallCapture,
  CallStore: () => CallStore,
  CompilationCache: () => CompilationCache,
  Context: () => Context,
  ContextError: () => ContextError,
  CrispTier: () => CrispTier,
  DEFAULT_SETTINGS: () => DEFAULT_SETTINGS,
  Deopt: () => Deopt,
  FileHandle: () => FileHandle,
  Folder: () => Folder,
  FolderHandle: () => FolderHandle,
  FolderIteration: () => FolderIteration,
  FolderSnapshot: () => FolderSnapshot,
  ImplementationTier: () => ImplementationTier,
  Iteration: () => Iteration,
  IterationDivergedError: () => IterationDivergedError,
  IterationLimitError: () => IterationLimitError,
  IterationStepError: () => IterationStepError,
  MemoryIterationStatistics: () => MemoryIterationStatistics,
  MemoryVerdictCache: () => MemoryVerdictCache,
  ModelTier: () => ModelTier,
  ModuleUnavailableError: () => ModuleUnavailableError,
  NatlangCallError: () => NatlangCallError,
  NatlangContextError: () => NatlangContextError,
  NatlangPlatformUnavailableError: () => NatlangPlatformUnavailableError,
  NatlangRecursionError: () => NatlangRecursionError,
  NatlangRuntime: () => NatlangRuntime,
  NatlangTask: () => NatlangTask,
  NeuraleseTier: () => NeuraleseTier,
  NzFileError: () => NzFileError,
  RECENT: () => RECENT,
  RealmEnvironment: () => RealmEnvironment,
  RefinementCallError: () => RefinementCallError,
  RefinementChecker: () => RefinementChecker,
  RefinementError: () => RefinementError,
  ReplayDivergence: () => ReplayDivergence,
  ReplayServices: () => ReplayServices,
  SelectedEventQueue: () => SelectedEventQueue,
  SlotContextStore: () => SlotContextStore,
  SpecializedTier: () => SpecializedTier,
  TRACES_DECLARATIONS: () => TRACES_DECLARATIONS,
  TierEngine: () => TierEngine,
  TierLedger: () => TierLedger,
  VALUE_CLASSES: () => VALUE_CLASSES,
  __natlang: () => __natlang,
  accessor: () => accessor,
  admit: () => admit,
  applicationContextRecords: () => applicationContextRecords,
  applyDecision: () => applyDecision,
  approachHash: () => approachHash,
  approaches: () => approaches,
  assembleCases: () => assembleCases,
  assume: () => assume,
  behaviorLabel: () => behaviorLabel,
  betterFinding: () => betterFinding,
  builtin: () => builtin,
  builtinDefinition: () => builtinDefinition,
  builtinNames: () => builtinNames,
  builtinRecords: () => builtinRecords,
  callFailureReason: () => callFailureReason,
  callableTree: () => callableTree,
  candidateConditions: () => candidateConditions,
  candidatePredicates: () => candidatePredicates,
  canonicalValue: () => canonicalValue,
  caseFor: () => caseFor,
  caseHashes: () => caseHashes,
  caseServices: () => caseServices,
  caseSources: () => caseSources,
  compareBehaviors: () => compareBehaviors,
  compileGuard: () => compileGuard,
  compileVirtualProject: () => compileVirtualProject2,
  constructorRealm: () => constructorRealm,
  contextInterface: () => contextInterface,
  createNatlangRuntime: () => createNatlangRuntime2,
  crispDecline: () => crispDecline,
  crispPolicy: () => crispPolicy,
  currentFrame: () => currentFrame,
  decide: () => decide,
  decisionJudge: () => decisionJudge,
  decodeNz: () => decodeNz,
  defaultProgressJudge: () => defaultProgressJudge,
  defineNatlang: () => defineNatlang,
  definitionFor: () => definitionFor,
  definitionKey: () => definitionKey,
  detectFindings: () => detectFindings,
  emptyEvidence: () => emptyEvidence,
  encodeNz: () => encodeNz,
  exampleOf: () => exampleOf,
  excluded: () => excluded,
  exportSpecializationCorpus: () => exportSpecializationCorpus,
  failureKind: () => failureKind,
  fileTraceSink: () => fileTraceSink,
  foldEvent: () => foldEvent,
  foldSelectedEvents: () => foldSelectedEvents,
  groupsOf: () => groupsOf,
  handoffNote: () => handoffNote,
  hostCaptures: () => hostCaptures,
  hybridTracingPlatform: () => hybridTracingPlatform,
  importedNativeArtifacts: () => importedNativeArtifacts,
  induceRules: () => induceRules,
  inputFeatures: () => inputFeatures,
  inputLeaves: () => inputLeaves,
  interfaceHash: () => interfaceHash,
  invokeAt: () => invokeAt,
  invokeDefinition: () => invokeDefinition,
  isDeopt: () => isDeopt,
  isModelEvidence: () => isModelEvidence,
  isModelOutcomeFailure: () => isModelOutcomeFailure,
  isNatlangCallable: () => isNatlangCallable,
  iterateOn: () => iterateOn,
  judge: () => judge,
  keepCases: () => keepCases,
  labeler: () => labeler,
  ladderOf: () => ladderOf,
  live: () => live,
  loadCallables: () => loadCallables,
  loadCases: () => loadCases,
  loadNatlang: () => loadNatlang,
  loadNz: () => loadNz,
  loadNzSync: () => loadNzSync,
  loadVirtualCallables: () => loadVirtualCallables2,
  loadVirtualNatlang: () => loadVirtualNatlang2,
  machineStoreRoot: () => machineStoreRoot,
  mapSelectedEvents: () => mapSelectedEvents,
  measure: () => measure,
  measureGuard: () => measureGuard,
  modelTurnsSoFar: () => modelTurnsSoFar,
  moveTier: () => moveTier,
  namedCallable: () => namedCallable,
  newTierEvidence: () => newTierEvidence,
  nl: () => nl,
  nodePlatform: () => nodePlatform,
  nodeSourceFiles: () => nodeSourceFiles,
  normalizeProgram: () => normalizeProgram,
  nzExports: () => nzExports,
  observedNativeTracingPlatform: () => observedNativeTracingPlatform,
  openMachineStore: () => openMachineStore,
  ownedTracingPlatform: () => ownedTracingPlatform,
  parseRefinementSettings: () => parseRefinementSettings,
  pluggable: () => pluggable,
  pluggableMode: () => pluggableMode,
  projectEntry: () => projectEntry2,
  promotionPolicy: () => promotionPolicy,
  realmPlatform: () => realmPlatform,
  rebind: () => rebind,
  recordedArguments: () => recordedArguments,
  recordedBehavior: () => recordedBehavior,
  recordingServices: () => recordingServices,
  refine: () => refine,
  refinements: () => refinements,
  renderEvidence: () => renderEvidence,
  renderFunction: () => renderFunction,
  renderGroup: () => renderGroup,
  renderHistory: () => renderHistory,
  renderReport: () => renderReport,
  replay: () => replay,
  replayCaseOn: () => replayCaseOn,
  rerunAgent: () => rerunAgent,
  resolveFrame: () => resolveFrame,
  reviewPromotions: () => reviewPromotions,
  ruleOf: () => ruleOf,
  runFolderBash: () => runFolderBash2,
  runFolderPython: () => runFolderPython2,
  runJob: () => runJob,
  runJobs: () => runJobs,
  runTiered: () => runTiered,
  sameData: () => sameData,
  sanitizeDecision: () => sanitizeDecision,
  save: () => save,
  saveAccepted: () => saveAccepted,
  saveNz: () => saveNz,
  selectedSemanticPlatform: () => selectedSemanticPlatform,
  setTierState: () => setTierState,
  signatureOf: () => signatureOf,
  snapshot: () => snapshot,
  softFunction: () => softFunction,
  softFunctionOf: () => softFunctionOf,
  specializerOutput: () => specializerOutput,
  splitOf: () => splitOf,
  study: () => study,
  subtreeEffects: () => subtreeEffects,
  summaryOfTier: () => summaryOfTier,
  tokens: () => tokens,
  tracesService: () => tracesService,
  untrusted: () => untrusted,
  verdictFor: () => verdictFor,
  verifyCases: () => verifyCases
});
import { AsyncLocalStorage as AsyncLocalStorage3 } from "node:async_hooks";
import { Worker as Worker2 } from "node:worker_threads";

// src/environment.ts
import { getHeapStatistics, setFlagsFromString } from "node:v8";
import { createContext, runInContext, runInNewContext, runInThisContext } from "node:vm";

// src/workspace-modules.ts
import { createRequire as createRequire2, isBuiltin } from "node:module";
import ts9 from "typescript";
import { existsSync as existsSync2 } from "node:fs";
import { dirname as dirname3, join as join3, resolve as resolve4 } from "node:path";

// src/package-specifier.ts
function packageNameFromSpecifier(specifier) {
  if (typeof specifier !== "string" || !specifier || specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("#") || specifier.includes("\\") || specifier.includes(":") || specifier.includes("?"))
    throw new Error(`Only package imports are supported: ${JSON.stringify(specifier)}`);
  const parts = specifier.split("/");
  const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  if (!/^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || parts.some((part) => part === "" || part === "." || part === ".."))
    throw new Error(`Invalid package import: ${JSON.stringify(specifier)}`);
  return name;
}

// src/workspace-modules.ts
function findPackageWorkspace(start) {
  let directory = resolve4(start);
  for (; ; ) {
    if (existsSync2(join3(directory, "package.json"))) return directory;
    const parent = dirname3(directory);
    if (parent === directory) return void 0;
    directory = parent;
  }
}
var WorkspaceModules = class {
  constructor(workspace, observe = () => {
  }) {
    this.observe = observe;
    this.workspace = resolve4(workspace);
    this.requirer = createRequire2(join3(this.workspace, "package.json"));
  }
  observe;
  workspace;
  requirer;
  load(specifier) {
    packageNameFromSpecifier(specifier);
    if (isBuiltin(specifier)) throw new Error(`${specifier} is part of Node, not a package: eval code works with this call's scope and cannot reach the host's files, processes or system`);
    const loaded = this.requirer(specifier);
    this.observe({ operation: "packages.import", specifier, workspace: this.workspace });
    return loaded;
  }
};
function packageDeclaration(workspace, name) {
  const dot = name.lastIndexOf(".");
  const tries = [[name, void 0], ...dot > 0 ? [[name.slice(0, dot), name.slice(dot + 1)]] : []];
  const options = {
    module: ts9.ModuleKind.NodeNext,
    moduleResolution: ts9.ModuleResolutionKind.NodeNext,
    target: ts9.ScriptTarget.ES2022,
    noEmit: true,
    skipLibCheck: true,
    types: []
  };
  for (const [specifier, member] of tries) {
    try {
      packageNameFromSpecifier(specifier);
    } catch {
      continue;
    }
    if (isBuiltin(specifier)) continue;
    const resolved = ts9.resolveModuleName(specifier, join3(workspace, "index.ts"), options, ts9.sys).resolvedModule;
    if (!resolved?.resolvedFileName.endsWith(".d.ts") && !resolved?.resolvedFileName.endsWith(".d.mts") && !resolved?.resolvedFileName.endsWith(".d.cts")) continue;
    const program = ts9.createProgram([resolved.resolvedFileName], options), checker = program.getTypeChecker();
    const file = program.getSourceFile(resolved.resolvedFileName), symbol = file && checker.getSymbolAtLocation(file);
    if (!symbol) continue;
    const exports = checker.getExportsOfModule(symbol);
    const target = (item) => item.flags & ts9.SymbolFlags.Alias ? checker.getAliasedSymbol(item) : item;
    if (member === void 0) {
      const lines = exports.map((item) => {
        const type = checker.typeToString(checker.getTypeOfSymbolAtLocation(target(item), file), void 0, ts9.TypeFormatFlags.NoTruncation);
        return `  ${item.name}: ${type.length > 160 ? `${type.slice(0, 157)}...` : type};`;
      });
      return `declare module "${specifier}" {  // ${exports.length} exports; read_code("${specifier}.<name>") shows one with its docs
${lines.join("\n")}
}`;
    }
    const found = exports.find((item) => item.name === member);
    if (!found) continue;
    const texts = (target(found).declarations ?? []).map((declaration) => declaration.getFullText().replace(/^\s*\n/, "").trimEnd());
    return `// ${member}, from "${specifier}" (${resolved.resolvedFileName.split("/node_modules/").pop()})
${texts.join("\n")}`;
  }
  return void 0;
}

// src/environment.ts
var ARGUMENTS_KEY = "__natlang_arguments";
var HIDDEN_PROCESS_MEMBERS = /* @__PURE__ */ new Set([
  "binding",
  "_linkedBinding",
  "dlopen",
  "abort",
  "reallyExit",
  "_kill",
  "kill",
  "exit",
  "chdir",
  "setuid",
  "setgid",
  "seteuid",
  "setegid",
  "setgroups",
  "initgroups"
]);
var evalProcess = new Proxy(process, {
  get(target, key, receiver) {
    if (typeof key === "string" && HIDDEN_PROCESS_MEMBERS.has(key))
      return () => {
        throw new Error(`process.${key} is not available to evaluated code`);
      };
    return Reflect.get(target, key, receiver);
  }
});
var RejectionRouter = class {
  owners = /* @__PURE__ */ new WeakMap();
  open = 0;
  listener = (reason, promise) => {
    const constructor = promise.constructor ?? {};
    const owner = this.owners.get(constructor);
    if (owner) return owner(reason);
    if (constructor[/* @__PURE__ */ Symbol.for("natlang.call-promise")]) return;
    if (process.listenerCount("unhandledRejection") === 1) throw reason;
  };
  /** Take a share of the routing until the returned release is called. */
  acquire() {
    if (this.open++ === 0) process.on("unhandledRejection", this.listener);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--this.open === 0) process.off("unhandledRejection", this.listener);
    };
  }
  route(realmPromise, report) {
    this.owners.set(realmPromise, report);
  }
};
var rejections = new RejectionRouter();
var VmRealm = class {
  constructor(context) {
    this.context = context;
  }
  context;
  call(body, parameters, args, options = {}) {
    Object.defineProperty(this.context, ARGUMENTS_KEY, { value: args, enumerable: false, configurable: true });
    try {
      return runInContext(
        `(function (${parameters.join(", ")}) {
"use strict";
${body}
})(...globalThis[${JSON.stringify(ARGUMENTS_KEY)}])`,
        this.context,
        { ...options.timeoutMs === void 0 ? {} : { timeout: options.timeoutMs }, displayErrors: true }
      );
    } finally {
      delete this.context[ARGUMENTS_KEY];
    }
  }
};
var hostRealm = {
  call: (body, parameters, args) => runInThisContext(
    `(function (${parameters.join(", ")}) {
"use strict";
${body}
})`,
    { displayErrors: true }
  )(...args)
};
var collect;
var nodeHeap = {
  used: () => getHeapStatistics().used_heap_size,
  collect: () => {
    if (!collect) {
      if (typeof globalThis.gc !== "function") setFlagsFromString("--expose-gc");
      collect = typeof globalThis.gc === "function" ? globalThis.gc : runInNewContext("gc");
    }
    collect();
  }
};
var TypeScriptEnvironment = class _TypeScriptEnvironment extends RealmEnvironment {
  modules;
  workspace;
  packageEvents = [];
  /** Cancellers of timers that eval code scheduled and that have not run yet. */
  timers = /* @__PURE__ */ new Set();
  releaseRejections;
  constructor(options = {}) {
    const workspace = options.workspace ?? findPackageWorkspace(process.cwd());
    const memoryLimitMb = options.memoryLimitMb ?? evalMemoryLimitMb();
    const syncLimitSeconds = options.syncLimitSeconds ?? evalSyncLimitSeconds();
    super({
      authority: "shared-node-host",
      mode: options.mode,
      timeoutMs: options.timeoutMs,
      observe: options.observe,
      scopeCapabilities: { allowModules: true, allowNetwork: options.network ?? true },
      memory: { limitMb: memoryLimitMb, probe: nodeHeap },
      syncLimitSeconds,
      fork: () => new _TypeScriptEnvironment({
        mode: "fresh",
        timeoutMs: options.timeoutMs,
        observe: options.observe,
        workspace,
        network: options.network,
        memoryLimitMb,
        syncLimitSeconds
      })
    });
    this.workspace = workspace;
    if (workspace) this.modules = new WorkspaceModules(workspace, (event) => this.packageEvents.push(event));
  }
  makeRealm() {
    return new VmRealm(this.makeContext());
  }
  moduleRealm() {
    return hostRealm;
  }
  hostEvents() {
    return this.packageEvents.splice(0);
  }
  abandon() {
    this.clearTimers();
  }
  release() {
    this.clearTimers();
    this.releaseRejections?.();
    this.releaseRejections = void 0;
  }
  importer() {
    return {
      validate: (specifier) => {
        packageNameFromSpecifier(specifier);
        if (!this.modules) throw new Error(`cannot import ${specifier}: no package.json above ${process.cwd()}`);
      },
      load: async (specifier) => {
        if (!this.modules) throw new Error(`cannot import ${specifier}: no package.json above ${process.cwd()}`);
        return this.modules.load(specifier);
      }
    };
  }
  makeContext() {
    const guarded = (callback) => typeof callback !== "function" ? callback : (...args) => {
      const report = (error) => this.packageEvents.push({
        operation: "eval.callback-error",
        message: error instanceof Error ? error.message : String(error)
      });
      try {
        const value = callback(...args);
        if (value && typeof value.catch === "function") value.catch(report);
      } catch (error) {
        report(error);
      }
    };
    const timers = this.timers, cancellers = /* @__PURE__ */ new WeakMap();
    const scheduled = (start, stop, callback) => {
      const run = guarded(callback);
      const handle = start(() => {
        timers.delete(cancel);
        run();
      });
      const cancel = () => stop(handle);
      timers.add(cancel);
      cancellers.set(handle, cancel);
      return handle;
    };
    const cancelling = (stop) => (handle) => {
      const cancel = handle && typeof handle === "object" ? cancellers.get(handle) : void 0;
      if (cancel) {
        timers.delete(cancel);
        cancel();
      } else stop(handle);
    };
    const context = createContext({
      console: void 0,
      process: evalProcess,
      Buffer,
      clearTimeout: cancelling(clearTimeout),
      clearImmediate: cancelling(clearImmediate),
      setTimeout: (callback, ...rest) => scheduled((run) => setTimeout(run, ...rest), clearTimeout, callback),
      setImmediate: (callback) => scheduled((run) => setImmediate(run), clearImmediate, callback),
      queueMicrotask: (callback) => queueMicrotask(guarded(callback)),
      structuredClone,
      performance,
      crypto: globalThis.crypto,
      TextEncoder,
      TextDecoder,
      URL,
      URLSearchParams,
      AbortController,
      AbortSignal,
      Blob
    });
    const realmPromise = runInContext("Promise", context);
    markRaces(realmPromise);
    this.releaseRejections ??= rejections.acquire();
    rejections.route(realmPromise, (reason) => this.packageEvents.push({
      operation: "eval.unhandled-rejection",
      message: reason instanceof Error ? reason.message : String(reason)
    }));
    if (this.scopeCapabilities.allowNetwork) Object.assign(context, {
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const event = {
          operation: "network.fetch",
          url: url.origin + url.pathname,
          method: init?.method ?? (input instanceof Request ? input.method : "GET"),
          replayable: false
        };
        try {
          const response = await globalThis.fetch(input, init);
          this.packageEvents.push({ ...event, status: response.status });
          return response;
        } catch (error) {
          this.packageEvents.push({ ...event, status: "failed" });
          throw error;
        }
      },
      URL,
      URLSearchParams,
      Headers,
      Request,
      Response,
      AbortController,
      AbortSignal
    });
    return context;
  }
  declarationOf(name) {
    return this.modules && this.scopeCapabilities.allowModules ? packageDeclaration(this.modules.workspace, name) : void 0;
  }
  /** Cancel the timers eval code scheduled that have not run: when the call ends, or when an eval fails. */
  clearTimers() {
    if (!this.timers.size) return;
    this.options.observe?.({ operation: "eval.timers-cleared", count: this.timers.size });
    for (const cancel of this.timers) cancel();
    this.timers.clear();
  }
};

// src/app/playground.ts
import ts10 from "typescript";
var ROOT = "/project";
var sourceFiles2 = (files) => virtualSourceFiles(files, ROOT);
function projectEntry(files, path, runtimeNamespace, platform) {
  if (path.endsWith(".nl")) {
    const record = loadNamedFunction(`${ROOT}/${path}`, sourceFiles2(files));
    const fn = namedCallable(record.name, record);
    return async (inputs) => fn(...Object.keys(record.args).map((name) => inputs[name.replace(/\?$/, "")]));
  }
  if (!runtimeNamespace || !platform) throw new Error("running a TypeScript entry needs the runtime namespace and platform");
  const compiled = compileVirtualProject({ files, root: ROOT }, runtimeNamespace, { platform });
  if (!compiled.ok) throw new Error(formatDiagnostics(compiled.diagnostics));
  const main = compiled.require(path).main;
  if (typeof main !== "function") throw new Error(`${path} does not export main()`);
  return async (inputs) => main(inputs);
}

// src/std/library.ts
var library_exports = {};
__export(library_exports, {
  beats: () => beats,
  branchAndSelect: () => branchAndSelect,
  combine: () => combine,
  compatible: () => compatible,
  compileRule: () => compileRule,
  compileRuleFn: () => compileRuleFn,
  escalate: () => escalate,
  fixedPoint: () => fixedPoint,
  instructionsOf: () => instructionsOf,
  intentOf: () => intentOf,
  meets: () => meets,
  proposeAndVerify: () => proposeAndVerify,
  relates: () => relates,
  semanticFilter: () => semanticFilter,
  semanticMap: () => semanticMap,
  semanticMatch: () => semanticMatch,
  semanticMerge: () => semanticMerge,
  semanticPartition: () => semanticPartition,
  semanticRank: () => semanticRank,
  semanticReduce: () => semanticReduce,
  semanticRepair: () => semanticRepair,
  settled: () => settled,
  shouldEscalate: () => shouldEscalate,
  stepKind: () => stepKind,
  stepsOf: () => stepsOf,
  withContext: () => withContext
});

// src/std/sources.generated.ts
var STD_SOURCES = {
  "beats.nl": "---\ndescription: Decide whether the first of two candidates serves a goal better than the second.\nargs:\n  goal: string\n  first: unknown\n  second: unknown\nreturns: boolean\nreadout: decision\n---\nfirst and second are two candidates for goal. Answer true when first serves goal better than second, false when\nsecond serves it at least as well. Judge what each candidate does for goal, not its length or wording.\n",
  "combine.nl": '---\ndescription: Write one value that keeps two compatible edits of the same base.\nargs:\n  base?: unknown\n  ours: Edit\n  theirs: Edit\nreturns: unknown\ntypes:\n  Edit: "{ after?: unknown, removed?: boolean, intent: string }"\n---\nours and theirs are two edits of base (an omitted base means both sides added the field; removed: true means that side\ndeleted it), each with the value it produced and what it is for. Write the value that makes both edits: start from base\nwhen present, carry out the purpose of ours and the purpose of theirs, and change nothing else. Keep the same kind of\nvalue and style as the edits.\n',
  "compatible.nl": '---\ndescription: Decide whether two edits of the same value can both be kept.\nargs:\n  base?: unknown\n  ours: Edit\n  theirs: Edit\nreturns: boolean\nreadout: decision\ntypes:\n  Edit: "{ after?: unknown, removed?: boolean, intent: string }"\n---\nours and theirs are two separate edits of base (an omitted base means both sides added the field; removed: true means\nthat side deleted it), each with the value it produced and what it is for. Answer true when\none value can carry out both purposes at once. Answer false when keeping one purpose undoes, contradicts or replaces\nthe other.\n',
  "compileRule.nl": `---
description: Turn a written rule into a reusable typed judgment function.
args:
  rule: string
  problems?: string[]
returns: "(item: unknown) => unknown"
---
Write a reusable natural-language function that applies rule to one input item and returns the answer rule specifies.
Keep the function's instructions self-contained, crisp, and faithful to rule. If problems is provided and non-empty,
they describe cases where an earlier version failed; adjust the instructions so those cases are judged accurately.
`,
  "intentOf.nl": "---\ndescription: Say what one edit of a value is for.\nargs:\n  before?: unknown\n  after?: unknown\nreturns: string\n---\nafter is before with one edit made to it (an omitted before means the field was added; an omitted after means it was\nremoved). Say what the edit is for in one concise sentence: what it changes in what the value means or does, and what\nit keeps. Name the purpose of the change rather than the characters that differ.\n",
  "meets.nl": "---\ndescription: Decide whether an item satisfies a stated criterion.\nargs:\n  criterion: string\n  item: unknown\nreturns: boolean\nreadout: decision\n---\nJudge whether item satisfies criterion. Answer true when item meets criterion based on its meaning and evidence, false\nwhen it does not.\n",
  "relates.nl": "---\ndescription: Decide whether two items match under a stated relation.\nargs:\n  relation: string\n  left: unknown\n  right: unknown\nreturns: boolean\nreadout: decision\n---\nJudge whether left and right correspond to each other under relation. Answer true when they match by meaning, false\nwhen they do not.\n",
  "settled.nl": "---\ndescription: Decide whether the latest revision of a value still changed what it says.\nargs:\n  revision: Revision\nreturns: boolean\nreadout: decision\ntypes:\n  Revision: { previous: unknown, current: unknown }\n---\nrevision.current is the next revision of revision.previous. Answer true when current says the same as previous, so\nthat revising again would only reword it. Answer false when current adds, removes or corrects something.\n",
  "shouldEscalate.nl": `---
description: Decide whether a local decision should escalate to a stronger fallback model.
args:
  decision: DecisionSummary
  floor?: number
  risk?: Record<string, number>
  history?: EscalationHistory
  cost?: TierCost
returns: boolean
readout: decision
types:
  DecisionSummary: "{ value: unknown, confidence: number, scored: boolean, probabilities: { value: unknown, probability: number }[], fields?: Record<string, { value: unknown, probability: number }[]> }"
  EscalationHistory: "{ totalCalls?: number, escalationRate?: number, disagreementRate?: number }"
  TierCost: "{ local?: number, fallback?: number, ratio?: number }"
---
decision is the local model's answer and probability distribution. floor is the minimum confidence expected for a local
answer; risk maps high-stakes labels to the probability above which escalation is warranted even when another label won
argmax. history (when present) summarizes prior escalations for this function and how often the fallback disagreed with
the local model; cost (when present) compares local and fallback tier costs.

Answer true when the decision should escalate to the fallback model: confidence is below floor, a high-risk label has
material probability relative to its risk threshold, the distribution is ambiguous on a high-stakes case, or prior
history shows frequent fallback disagreements under similar uncertainty. Answer false when the local decision is
well-supported and safe to serve locally.
`,
  "stepKind.nl": `---
description: What one step of a natural-language function's instructions asks the model to do.
args:
  step: string
  signature: string
  file: string
returns: "judgment" | "mechanism" | "guard-for-type" | "redundant"
readout: decision
---
step is one numbered step or paragraph of the instructions of file, a function with signature. Say what the step
asks the model to do:

- "judgment" when it weighs evidence, meaning, authority or intent and decides something a fixed rule cannot.
- "mechanism" when a program would do it the same way every time: picking or copying fields, set unions and
  membership by id, counting, sorting, arithmetic, assembling a record, or calling a fixed sequence of functions and
  binding their results.
- "guard-for-type" when it only restates what signature already guarantees, such as the allowed values of a result.
- "redundant" when it repeats another step or asks again for something already decided.
`
};

// src/std/judgments.ts
var FILES = Object.fromEntries(Object.entries(STD_SOURCES).map(([name, text]) => [`@natlang/std/${name}`, text]));
var load = (name) => loadVirtualNatlang(FILES, `/@natlang/std/${name}.nl`, "");
var intentOf = load("intentOf");
var compatible = load("compatible");
var combine = load("combine");
var settled = load("settled");
var beats = load("beats");
var meets = load("meets");
var relates = load("relates");
var compileRuleFn = load("compileRule");
var shouldEscalate = load("shouldEscalate");
var stepKind = load("stepKind");

// src/std/trace.ts
var sequence = 0;
var StdSpan = class {
  constructor(name) {
    this.name = name;
    this.parentFrame = currentFrame() ?? resolveFrame();
    this.callId = `${this.parentFrame.task.id}/std-${this.name}-${++sequence}`;
    this.frame = { ...this.parentFrame, parentCallId: this.callId };
    this.mark = this.parentFrame.task.traces.length;
  }
  name;
  parentFrame;
  callId;
  frame;
  events = [];
  mark;
  started = Date.now();
  /** Run a caller's or a shipped function inside this combinator's span frame. */
  run(fn) {
    return runInFrame(this.frame, fn);
  }
  /** Emit a custom event directly onto this span's trace (for example `decision_escalate`). */
  emit(kind2, data = {}) {
    this.events.push({ kind: kind2, call_id: this.callId, combinator: this.name, ...data });
  }
  /** Close a stage: the child calls recorded since the previous stage under this span, and the stage's facts. */
  stage(stage, data = {}) {
    const traces = this.parentFrame.task.traces;
    const calls = traces.slice(this.mark).filter((trace) => trace.parentCallId === this.callId).map((trace) => trace.callId);
    this.mark = traces.length;
    this.events.push({ kind: "std_stage", call_id: this.callId, combinator: this.name, stage, call_ids: calls, ...data });
  }
  end(outcome, detail) {
    const task = this.parentFrame.task;
    task.record({
      callId: this.callId,
      parentCallId: this.parentFrame.parentCallId ?? null,
      taskId: task.id,
      definitionId: `std:${this.name}`,
      name: `std ${this.name}`,
      outcome,
      detail,
      events: [{ kind: "std", call_id: this.callId, combinator: this.name, wall_ms: Date.now() - this.started }, ...this.events]
    });
  }
  /** Run `body` as the combinator, recording the trace whether it returns or throws. */
  async around(body, detail) {
    try {
      const value = await body();
      this.end("done", detail(value));
      return value;
    } catch (error) {
      this.end("error", error?.message ?? String(error));
      throw error;
    }
  }
};
function stdError(code, message) {
  return Object.assign(new TypeError(`${code}: ${message}`), { code });
}

// src/std/collections.ts
function carryOf(value, combinator) {
  if (value === void 0 || value === "text") return "text";
  if (value === "neuralese") return "neuralese";
  throw stdError("std-arguments", `${combinator} carry must be "text" or "neuralese".`);
}
var asViewText = (value) => typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
async function defaultSoftView(value, instructions) {
  if (isNeuraleseRef(value)) return value;
  const view = currentFrame()?.task.runtime.options.neuralese?.view;
  const viewed = view ? await view({ value: asViewText(value), ...instructions ? { instructions } : {} }) : void 0;
  if (viewed !== void 0) return viewed;
  throw new NeuraleseUnsupportedError('carry: "neuralese" needs a runtime with a Neuralese server that serves view; leave carry out to pass ordinary values, or pass your own view option.');
}
async function defaultSoftRead(value) {
  return isNeuraleseRef(value) ? readNeuraleseForCurrentTask(value) : value;
}
function concurrencyOf(value, combinator) {
  if (value === void 0) return void 0;
  if (!Number.isSafeInteger(value) || value < 1)
    throw stdError("std-arguments", `${combinator} concurrency must be a whole number of at least 1.`);
  return value;
}
function floorOf(value, fallback, combinator) {
  const resolved = value === void 0 ? fallback : value;
  if (typeof resolved !== "number" || !(resolved >= 0 && resolved <= 1))
    throw stdError("std-arguments", `${combinator} floor is a probability between 0 and 1.`);
  return resolved;
}
async function mapBounded(items, concurrency, fn) {
  if (!items.length) return [];
  if (concurrency === void 0 || concurrency >= items.length) return Promise.all(items.map((item, index) => fn(item, index)));
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}
async function semanticMap(items, fn, options = {}) {
  if (!Array.isArray(items)) throw stdError("std-arguments", "semanticMap(items, fn) needs an array of items.");
  if (typeof fn !== "function") throw stdError("std-arguments", "semanticMap(items, fn) needs a function.");
  const concurrency = concurrencyOf(options.concurrency, "semanticMap");
  const carry = carryOf(options.carry, "semanticMap");
  const view = options.view ?? defaultSoftView;
  const span = new StdSpan("semanticMap");
  return span.around(async () => {
    const results = await mapBounded(items, concurrency, async (item, index) => {
      const input = carry === "neuralese" ? await span.run(() => view(item, options.viewInstructions)) : item;
      return await span.run(() => fn(input, index));
    });
    span.stage("map", { items: items.length, ...carry === "neuralese" ? { carry } : {} });
    return results;
  }, (results) => `mapped ${results.length} items`);
}
async function semanticFilter(items, predicate2, options = {}) {
  if (!Array.isArray(items)) throw stdError("std-arguments", "semanticFilter(items, predicate) needs an array of items.");
  if (typeof predicate2 !== "string" && typeof predicate2 !== "function")
    throw stdError("std-arguments", "semanticFilter(items, predicate) needs a criterion string or predicate function.");
  const concurrency = concurrencyOf(options.concurrency, "semanticFilter");
  const floor = options.floor === void 0 ? void 0 : floorOf(options.floor, 0.5, "semanticFilter");
  const span = new StdSpan("semanticFilter");
  return span.around(async () => {
    const keptFlags = await mapBounded(items, concurrency, async (item, index) => {
      if (typeof predicate2 === "string") {
        const judge2 = options.meets ?? meets;
        const decision = await decideInFrame(span.frame, judge2, [predicate2, item]);
        const prob = decision.probabilities.find((entry) => entry.value === true)?.probability ?? (decision.value === true ? decision.confidence : 0);
        return prob >= (floor ?? 0.5);
      }
      if (floor !== void 0) {
        const decision = await decideInFrame(span.frame, async (x, i) => predicate2(x, i), [item, index]);
        const prob = decision.probabilities.find((entry) => entry.value === true)?.probability ?? (decision.value === true ? decision.confidence : 0);
        return prob >= floor;
      }
      return Boolean(await span.run(() => predicate2(item, index)));
    });
    const kept = items.filter((_, index) => keptFlags[index]);
    span.stage("filter", { items: items.length, kept: kept.length });
    return kept;
  }, (kept) => `kept ${kept.length} of ${items.length}`);
}
async function semanticPartition(items, classifier, options = {}) {
  if (!Array.isArray(items)) throw stdError("std-arguments", "semanticPartition(items, classifier) needs an array of items.");
  if (typeof classifier !== "function") throw stdError("std-arguments", "semanticPartition(items, classifier) needs a classifier function.");
  const concurrency = concurrencyOf(options.concurrency, "semanticPartition");
  const floor = options.floor === void 0 ? void 0 : floorOf(options.floor, 0, "semanticPartition");
  const span = new StdSpan("semanticPartition");
  return span.around(async () => {
    const decisions = await mapBounded(items, concurrency, async (item) => {
      if (floor !== void 0) {
        const decision = await decideInFrame(span.frame, async (x) => classifier(x), [item]);
        return { label: decision.value, confidence: decision.confidence };
      }
      const label = await span.run(() => classifier(item));
      return { label, confidence: 1 };
    });
    const groups = {};
    const uncertain = [];
    decisions.forEach(({ label, confidence }, index) => {
      const item = items[index];
      if (floor !== void 0 && confidence < floor) {
        uncertain.push({ item, label, confidence });
        return;
      }
      (groups[label] ??= []).push(item);
    });
    span.stage("partition", { items: items.length, groups: Object.keys(groups).length, uncertain: uncertain.length });
    return { groups, uncertain };
  }, (result) => `${Object.keys(result.groups).length} groups, ${result.uncertain.length} uncertain`);
}
async function semanticReduce(items, initial, step, options = {}) {
  if (!Array.isArray(items)) throw stdError("std-arguments", "semanticReduce(items, initial, step) needs an array of items.");
  if (typeof step !== "function") throw stdError("std-arguments", "semanticReduce(items, initial, step) needs a step function.");
  const mode = options.mode ?? "linear";
  if (mode !== "linear" && mode !== "tree") throw stdError("std-arguments", 'semanticReduce mode must be "linear" or "tree".');
  if (mode === "tree" && typeof options.combine !== "function")
    throw stdError("std-arguments", 'semanticReduce with mode "tree" needs a combine(left, right) function.');
  const concurrency = concurrencyOf(options.concurrency, "semanticReduce");
  const carry = carryOf(options.carry, "semanticReduce");
  const view = options.view ?? defaultSoftView;
  const read = options.read ?? defaultSoftRead;
  const span = new StdSpan("semanticReduce");
  return span.around(async () => {
    if (!items.length) return initial;
    if (mode === "linear") {
      let state = carry === "neuralese" ? await span.run(() => view(initial, options.viewInstructions)) : initial;
      for (let index = 0; index < items.length; index++) {
        state = await span.run(() => step(state, items[index], index));
        if (carry === "neuralese" && index + 1 < items.length)
          state = await span.run(() => view(state, options.viewInstructions));
        span.stage("step", { index, ...carry === "neuralese" ? { carry } : {} });
      }
      return carry === "neuralese" ? await span.run(() => read(state)) : state;
    }
    const initState = carry === "neuralese" ? await span.run(() => view(initial, options.viewInstructions)) : initial;
    let level = await mapBounded(items, concurrency, async (item, index) => {
      const out = await span.run(() => step(initState, item, index));
      return carry === "neuralese" && items.length > 1 ? await span.run(() => view(out, options.viewInstructions)) : out;
    });
    span.stage("leaves", { count: level.length, ...carry === "neuralese" ? { carry } : {} });
    let round = 0;
    while (level.length > 1) {
      const pairs = [];
      const odd = level.length % 2 === 1 ? level[level.length - 1] : void 0;
      for (let i = 0; i + 1 < level.length; i += 2) pairs.push([level[i], level[i + 1]]);
      const nextCount = pairs.length + (odd !== void 0 ? 1 : 0);
      const combined = await mapBounded(pairs, concurrency, async ([left, right]) => {
        const out = await span.run(() => options.combine(left, right));
        return carry === "neuralese" && nextCount > 1 ? await span.run(() => view(out, options.viewInstructions)) : out;
      });
      if (odd !== void 0) combined.push(odd);
      level = combined;
      span.stage("combine", { round: ++round, count: level.length, ...carry === "neuralese" ? { carry } : {} });
    }
    return carry === "neuralese" ? await span.run(() => read(level[0])) : level[0];
  }, () => `reduced ${items.length} items (${mode})`);
}
async function semanticMatch(left, right, options) {
  if (!Array.isArray(left) || !Array.isArray(right)) throw stdError("std-arguments", "semanticMatch(left, right, options) needs two arrays.");
  if (typeof options?.match !== "function" && (!options?.relation || typeof options.relation !== "string"))
    throw stdError("std-arguments", "semanticMatch needs either a relation string or a match(left, right) function.");
  const concurrency = concurrencyOf(options.concurrency, "semanticMatch");
  const floor = floorOf(options.floor, 0.5, "semanticMatch");
  const span = new StdSpan("semanticMatch");
  return span.around(async () => {
    const candidates = [];
    for (let li = 0; li < left.length; li++) {
      for (let ri = 0; ri < right.length; ri++) {
        if (options.block && !options.block(left[li], right[ri])) continue;
        candidates.push({ left: left[li], right: right[ri], leftIndex: li, rightIndex: ri });
      }
    }
    span.stage("block", { candidates: candidates.length, totalPairs: left.length * right.length });
    const judged = await mapBounded(candidates, concurrency, async (candidate) => {
      if (options.match) {
        const decision2 = await decideInFrame(span.frame, async (l, r) => options.match(l, r), [candidate.left, candidate.right]);
        const confidence2 = decision2.probabilities.find((entry) => entry.value === true)?.probability ?? (decision2.value === true ? decision2.confidence : 0);
        return { ...candidate, confidence: confidence2 };
      }
      const judge2 = options.relates ?? relates;
      const decision = await decideInFrame(span.frame, judge2, [options.relation, candidate.left, candidate.right]);
      const confidence = decision.probabilities.find((entry) => entry.value === true)?.probability ?? (decision.value === true ? decision.confidence : 0);
      return { ...candidate, confidence };
    });
    const pairs = judged.filter((item) => item.confidence >= floor);
    const matchedL = new Set(pairs.map((pair) => pair.leftIndex));
    const matchedR = new Set(pairs.map((pair) => pair.rightIndex));
    const unmatchedLeft = left.filter((_, index) => !matchedL.has(index));
    const unmatchedRight = right.filter((_, index) => !matchedR.has(index));
    span.stage("match", { matched: pairs.length });
    return { pairs, unmatchedLeft, unmatchedRight };
  }, (result) => `${result.pairs.length} matches`);
}
async function semanticRank(items, goal, options = {}) {
  if (!Array.isArray(items)) throw stdError("std-arguments", "semanticRank(items, goal) needs an array of items.");
  if (typeof goal !== "string" || !goal.trim()) throw stdError("std-arguments", "semanticRank(items, goal) needs a nonempty goal string.");
  const concurrency = concurrencyOf(options.concurrency, "semanticRank");
  const debiased = options.debiased ?? true;
  const beats2 = options.beats ?? beats;
  const span = new StdSpan("semanticRank");
  return span.around(async () => {
    if (items.length <= 1) {
      const scores2 = items.map((item, index) => ({ item, index, wins: 0, score: 0 }));
      return { ranked: [...items], scores: scores2 };
    }
    const comparisons = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        comparisons.push({ first: i, second: j });
        if (debiased) comparisons.push({ first: j, second: i });
      }
    }
    const probMap = /* @__PURE__ */ new Map();
    await mapBounded(comparisons, concurrency, async ({ first, second }) => {
      const decision = await decideInFrame(span.frame, beats2, [goal, items[first], items[second]]);
      const pFirst = decision.probabilities.find((entry) => entry.value === true)?.probability ?? (decision.value === true ? decision.confidence : 1 - decision.confidence);
      probMap.set(`${first}:${second}`, pFirst);
    });
    span.stage("compare", { items: items.length, comparisons: comparisons.length, debiased });
    const scores = items.map((item, index) => ({ item, index, wins: 0, score: 0 }));
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const pij = probMap.get(`${i}:${j}`) ?? 0.5;
        const p = debiased ? (pij + (1 - (probMap.get(`${j}:${i}`) ?? 0.5))) / 2 : pij;
        scores[i].score += p;
        scores[j].score += 1 - p;
        if (p > 0.5) scores[i].wins += 1;
        else if (p < 0.5) scores[j].wins += 1;
        else {
          scores[i].wins += 0.5;
          scores[j].wins += 0.5;
        }
      }
    }
    scores.sort((a, b) => b.score - a.score || b.wins - a.wins || a.index - b.index);
    span.stage("rank", { topIndex: scores[0].index });
    return { ranked: scores.map((entry) => entry.item), scores };
  }, (result) => `ranked ${result.ranked.length} items`);
}

// src/std/converge.ts
function problemsOf(found, who) {
  if (!Array.isArray(found) || found.some((item) => typeof item !== "string"))
    throw stdError("std-check-result", `${who} returns the list of problems it found, as strings, and an empty list when the value passes.`);
  return [...found];
}
function boundOf(value, name, combinator) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw stdError("iteration-unbounded", `${combinator} needs ${name}, a whole number of at least 0: the most steps it may take before it returns its closest value.`);
  return value;
}
async function semanticRepair(value, options) {
  if (typeof options?.check !== "function" || typeof options.fix !== "function")
    throw stdError("std-arguments", "semanticRepair(value, { check, fix, attempts }) needs an exact check and a fix function.");
  const attempts = boundOf(options.attempts, "attempts", "semanticRepair");
  const identity = options.identity ?? stableHash;
  const span = new StdSpan("semanticRepair");
  return span.around(async () => {
    const checked = async (candidate) => problemsOf(await span.run(() => options.check(candidate)), "check");
    const history = [{ value, problems: await checked(value) }];
    span.stage("check", { attempt: 0, problems: history[0].problems.length });
    const seen = /* @__PURE__ */ new Set([identity(value)]);
    const step = async (state) => {
      const next = await span.run(() => options.fix(state.value, state.problems));
      const problems = await checked(next);
      const key = identity(next), repeated = seen.has(key);
      seen.add(key);
      history.push({ value: next, problems });
      span.stage("fix", { attempt: history.length - 1, problems: problems.length, repeated });
      return { value: next, problems, repeated };
    };
    try {
      await span.run(() => iterateOn2(step, { ...history[0], repeated: false }).withLimit({ maxSteps: attempts }).until((state) => state.problems.length === 0 || state.repeated));
    } catch (error) {
      if (!(error instanceof IterationLimitError)) throw error;
    }
    const passing = history.find((attempt) => attempt.problems.length === 0);
    const best = passing ?? history.reduce((closest, attempt) => attempt.problems.length <= closest.problems.length ? attempt : closest);
    return { ok: !!passing, value: best.value, problems: best.problems, attempts: history.length - 1, history };
  }, (result) => `${result.ok ? "passed" : "failed"} after ${result.attempts} fixes`);
}
async function fixedPoint(step, initial, options = {}) {
  if (typeof step !== "function") throw stdError("std-arguments", "fixedPoint(step, initial, options) needs a step function.");
  if (options.settled && options.maxSteps === void 0)
    throw stdError("iteration-unbounded", "fixedPoint with an exact settled test needs maxSteps: the most steps before it returns the latest value; leave settled out to judge settledness in natural language.");
  const maxSteps = options.maxSteps === void 0 ? void 0 : boundOf(options.maxSteps, "maxSteps", "fixedPoint");
  const carry = carryOf(options.carry, "fixedPoint");
  const view = options.view ?? defaultSoftView;
  const read = options.read ?? defaultSoftRead;
  const span = new StdSpan("fixedPoint");
  return span.around(async () => {
    if (maxSteps === 0) return { value: initial, steps: 0, settled: false };
    const start = carry === "neuralese" ? await span.run(() => view(initial, options.viewInstructions)) : initial;
    let steps = 0;
    const finish = async (value, isSettled) => ({
      value: carry === "neuralese" ? await span.run(() => read(value)) : value,
      steps,
      settled: isSettled
    });
    const revise = async (revision) => {
      const raw = await span.run(() => step(revision.current));
      const current = carry === "neuralese" ? await span.run(() => view(raw, options.viewInstructions)) : raw;
      steps++;
      span.stage("step", { step: steps, ...carry === "neuralese" ? { carry } : {} });
      return { previous: revision.current, current };
    };
    const first = await revise({ previous: start, current: start });
    if (stableHash(first.current) === stableHash(start)) return finish(first.current, true);
    let iteration = iterateOn2(revise, first);
    if (maxSteps !== void 0) iteration = iteration.withLimit({ maxSteps: maxSteps - 1 });
    const settled2 = options.settled;
    try {
      const last = await span.run(() => iteration.until(settled2 ? (revision) => settled2(revision.previous, revision.current) : options.judge ?? settled));
      return finish(last.current, true);
    } catch (error) {
      if (error instanceof IterationLimitError) return finish(error.lastState.current, false);
      throw error;
    }
  }, (result) => `${result.settled ? "settled" : "unsettled"} after ${result.steps} steps`);
}
var isRecord = isPlainObject;
var kindOf = (value) => value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
async function semanticMerge(base, ours, theirs, options = {}) {
  const floor = options.floor ?? 0.5;
  if (!(floor >= 0 && floor <= 1)) throw stdError("std-arguments", "semanticMerge floor is a probability between 0 and 1.");
  const span = new StdSpan("semanticMerge");
  return span.around(async () => {
    const same = (a, b) => a === b || stableHash(a) === stableHash(b);
    const conflicts = [];
    const slots = /* @__PURE__ */ new Map(), built = /* @__PURE__ */ new WeakSet();
    const walk = (b, o, t, path) => {
      if (same(o, t) || same(t, b)) return o;
      if (same(o, b)) return t;
      if (isRecord(b) && isRecord(o) && isRecord(t)) {
        const result = {};
        built.add(result);
        for (const key of /* @__PURE__ */ new Set([...Object.keys(b), ...Object.keys(o), ...Object.keys(t)])) {
          const value = walk(b[key], o[key], t[key], [...path, key]);
          if (value !== void 0) result[key] = value;
        }
        return result;
      }
      const conflict = { path, base: b, ours: o, theirs: t }, slot = {};
      conflicts.push(conflict);
      slots.set(slot, conflict);
      return slot;
    };
    const draft = walk(base, ours, theirs, []);
    span.stage("walk", { conflicts: conflicts.map((conflict) => conflict.path) });
    const intentOf2 = options.intentOf ?? intentOf, compatible2 = options.compatible ?? compatible;
    const combine2 = options.combine ?? combine;
    const merged = [], unresolved = [];
    const resolution = /* @__PURE__ */ new Map();
    await Promise.all(conflicts.map(async (conflict) => {
      const [oursIntent, theirsIntent] = await Promise.all([
        span.run(() => intentOf2(conflict.base, conflict.ours)),
        span.run(() => intentOf2(conflict.base, conflict.theirs))
      ]);
      const intents = { ours: oursIntent, theirs: theirsIntent };
      const editOf = (value2, intent) => value2 === void 0 ? { removed: true, intent } : { after: value2, intent };
      const edits = [editOf(conflict.ours, oursIntent), editOf(conflict.theirs, theirsIntent)];
      const decision = await decideInFrame(span.frame, compatible2, [conflict.base, ...edits]);
      const compatibility = decision.probabilities.find((item) => item.value === true)?.probability ?? 0;
      const keep = () => resolution.set(conflict, conflict[options.keep ?? "base"]);
      if (compatibility < floor) {
        unresolved.push({ ...conflict, reason: decision.value === true ? "unsure" : "incompatible", intents, compatibility });
        return keep();
      }
      const value = await span.run(() => combine2(conflict.base, ...edits));
      const kinds = [conflict.ours, conflict.theirs].filter((item) => item !== void 0).map(kindOf);
      const kindOk = !kinds.length || kinds.includes(kindOf(value));
      const problems = kindOk ? options.check ? problemsOf(await span.run(() => options.check(value, conflict.path)), "check") : [] : [`The combined value is ${kindOf(value)}; the edits are ${[...new Set(kinds)].join(" and ")}.`];
      if (problems.length) {
        unresolved.push({ ...conflict, reason: "check", intents, compatibility, problems });
        return keep();
      }
      merged.push({ ...conflict, value, intents, compatibility });
      resolution.set(conflict, value);
    }));
    span.stage("resolve", { merged: merged.map((item) => item.path), unresolved: unresolved.map((item) => ({ path: item.path, reason: item.reason })) });
    const fill = (value) => {
      if (value !== null && typeof value === "object" && slots.has(value)) return resolution.get(slots.get(value));
      if (value !== null && typeof value === "object" && built.has(value))
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fill(item)]).filter(([, item]) => item !== void 0));
      return value;
    };
    const byPath = (a, b) => {
      const left = a.path.join("\0"), right = b.path.join("\0");
      return left < right ? -1 : left > right ? 1 : 0;
    };
    return { value: fill(draft), merged: merged.sort(byPath), unresolved: unresolved.sort(byPath) };
  }, (result) => `${result.merged.length} merged, ${result.unresolved.length} unresolved`);
}

// src/std/policy.ts
function escalate(fn, options) {
  if (typeof fn !== "function" || typeof fn.on !== "function")
    throw stdError("std-arguments", "escalate(fn, { to | fallback, floor?, risk?, policy? }) needs a natlang function with .on({ model }).");
  const rawTo = typeof options?.to === "string" ? options.to.trim() : "";
  const rawFallback = typeof options?.fallback === "string" ? options.fallback.trim() : "";
  if (rawTo && rawFallback && rawTo !== rawFallback)
    throw stdError("std-arguments", `escalate received conflicting to (${JSON.stringify(rawTo)}) and fallback (${JSON.stringify(rawFallback)}); pass one target model name.`);
  const to = rawTo || rawFallback;
  if (!to) throw stdError("std-arguments", "escalate(fn, { to | fallback }) needs a nonempty target model name.");
  const floor = options.floor ?? 0.8;
  if (!(floor >= 0 && floor <= 1)) throw stdError("std-arguments", "escalate floor is a probability between 0 and 1.");
  for (const [label, threshold] of Object.entries(options.risk ?? {}))
    if (!(threshold >= 0 && threshold <= 1))
      throw stdError("std-arguments", `escalate risk floor for ${JSON.stringify(label)} must be a probability between 0 and 1.`);
  const crispReason = (decision) => {
    if (options.risk) {
      for (const [label, threshold] of Object.entries(options.risk)) {
        const match = decision.probabilities.find((entry) => String(entry.value) === label || JSON.stringify(entry.value) === label);
        if (match && match.probability >= threshold) return `risk:${label}`;
      }
    }
    if (decision.confidence < floor) return "confidence";
    return void 0;
  };
  const nlJudge = options.nlPolicy ?? shouldEscalate;
  const decidePolicy = pluggable(
    {
      crisp: (decision) => crispReason(decision),
      nl: async (decision) => await nlJudge(decision, floor, options.risk, options.history, options.cost) ? "policy" : void 0
    },
    options.policy,
    { default: "crisp", serve: "crisp", name: "std.escalate", same: (a, b) => Boolean(a) === Boolean(b) }
  );
  const fallback = fn.on({ model: to });
  return async (...args) => {
    const span = new StdSpan("escalate");
    return span.around(async () => {
      const decision = await decideInFrame(span.frame, fn, args);
      span.stage("local", { confidence: decision.confidence, scored: decision.scored });
      const reason = options.shouldEscalate ? await span.run(() => options.shouldEscalate(decision)) ? "policy" : void 0 : await span.run(() => decidePolicy(decision));
      if (!reason) return { ...decision, escalated: false };
      if (!span.frame.task.runtime.options.models?.[to]) {
        span.emit("decision_escalate", { to, reason, unavailable: true, confidence: decision.confidence, initial_value: decision.value });
        return { ...decision, escalated: false, reason: `unavailable: this runtime has no model ${to} (${reason})` };
      }
      span.emit("decision_escalate", { to, reason, confidence: decision.confidence, initial_value: decision.value });
      const value = await span.run(() => fallback(...args));
      span.stage("escalate", { to, reason });
      return { ...decision, value, escalated: true, reason, initialValue: decision.value };
    }, (result) => result.escalated ? `escalated to ${to} (${result.reason})` : `local (p=${result.confidence.toFixed(2)})`);
  };
}
function withContext(fn, entries) {
  if (!isNatlangCallable(fn))
    throw stdError("std-arguments", "withContext(fn, entries) needs a natlang function.");
  if (!entries || typeof entries !== "object" || Array.isArray(entries))
    throw stdError("std-arguments", "withContext(fn, entries) needs a record of context entries to bind.");
  return fn.in(Context.ofCallable(fn).with(entries));
}
async function compileRule(rule, options = {}) {
  if (typeof rule !== "string" || !rule.trim())
    throw stdError("std-arguments", "compileRule(rule, options?) needs a nonempty rule string.");
  const compiler = options.compiler ?? compileRuleFn;
  const examples = options.examples ?? [];
  const same = options.same ?? ((a, b) => stableHash(a) === stableHash(b));
  const attempts = options.attempts ?? 2;
  const span = new StdSpan("compileRule");
  return span.around(async () => {
    const first = await span.run(() => compiler(rule));
    span.stage("compile", { attempt: 0 });
    if (!examples.length && !options.check) return first;
    let version = 0;
    const verify = async (candidate) => {
      const problems = [];
      if (examples.length) {
        const received = await Promise.all(examples.map((example) => span.run(() => candidate(example.input))));
        examples.forEach((example, index) => {
          if (!same(received[index], example.expected)) {
            const label = example.name ?? `example ${index + 1}`;
            problems.push(`${label}: expected ${JSON.stringify(example.expected)}, got ${JSON.stringify(received[index])}.`);
          }
        });
      }
      if (options.check) problems.push(...await span.run(() => options.check(candidate)));
      return problems;
    };
    const repaired = await semanticRepair(first, {
      check: verify,
      fix: (_candidate, problems) => compiler(rule, problems),
      attempts,
      identity: () => `rule-v${++version}`
    });
    span.stage("verify", { ok: repaired.ok, attempts: repaired.attempts, problems: repaired.problems.length });
    if (!repaired.ok)
      throw stdError("std-rule-unverified", `compileRule could not satisfy its checks after ${repaired.attempts} retries: ${repaired.problems.join(" ")}`);
    return repaired.value;
  }, () => "compiled rule");
}

// src/std/workspace.ts
function problemsOf2(found) {
  if (!Array.isArray(found) || found.some((item) => typeof item !== "string"))
    throw stdError("std-check-result", "verify returns the list of problems it found in the proposal, as strings, and an empty list when it passes.");
  return [...found];
}
function workspaceOf(folder, combinator) {
  const candidate = folder;
  if (typeof candidate?.propose !== "function" || typeof candidate.accept !== "function")
    throw stdError("std-arguments", `${combinator} works on a Folder or FolderHandle with write access, given as its first argument.`);
  return candidate;
}
async function proposeAndVerify(folder, reducer, options) {
  const workspace = workspaceOf(folder, "proposeAndVerify");
  if (typeof options?.verify !== "function")
    throw stdError("std-arguments", "proposeAndVerify(folder, reducer, { verify, attempts }) needs an exact verify function.");
  const args = options.args ?? [];
  const span = new StdSpan("proposeAndVerify");
  return span.around(async () => {
    const propose = (problems, previous) => span.run(() => workspace.propose({
      [APPLY_TO_FOLDER]: async (draft) => {
        if (previous) await draft.select(previous.folder);
        return draft.apply(reducer, ...args, problems);
      }
    }));
    const first = await propose([]);
    span.stage("propose", { attempt: 0 });
    const repair = await span.run(() => semanticRepair(first, {
      check: async (proposal) => problemsOf2(await span.run(() => options.verify(proposal))),
      fix: (proposal, problems) => propose(problems, proposal),
      attempts: options.attempts,
      identity: (proposal) => proposal.folder.digest
    }));
    span.stage("verify", { attempts: repair.attempts, ok: repair.ok });
    if (repair.ok) await span.run(() => workspace.accept(repair.value));
    span.stage("accept", { accepted: repair.ok });
    return {
      accepted: repair.ok,
      proposal: repair.value,
      value: repair.value.value,
      problems: repair.problems,
      attempts: repair.attempts,
      history: repair.history.map((attempt) => attempt.problems)
    };
  }, (result) => result.accepted ? `accepted after ${result.attempts} re-proposals` : `not accepted: ${result.problems.length} problems`);
}
var decoder = new TextDecoder("utf-8", { fatal: true });
function changesOf(candidate) {
  return { value: candidate.value, changes: candidate.proposal.diff.changes.map((change) => {
    let text;
    try {
      text = change.after === void 0 ? void 0 : decoder.decode(change.after);
    } catch {
      text = `(${change.after.length} bytes)`;
    }
    return { path: change.path, kind: change.kind, ...text === void 0 ? {} : { text } };
  }) };
}
async function branchAndSelect(folder, branches, options = {}) {
  const workspace = workspaceOf(folder, "branchAndSelect");
  if (!Array.isArray(branches) || !branches.length) throw stdError("std-arguments", "branchAndSelect(folder, branches) needs a list of at least one branch.");
  const span = new StdSpan("branchAndSelect");
  return span.around(async () => {
    const proposals = await Promise.all(branches.map((branch) => {
      const { reducer, args = [] } = typeof branch === "object" && branch !== null && "reducer" in branch ? branch : { reducer: branch };
      return span.run(() => workspace.propose(reducer, ...args));
    }));
    span.stage("propose", { branches: proposals.length });
    const candidates = await Promise.all(proposals.map(async (proposal, index) => ({
      index,
      proposal,
      value: proposal.value,
      problems: options.verify ? problemsOf2(await span.run(() => options.verify(proposal))) : []
    })));
    const passing = candidates.filter((candidate) => !candidate.problems.length);
    span.stage("verify", { passing: passing.map((candidate) => candidate.index) });
    if (!passing.length) return { chosen: null, candidates };
    let chosen = passing[0];
    if (options.select) {
      const index = await span.run(() => options.select(passing));
      const found = passing.find((candidate) => candidate.index === index);
      if (!found) throw stdError("std-select-result", `select returns the index of one of the passing candidates (${passing.map((candidate) => candidate.index).join(", ")}).`);
      chosen = found;
    } else if (options.goal && passing.length > 1) {
      const beats2 = options.beats ?? beats;
      const ranked = await span.run(() => semanticRank(passing, options.goal, {
        debiased: options.debiased ?? true,
        beats: (goal, first, second) => beats2(goal, changesOf(first), changesOf(second))
      }));
      chosen = ranked.ranked[0];
    }
    span.stage("select", { chosen: chosen.index });
    await span.run(() => workspace.accept(chosen.proposal));
    span.stage("accept", { chosen: chosen.index });
    return { chosen: chosen.index, proposal: chosen.proposal, value: chosen.value, candidates };
  }, (result) => result.chosen === null ? "no branch passed" : `accepted branch ${result.chosen}`);
}

// src/std/instructions.ts
function stepsOf(body) {
  const lines = body.replace(/\r\n/g, "\n").replace(/\s+$/, "").split("\n");
  const numbered = lines.some((line) => /^\d+\.\s/.test(line));
  const steps = [];
  let fenced = false;
  for (const line of lines) {
    const opens = !fenced && (numbered ? /^\d+\.\s/.test(line) : line.trim() !== "" && (steps.length === 0 || steps.at(-1).at(-1)?.trim() === ""));
    if (opens || steps.length === 0) steps.push([]);
    steps.at(-1).push(line);
    if (/^\s*```/.test(line)) fenced = !fenced;
  }
  return steps.map((step) => step.join("\n").trim()).filter(Boolean);
}
function instructionsOf(source) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source.replace(/\r\n/g, "\n"));
  if (!match) throw new Error("a .nl file starts with front matter between --- lines");
  const front = match[1], body = match[2];
  const declaration = front.split("\n").filter((line) => !/^readout:/.test(line)).join("\n").trim();
  return { front, body, declaration, steps: stepsOf(body) };
}

// src/std/index.ts
registerShippedModule(STD_SPECIFIERS, () => ({ __esModule: true, ...library_exports }));

// src/platform-defaults.ts
function platformDefaults(defaultPlatform) {
  return {
    // Compiled imports need the same module home as virtual/file loaders.
    // This supplies an evaluator for crisp helpers, never an implicit task.
    __natlang: Object.freeze({
      ...lowered_exports,
      named: (name, record) => named(name, record, defaultPlatform())
    }),
    /** A runtime on the entry's platform unless `platform` says otherwise. */
    createNatlangRuntime: (options = {}) => createNatlangRuntime({ platform: defaultPlatform(), ...options }),
    /** Compile an in-memory project whose modules run on the entry's platform unless `platform` says otherwise. */
    compileVirtualProject: (project, runtime, options = {}) => compileVirtualProject(project, runtime, { platform: defaultPlatform(), ...options }),
    /** The callable entry of a playground project file; TypeScript entries run on the entry's platform unless `platform` says otherwise. */
    projectEntry: (files, path, runtimeNamespace, platform = defaultPlatform()) => projectEntry(files, path, runtimeNamespace, platform),
    loadVirtualNatlang: (files, path, root = "/project", platform = defaultPlatform()) => loadVirtualNatlang(files, path, root, platform),
    loadVirtualCallables: (files, dir = "", root = "/project", platform = defaultPlatform()) => loadVirtualCallables(files, dir, root, platform)
  };
}

// src/neuralese/learning.ts
import { AsyncLocalStorage as AsyncLocalStorage2 } from "node:async_hooks";
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "node:fs";

// src/native/file-patches.ts
import { createHash } from "node:crypto";
var FILE_PATCH_SCHEMA = "natlang.file-patch/1";
var FilePatchError = class extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = "FilePatchError";
  }
  code;
};
var filesDigest = (files) => createHash("sha256").update(JSON.stringify(Object.keys(files).sort().map((path) => [path, files[path]]))).digest("hex");
function diffFiles(after, base) {
  const changes = {};
  for (const path of /* @__PURE__ */ new Set([...Object.keys(base), ...Object.keys(after)])) {
    if (!(path in after)) changes[path] = null;
    else if (base[path] !== after[path]) changes[path] = after[path];
  }
  return {
    schema: FILE_PATCH_SCHEMA,
    base: filesDigest(base),
    changes: Object.fromEntries(Object.entries(changes).sort(([a], [b]) => a < b ? -1 : 1))
  };
}
function applyPatch(files, patch, options = {}) {
  if (patch.schema !== FILE_PATCH_SCHEMA) throw new FilePatchError("patch-schema", "unsupported file patch schema");
  if (options.strict && filesDigest(files) !== patch.base) throw new FilePatchError("patch-base", "the files are not the patch's base");
  const out = { ...files };
  for (const [path, text] of Object.entries(patch.changes)) {
    if (text === null) delete out[path];
    else out[path] = text;
  }
  return out;
}
function composePatches(patches) {
  if (!patches.length) throw new FilePatchError("patch-arguments", "composePatches needs at least one patch");
  const changes = {};
  for (const patch of patches) {
    if (patch.schema !== FILE_PATCH_SCHEMA) throw new FilePatchError("patch-schema", "unsupported file patch schema");
    if (patch.base !== patches[0].base) throw new FilePatchError("patch-base", "patches to compose must share their base");
    for (const [path, text] of Object.entries(patch.changes)) {
      if (path in changes && changes[path] !== text) throw new FilePatchError("patch-conflict", `${path} is changed differently by two patches`);
      changes[path] = text;
    }
  }
  return { schema: FILE_PATCH_SCHEMA, base: patches[0].base, changes };
}

// src/neuralese/native-tensor-client.ts
function fail(code, message) {
  throw Object.assign(new Error(`${code}: ${message}`), { code });
}
async function archiveNativeTensorArtifact(endpoint, store, id, headers) {
  return archiveNativeTensorFrom(new HttpNeuraleseStore(endpoint, headers), store, id);
}
async function restoreNativeTensorArtifacts(endpoint, store, ids, headers) {
  if (!store.getNativeTensorArtifact) return fail("neuralese-native-archive-unavailable", "configure a named tensor archive");
  return restoreNativeArtifacts(new HttpNeuraleseStore(endpoint, headers), store, ids);
}

// src/neuralese/native-learning-client.ts
async function nativeRecordedGraphGradient(endpoint, store, request) {
  if (!request.turns.length || !request.events.length || !request.terms.length)
    throw new RangeError("native recorded learning needs actual turns, graph events and objective terms");
  if (!request.turns.some((turn) => turn.native)) throw new RangeError("native recorded learning needs native turn receipts");
  if (request.target.kind === "adapter") {
    const adapter = await store.getNativeTensorArtifact?.(request.target.id);
    if (!adapter || adapter.metadata.kind !== "adapter-coefficients" || !nativeModelIdentityEqual(adapter.metadata.native_identity, request.nativeIdentity))
      throw new Error("neuralese-native-adapter-binding: recorded target must be an archived exact-base nnt1 coefficient artifact");
    const names = request.target.names ?? Object.keys(adapter.tensors).sort();
    if (!names.length || names.some((name) => !Object.hasOwn(adapter.tensors, name)))
      throw new RangeError("native adapter target names must select exact archived coefficient tensors");
  }
  const reply = await post(
    endpoint,
    "/v1/neuralese/grad",
    { native_recorded_objective: {
      schema: "natlang.native-recorded-objective-request/1",
      turns: request.turns,
      events: request.events,
      terms: request.terms,
      target: request.target,
      native_state_modes: request.nativeStateModes
    } },
    request.headers
  );
  if (!nativeModelIdentityEqual(reply.native_identity, request.nativeIdentity))
    throw new Error("neuralese-native-identity: recorded gradient reply is bound to another checkpoint");
  const gradient = await archiveNativeTensorArtifact(endpoint, store, reply.gradient.id, request.headers);
  const expectedKind = request.target.kind === "adapter" ? "adapter-gradient" : request.target.kind === "native-state" ? "state-gradient" : "parameter-gradient";
  if (gradient.metadata.kind !== expectedKind || !nativeModelIdentityEqual(gradient.metadata.native_identity, request.nativeIdentity) || request.target.kind !== "model-parameters" && gradient.metadata.source_artifact_id !== request.target.id)
    throw new Error("neuralese-native-gradient-binding: recorded gradient differs from its exact target and actor");
  return { ...reply, gradient };
}
async function nativeRecordedGraphGradients(endpoint, store, request) {
  if (!request.turns.length || !request.events.length || !request.terms.length || !request.targets.length)
    throw new RangeError("native recorded learning needs actual turns, graph events, objective terms and target roots");
  if (!request.turns.some((turn) => turn.native)) throw new RangeError("native recorded learning needs native turn receipts");
  if (new Set(request.targets.map((target) => target.root)).size !== request.targets.length)
    throw new RangeError("native recorded target roots must be unique");
  const remote = new HttpNeuraleseStore(endpoint, request.headers);
  const adapterIds = request.targets.filter((target) => target.kind === "adapter").map((target) => target.id);
  if (adapterIds.length) {
    const missing2 = await restoreNativeTensorArtifacts(endpoint, store, adapterIds, request.headers);
    if (missing2.length) throw new Error(`neuralese-unknown-native-artifact: restore exact adapter targets ${missing2.join(", ")}`);
  }
  const stateIds = request.targets.filter((target) => target.kind === "native-state").map((target) => target.id);
  if (stateIds.length) await restoreNativeStates(remote, store, stateIds);
  for (const target of request.targets) if (target.kind === "adapter") {
    const adapter = await store.getNativeTensorArtifact?.(target.id);
    if (!adapter || adapter.metadata.kind !== "adapter-coefficients" || !nativeModelIdentityEqual(adapter.metadata.native_identity, request.nativeIdentity))
      throw new Error("neuralese-native-adapter-binding: recorded target must be an archived exact-base nnt1 coefficient artifact");
    const names = target.names ?? Object.keys(adapter.tensors).sort();
    if (!names.length || names.some((name) => !Object.hasOwn(adapter.tensors, name)))
      throw new RangeError("native adapter target names must select exact archived coefficient tensors");
  }
  const reply = await post(endpoint, "/v1/neuralese/grad", {
    native_recorded_objective: {
      schema: "natlang.native-recorded-objective-request/1",
      turns: request.turns,
      events: request.events,
      terms: request.terms,
      targets: request.targets,
      native_state_modes: request.nativeStateModes
    }
  }, request.headers);
  if (!nativeModelIdentityEqual(reply.native_identity, request.nativeIdentity))
    throw new Error("neuralese-native-identity: recorded gradient reply is bound to another checkpoint");
  const gradients = {};
  for (const target of request.targets) {
    const id = reply.gradients?.[target.root]?.id;
    if (typeof id !== "string") throw new Error(`neuralese-native-gradient-binding: missing gradient for target root ${target.root}`);
    const gradient = await archiveNativeTensorArtifact(endpoint, store, id, request.headers);
    const kind2 = target.kind === "adapter" ? "adapter-gradient" : "state-gradient";
    if (gradient.metadata.kind !== kind2 || !nativeModelIdentityEqual(gradient.metadata.native_identity, request.nativeIdentity) || gradient.metadata.source_artifact_id !== target.id)
      throw new Error(`neuralese-native-gradient-binding: recorded gradient differs from target root ${target.root}`);
    gradients[target.root] = gradient;
  }
  return { ...reply, gradients };
}
async function nativeDerivativeProgramGradient(endpoint, store, program, headers) {
  const remote = new HttpNeuraleseStore(endpoint, headers);
  const adapterIds = Object.values(program.inputs).filter((input) => input.kind === "adapter").map((input) => input.id);
  const missing2 = await restoreNativeTensorArtifacts(endpoint, store, adapterIds, headers);
  if (missing2.length) throw new Error(`neuralese-unknown-native-artifact: restore native derivative adapters ${missing2.join(", ")}`);
  const histories = program.nodes.map((node) => node.kind === "optimizer" ? node.optimizer_state : null).filter((id) => typeof id === "string" && id.startsWith("nnt1_"));
  const missingHistory = await restoreNativeTensorArtifacts(endpoint, store, histories, headers);
  if (missingHistory.length) throw new Error(`neuralese-unknown-native-artifact: restore native derivative optimizer history ${missingHistory.join(", ")}`);
  const stateIds = Object.values(program.inputs).filter((input) => input.kind === "native-state").map((input) => input.id);
  if (stateIds.length) await restoreNativeStates(remote, store, stateIds);
  const reply = await post(
    endpoint,
    "/v1/neuralese/grad",
    { native_derivative_program: program },
    headers
  );
  const gradients = {};
  for (const root of program.wrt) {
    const input = program.inputs[root], id = reply.gradients?.[root]?.id;
    if (!input || typeof id !== "string") throw new Error(`neuralese-native-derivative: missing gradient for root ${root}`);
    const gradient = await archiveNativeTensorArtifact(endpoint, store, id, headers);
    const kind2 = input.kind === "adapter" ? "adapter-gradient" : input.kind === "native-state" ? "state-gradient" : "parameter-gradient";
    if (gradient.metadata.kind !== kind2 || input.kind !== "model-parameters" && gradient.metadata.source_artifact_id !== input.id)
      throw new Error(`neuralese-native-derivative: root ${root} gradient changed its exact target binding`);
    gradients[root] = gradient;
  }
  return { loss: reply.loss, gradients, execution_id: reply.execution_id };
}
async function post(endpoint, path, body, headers = {}) {
  const response = await fetch(endpoint.replace(/\/$/, "") + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const error = providerErrorBody(await response.json().catch(() => ({})));
    const code = typeof error?.code === "string" ? error.code : typeof error?.error === "string" ? error.error : "neuralese-native-learning";
    const message = typeof error?.message === "string" ? error.message : response.statusText;
    throw Object.assign(
      new Error(message.startsWith(`${code}:`) ? message : `${code}: ${message}`),
      { code, status: response.status }
    );
  }
  return await response.json();
}
async function nativeGraphGradient(endpoint, store, request) {
  if (request.graph.split !== "train") throw new RangeError("native graph gradients accept train rows only");
  const bindings = [...request.adapters ?? [], ...Object.values(request.invocationAdapters ?? {}).flat()];
  if (bindings.length) {
    const ids = bindings.map((entry) => typeof entry === "string" ? entry : entry.id);
    const missing2 = await restoreNativeTensorArtifacts(endpoint, store, ids, request.headers);
    if (missing2.length) throw new Error(`neuralese-unknown-native-artifact: restore adapter coefficients and bases for ${missing2.join(", ")}`);
  }
  const external = request.graph.external_states;
  if (external) {
    const ids = Object.values(external).map((binding) => binding.id);
    await restoreNativeStates(new HttpNeuraleseStore(endpoint, request.headers), store, ids);
    for (const id of ids) await archiveNativeState({ endpoint, headers: request.headers, store }, id);
  }
  const reply = await post(
    endpoint,
    "/v1/neuralese/grad",
    {
      schema: "natlang.native-gradient-request/1",
      graph: request.graph,
      target: request.target,
      native_identity: request.nativeIdentity,
      adapters: request.adapters,
      invocation_adapters: request.invocationAdapters,
      adapter_gradient_precision: request.adapterGradientPrecision,
      native_state_modes: request.nativeStateModes,
      objective: request.objective ?? "graph-ce"
    },
    request.headers
  );
  if (!nativeModelIdentityEqual(reply.native_identity, request.nativeIdentity))
    throw new Error("neuralese-native-identity: gradient reply is bound to another checkpoint");
  const gradient = await archiveNativeTensorArtifact(endpoint, store, reply.gradient.id, request.headers);
  if (!nativeModelIdentityEqual(gradient.metadata.native_identity, request.nativeIdentity))
    throw new Error("neuralese-native-gradient-binding: archived gradient belongs to another checkpoint");
  if (gradient.metadata.kind !== "parameter-gradient" && gradient.metadata.kind !== "state-gradient" && gradient.metadata.kind !== "adapter-gradient")
    throw new Error("neuralese-native-gradient-kind: server returned a non-gradient tensor artifact");
  if (request.target.kind === "adapter" && (gradient.metadata.kind !== "adapter-gradient" || gradient.metadata.source_artifact_id !== request.target.id))
    throw new Error("neuralese-native-gradient-binding: coefficient gradient does not bind its requested adapter");
  return { ...reply, gradient };
}
async function nativeAdapterCreate(endpoint, store, request) {
  const reply = await post(endpoint, "/v1/neuralese/adapters", {
    kind: request.kind ?? "xs",
    rank: request.rank ?? 8,
    seed: request.seed ?? 0,
    parameter_names: request.parameterNames,
    native_identity: request.nativeIdentity
  }, request.headers);
  const adapter = await archiveNativeTensorArtifact(endpoint, store, reply.id, request.headers);
  if (adapter.metadata.kind !== "adapter-coefficients" || !nativeModelIdentityEqual(adapter.metadata.native_identity, request.nativeIdentity))
    throw new Error("neuralese-native-adapter-binding: created coefficients do not match the exact requested native base");
  return adapter;
}
async function nativeAdapterOptimizerStep(endpoint, store, request) {
  if (request.gradient.metadata.kind !== "adapter-gradient" || !nativeModelIdentityEqual(request.gradient.metadata.native_identity, request.nativeIdentity))
    throw new RangeError("native coefficient update requires an exact-base adapter gradient");
  if (!store.putNativeTensorArtifact) throw new Error("neuralese-native-archive-unavailable: configure a named tensor archive");
  const { id: _, ...input } = request.gradient;
  if ((await store.putNativeTensorArtifact(input)).id !== request.gradient.id)
    throw new Error("neuralese-native-gradient-binding: gradient changed before update");
  const missing2 = await restoreNativeTensorArtifacts(
    endpoint,
    store,
    [request.gradient.id, ...request.optimizerStateId ? [request.optimizerStateId] : []],
    request.headers
  );
  if (missing2.length) throw new Error(`neuralese-unknown-native-artifact: restore exact adapter/optimizer artifacts ${missing2.join(", ")}`);
  const reply = await post(endpoint, "/v1/neuralese/optim", {
    schema: "natlang.native-optimizer-request/1",
    native_identity: request.nativeIdentity,
    gradient_id: request.gradient.id,
    optimizer_state_id: request.optimizerStateId,
    optimizer: request.optimizer
  }, request.headers);
  const adapter = await archiveNativeTensorArtifact(endpoint, store, reply.adapter.id, request.headers);
  const state = await archiveNativeTensorArtifact(endpoint, store, reply.optimizer_state_id, request.headers);
  if (adapter.metadata.kind !== "adapter-coefficients" || state.metadata.kind !== "optimizer-state" || !nativeModelIdentityEqual(reply.native_identity, request.nativeIdentity) || !nativeModelIdentityEqual(adapter.metadata.native_identity, request.nativeIdentity) || !nativeModelIdentityEqual(state.metadata.native_identity, request.nativeIdentity) || state.metadata.source_artifact_id !== adapter.id || state.metadata.provenance.gradient_id !== request.gradient.id || state.metadata.provenance.parent_adapter_id !== request.gradient.metadata.source_artifact_id)
    throw new Error("neuralese-native-update-binding: adapter continuation differs from its exact gradient and optimizer");
  const priorActors = request.gradient.metadata.provenance.invocation_actors;
  if (priorActors) {
    validateNativeInvocationActorReceipt(priorActors, request.nativeIdentity);
    if (!reply.invocation_actors || reply.actor_graph_sha256 !== hexDigest(nativeCanonicalJson(reply.invocation_actors)))
      throw new Error("neuralese-native-update-binding: invocation actor continuation needs its exact receipt hash");
    validateNativeInvocationActorReceipt(reply.invocation_actors, request.nativeIdentity);
    if (nativeCanonicalJson(reply.invocation_source_names ?? null) !== nativeCanonicalJson(request.gradient.metadata.provenance.invocation_source_names ?? null) || nativeCanonicalJson(state.metadata.provenance.invocation_actors) !== nativeCanonicalJson(reply.invocation_actors) || state.metadata.provenance.actor_graph_sha256 !== reply.actor_graph_sha256)
      throw new Error("neuralese-native-update-binding: optimizer archive changed its exact invocation continuation");
    if (Object.keys(priorActors.invocations).sort().join("\0") !== Object.keys(reply.invocation_actors.invocations).sort().join("\0"))
      throw new Error("neuralese-native-update-binding: invocation inventory changed during coefficient update");
    for (const [name, before] of Object.entries(priorActors.invocations)) {
      const after = reply.invocation_actors.invocations[name];
      const expected = before.adapter_binding ? { ...before.adapter_binding, adapters: before.adapter_binding.adapters.map((entry) => ({ ...entry, id: entry.id === request.gradient.metadata.source_artifact_id ? adapter.id : entry.id })) } : null;
      if (nativeCanonicalJson(after.adapter_binding) !== nativeCanonicalJson(expected))
        throw new Error("neuralese-native-update-binding: invocation actor order, scale or unrelated coefficients changed");
    }
    if (reply.adapter_binding || reply.effective_native_identity)
      throw new Error("neuralese-native-update-binding: heterogeneous graph cannot be relabeled as one actor");
    return { ...reply, adapter };
  }
  if (reply.invocation_actors || !reply.adapter_binding || !reply.effective_native_identity)
    throw new Error("neuralese-native-update-binding: coefficient update changed its actor contract");
  const currentBinding = reply.adapter_binding;
  validateNativeAdapterBinding(currentBinding, reply.effective_native_identity);
  const previous = request.gradient.metadata.provenance.adapter_binding;
  const expectedAdapters = previous ? previous.adapters.map((entry) => ({
    ...entry,
    id: entry.id === request.gradient.metadata.source_artifact_id ? adapter.id : entry.id
  })) : [{ id: adapter.id, scale_hex: "0x1.0000000000000p+0" }];
  if (!nativeModelIdentityEqual(currentBinding.base_native_identity, request.nativeIdentity) || currentBinding.adapters.length !== expectedAdapters.length || expectedAdapters.some((entry, index) => entry.id !== currentBinding.adapters[index]?.id || entry.scale_hex !== currentBinding.adapters[index]?.scale_hex))
    throw new Error("neuralese-native-update-binding: adapter update changed the actor order or scales");
  return { ...reply, adapter };
}
async function nativeStateOptimizerStep(endpoint, store, request) {
  if (request.gradient.metadata.kind !== "state-gradient" || !nativeModelIdentityEqual(request.gradient.metadata.native_identity, request.nativeIdentity))
    throw new RangeError("native state update requires an exact-base named state gradient");
  if (!store.putNativeTensorArtifact) throw new Error("neuralese-native-archive-unavailable: configure a named tensor archive");
  const { id: _, ...input } = request.gradient;
  if ((await store.putNativeTensorArtifact(input)).id !== request.gradient.id) throw new Error("neuralese-native-gradient-binding: state gradient changed before upload");
  const remote = new HttpNeuraleseStore(endpoint, request.headers);
  const missing2 = await restoreNativeArtifacts(remote, store, [request.gradient.id, ...request.optimizerStateId ? [request.optimizerStateId] : []]);
  if (missing2.length) throw new Error(`neuralese-unknown-native-artifact: restore exact state update dependencies ${missing2.join(", ")}`);
  const reply = await post(
    endpoint,
    "/v1/neuralese/optim",
    {
      schema: "natlang.native-optimizer-request/1",
      native_identity: request.nativeIdentity,
      gradient_id: request.gradient.id,
      optimizer_state_id: request.optimizerStateId,
      optimizer: request.optimizer
    },
    request.headers
  );
  if (!nativeModelIdentityEqual(reply.native_identity, request.nativeIdentity)) throw new Error("neuralese-native-update-binding: state update changed its exact native base");
  const artifact = await archiveNativeState({ endpoint, store, headers: request.headers }, reply.native_state_id);
  const derivation = artifact.metadata.derivation;
  if (!derivation || derivation.kind !== "optimizer" || derivation.parent_state_id !== request.gradient.metadata.source_artifact_id || derivation.gradient_id !== request.gradient.id || derivation.step !== reply.step || derivation.update_artifact_id !== reply.update_artifact_id || derivation.optimizer_state_parent_id !== (request.optimizerStateId ?? null))
    throw new Error("neuralese-native-update-binding: state update differs from its exact gradient, parent or optimizer history");
  const history = await archiveNativeTensorArtifact(endpoint, store, reply.optimizer_state_id, request.headers);
  if (history.metadata.kind !== "optimizer-state" || history.metadata.source_artifact_id !== artifact.id || history.metadata.provenance.step !== reply.step)
    throw new Error("neuralese-native-update-binding: state optimizer history differs from the actual updated artifact");
  return { ...reply, native_state: artifact };
}

// src/neuralese/learning.ts
var SERVICE = /* @__PURE__ */ Symbol("natlang.learning-service");
var isLearningService = (value) => !!value && typeof value === "object" && SERVICE in value;
var LearningError = class extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = "LearningError";
  }
  code;
};
function assertLearningActors(turns, where) {
  const key = (actor) => JSON.stringify([actor.id, actor.revision]);
  const known = /* @__PURE__ */ new Set();
  let unknown = false;
  for (const turn of turns) {
    const actor = turn.actor ?? turn.native?.actor;
    if (!actor) {
      unknown = true;
      continue;
    }
    if (typeof actor.id !== "string" || !actor.id || !(actor.revision === null || typeof actor.revision === "string"))
      throw new LearningError("learning-mixed-actor", `${where} has an invalid actor identity`);
    known.add(key(actor));
    if (turn.initial_actor && key(turn.initial_actor) !== key(actor))
      throw new LearningError("learning-mixed-actor", `${where} includes a foreign handoff actor`);
  }
  if (known.size > 1 || known.size > 0 && unknown)
    throw new LearningError("learning-mixed-actor", `${where} cannot combine different or unknown actors`);
}
function assertNativeLearningActor(rec, turns, identity) {
  assertLearningActors(turns, "native replay");
  if ([...rec.graphNodes.values()].some((node) => node.kind === "combinator" && node.operation === "model-escalation"))
    throw new LearningError("learning-mixed-actor", "native replay cannot train a graph containing a model handoff");
  for (const turn of turns) {
    if (!turn.native) continue;
    const capture2 = turn.native.kind === "generation" ? turn.native.sampling : turn.native.decision;
    const binding = capture2.adapter_binding;
    const policy = binding?.base_native_identity ?? capture2.policy;
    if (!policy && !(turn.actor ?? turn.native.actor)) continue;
    if (!policy || !nativeModelIdentityEqual(policy, identity))
      throw new LearningError("learning-foreign-actor", "native replay policy does not match the target checkpoint identity");
  }
}
var Recorder = class extends ModelTurnRecorder {
};
var recording = new AsyncLocalStorage2();
setRecorderSource(() => recording.getStore());
function recorder(where) {
  const active = recording.getStore();
  if (!active) throw new LearningError("learning-outside-grad", `${where} must run inside grad or valueAndGrad`);
  return active;
}
var Loss = class {
  constructor(terms) {
    this.terms = terms;
  }
  terms;
  value;
  valueOf() {
    if (this.value === void 0) throw new LearningError("learning-loss-unevaluated", "a loss has a value only after valueAndGrad");
    return this.value;
  }
  toJSON() {
    return { $loss: { terms: this.terms.length, value: this.value ?? null } };
  }
};
var settle = async (output) => {
  try {
    await (typeof output === "function" ? output() : output);
    return void 0;
  } catch (error) {
    return error;
  }
};
var failureNote = (error) => error === void 0 ? "" : `; the output failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 600);
async function capture(rec, output, where) {
  if (typeof output === "function") {
    const own = new Recorder();
    own.absorb(rec);
    const failure = await recording.run(own, () => settle(output));
    rec.nested.push(...own.turns, ...own.nested);
    rec.absorb(own);
    return Object.assign(own.turns, { failure });
  }
  if (rec.active) rec.overlapped = true;
  rec.active++;
  try {
    const failure = await settle(output);
    if (rec.overlapped) throw new LearningError(
      "learning-concurrent-objectives",
      `${where}: objectives over promises overlapped, so their turns cannot be told apart; pass the output as a function (() => runtime.run(...))`
    );
    return Object.assign(rec.claim(), { failure });
  } finally {
    if (--rec.active === 0) rec.overlapped = false;
  }
}
function privilegeLeak(privileged, view) {
  if (privileged === void 0 || privileged === null) return void 0;
  const texts = [];
  const visit = (value) => {
    if (typeof value === "string") texts.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(view);
  const haystack = texts.join("\n");
  const fragments = [];
  const json3 = typeof privileged === "string" ? privileged : JSON.stringify(privileged);
  if (json3.length >= 8) fragments.push(json3);
  const leaves = (value) => {
    if (typeof value === "string") {
      if (value.length >= 8) fragments.push(value);
    } else if (Array.isArray(value)) value.forEach(leaves);
    else if (value && typeof value === "object") Object.values(value).forEach(leaves);
  };
  leaves(privileged);
  return fragments.find((fragment) => haystack.includes(fragment));
}
var adapted = (turn) => ({
  ...turn.adapters?.length ? { adapters: turn.adapters } : {},
  ...turn.native_state_modes ? { native_state_modes: turn.native_state_modes } : {},
  ...turn.native ? { native_turn_id: turn.native.id } : {}
});
function lastTurn(turns, where) {
  const turn = turns.filter((item) => !item.decision).at(-1);
  if (!turn) throw new LearningError("learning-no-turns", `${where}: the output made no recorded model turn (is the model a Neuralese server?)${failureNote(turns.failure)}`);
  return turn;
}
function returnTarget(expected) {
  return { role: "assistant", content: null, tool_calls: [{ id: "expected", type: "function", function: {
    name: "return_result",
    arguments: JSON.stringify({ status: "success", value: expected })
  } }] };
}
var trajectories = 0;
var objectives = {
  /** Cross-entropy of the expected result as the output call's final answer. */
  async crossEntropy(output, expected) {
    const rec = recorder("objectives.crossEntropy");
    const turn = lastTurn(await capture(rec, output, "crossEntropy"), "crossEntropy");
    return new Loss([{ kind: "crossEntropy", messages: turn.messages, tools: turn.tools, target: returnTarget(expected), ...adapted(turn) }]);
  },
  /**
   * A proper scoring rule on a decision readout (a call with `readout: decision`): the output's scored options,
   * normalised, against `expected` probabilities by option value (`{ "yes": 0.8, "no": 0.2 }`) or one value (all
   * mass on it). `rule`: `logLoss` (default), `brier`, or `rps` for ordered options (declaration order).
   */
  async decision(output, expected, rule = "logLoss") {
    const rec = recorder("objectives.decision");
    const turns = await capture(rec, output, "decision");
    const turn = turns.filter((item) => item.decision).at(-1);
    if (!turn?.decision) throw new LearningError("learning-no-decision", "objectives.decision: the output made no decision readout (does its function declare readout: decision?)" + failureNote(turns.failure));
    const options = turn.decision.options;
    const weights = expected && typeof expected === "object" && !Array.isArray(expected) ? Object.fromEntries(Object.entries(expected).map(([key, value]) => [JSON.stringify(key), Number(value)])) : { [JSON.stringify(expected)]: 1 };
    const probability = (option) => weights[option] ?? weights[JSON.stringify(option)] ?? 0;
    const probabilities = options.map(probability);
    const total = probabilities.reduce((sum, value) => sum + value, 0);
    if (!(total > 0) || probabilities.some((value) => !(value >= 0)))
      throw new LearningError("learning-decision-target", `objectives.decision: expected must put mass on the options ${options.join(", ")}`);
    return new Loss([{
      kind: "decision",
      messages: turn.messages,
      tools: turn.tools,
      options: [...options],
      rule,
      target: { probabilities: probabilities.map((value) => value / total) },
      ...adapted(turn)
    }]);
  },
  /** KL from the same model given the full source to the output's final turn. */
  async selfDistill(output, withFullSource) {
    const rec = recorder("objectives.selfDistill");
    const student = lastTurn(await capture(rec, output, "selfDistill"), "selfDistill");
    const teacher = lastTurn(await capture(rec, withFullSource, "selfDistill"), "selfDistill (full source)");
    return new Loss([{
      kind: "selfDistill",
      messages: student.messages,
      tools: student.tools,
      target: student.reply,
      teacher_messages: teacher.messages,
      ...adapted(student),
      ...teacher.native ? { teacher_native_turn_id: teacher.native.id } : {},
      ...teacher.native_state_modes ? { teacher_native_state_modes: teacher.native_state_modes } : {},
      ...teacher.adapters?.length ? { teacher_adapters: teacher.adapters } : {}
    }]);
  },
  /**
   * Conditioned distillation (LEARNING_CONTINUUM §4.3): `teacher` is the same program run with knowledge the student
   * does not see (a skill text, a document, a worked solution, the outcome); the student is the run with the artifact
   * being trained and without it. A decision readout distils exactly: the teacher's readout over the same options is
   * the target (computed by the server, without gradient). A generated reply distils by KL(teacher ‖ student) over
   * the student's reply, as `selfDistill`. `privileged` is the knowledge itself: if any fragment of it (string leaves
   * of 8+ characters, or its JSON) appears in what the student sees, the objective fails (the privilege check).
   */
  async conditionedDistill(student, teacher, options = {}) {
    const rec = recorder("objectives.conditionedDistill");
    const studentTurns = await capture(rec, student, "conditionedDistill");
    const teacherTurns = await capture(rec, teacher, "conditionedDistill (teacher)");
    const own = studentTurns.at(-1), privileged = teacherTurns.at(-1);
    if (!own) throw new LearningError("learning-no-turns", "conditionedDistill: the student made no recorded model turn" + failureNote(studentTurns.failure));
    if (!privileged) throw new LearningError("learning-no-turns", "conditionedDistill: the teacher made no recorded model turn" + failureNote(teacherTurns.failure));
    if (JSON.stringify([own.messages, own.adapters ?? []]) === JSON.stringify([privileged.messages, privileged.adapters ?? []]))
      throw new LearningError("learning-teacher-unconditioned", "conditionedDistill: the teacher saw exactly what the student saw; give it the privileged context");
    const leak = privilegeLeak(options.privileged, own.messages);
    if (leak) throw new LearningError("learning-privilege-leak", `conditionedDistill: the student's view contains privileged text ${JSON.stringify(leak.slice(0, 80))}`);
    const teacherSide = {
      messages: privileged.messages,
      ...privileged.tools ? { tools: privileged.tools } : {},
      ...adapted(privileged)
    };
    if (own.decision) {
      if (!privileged.decision || JSON.stringify(privileged.decision.options) !== JSON.stringify(own.decision.options))
        throw new LearningError("learning-teacher-mismatch", "conditionedDistill: the teacher must make the same decision readout (same options) as the student");
      return new Loss([{
        kind: "decision",
        messages: own.messages,
        tools: own.tools,
        options: [...own.decision.options],
        rule: options.rule ?? "logLoss",
        teacher: teacherSide,
        ...adapted(own)
      }]);
    }
    if (privileged.decision) throw new LearningError("learning-teacher-mismatch", "conditionedDistill: the student generated a reply but the teacher made a decision readout");
    return new Loss([{
      kind: "selfDistill",
      messages: own.messages,
      tools: own.tools,
      target: own.reply,
      teacher_messages: privileged.messages,
      ...adapted(own),
      ...privileged.native ? { teacher_native_turn_id: privileged.native.id } : {},
      ...privileged.native_state_modes ? { teacher_native_state_modes: privileged.native_state_modes } : {},
      ...privileged.adapters?.length ? { teacher_adapters: privileged.adapters } : {}
    }]);
  },
  /**
   * Reinforcement on a decision readout: `reward(value)` scores each option's value (host-side; the model never sees
   * it), and the loss is −Σ pᵢ rᵢ under the readout. A finite decision's expected reward is exact, so this is the
   * policy gradient without sampling. Rewards are centred on their mean so only differences between options matter.
   */
  async expectedReward(output, reward) {
    const rec = recorder("objectives.expectedReward");
    const turns = await capture(rec, output, "expectedReward");
    const turn = turns.filter((item) => item.decision).at(-1);
    if (!turn?.decision) throw new LearningError("learning-no-decision", "objectives.expectedReward: the output made no decision readout (does its function declare readout: decision?)" + failureNote(turns.failure));
    const options = turn.decision.options;
    const values = options.map((option) => {
      try {
        return JSON.parse(option);
      } catch {
        return option;
      }
    });
    const rewards = await Promise.all(values.map(async (value) => Number(await reward(value))));
    if (rewards.some((value) => !Number.isFinite(value))) throw new LearningError("learning-reward", "objectives.expectedReward: rewards must be finite numbers");
    const mean = rewards.reduce((sum, value) => sum + value, 0) / rewards.length;
    return new Loss([{
      kind: "decision",
      messages: turn.messages,
      tools: turn.tools,
      options: [...options],
      rule: "expectedReward",
      target: { rewards: rewards.map((value) => value - mean) },
      ...adapted(turn)
    }]);
  },
  /**
   * REINFORCE over sampled trajectories (run at temperature > 0 so they differ): each trajectory's
   * negative log-likelihood is weighted by its advantage, reward − baseline (the mean reward of the group by default,
   * as in group-relative policy optimisation), divided by the group size. Trajectories with equal rewards contribute
   * nothing.
   */
  async policyGradient(samples, options = {}) {
    if (!samples.length) throw new LearningError("learning-reward", "objectives.policyGradient needs at least one sample");
    if (samples.some((sample) => !Number.isFinite(sample.reward))) throw new LearningError("learning-reward", "objectives.policyGradient: rewards must be finite numbers");
    assertLearningActors(samples.flatMap((sample) => sample.trajectory.turns), "policy gradient");
    const baseline = typeof options.baseline === "number" ? options.baseline : samples.reduce((sum, sample) => sum + sample.reward, 0) / samples.length;
    const terms = [];
    for (const { trajectory, reward } of samples) {
      const weight = (reward - baseline) / samples.length;
      if (weight === 0) continue;
      for (const turn of trajectory.turns) if (!turn.decision)
        terms.push({
          kind: "logLikelihood",
          messages: turn.messages,
          tools: turn.tools,
          target: turn.reply,
          weight,
          likelihood_law: "sampled-policy",
          ...adapted(turn)
        });
    }
    return new Loss(terms);
  },
  /** Negative log-probability of a recorded trajectory: its sampled tokens, producer spans included. */
  async logLikelihood(trajectory, weight = 1) {
    assertLearningActors(trajectory.turns, "log likelihood");
    return new Loss(trajectory.turns.map((turn) => ({
      kind: "logLikelihood",
      messages: turn.messages,
      tools: turn.tools,
      target: turn.reply,
      weight,
      likelihood_law: "model-conditional",
      ...adapted(turn)
    })));
  },
  /**
   * A law of the combinators as a consistency loss (S0 §4.2), measured through `read`: the right side is evaluated
   * to a value, and the loss is the cross-entropy of that value as the left side's readout, so gradients reach the
   * left side only. Arguments by law: mapIdentity(v, id), mapFusion(v, g, f, fAfterG), readMapCommutation(v, f),
   * combineAssociativity(a, b, c), combineIdentity(v), splitZip(a, b). The combinators come from the task's
   * `neuralese` service, or from `createLearning(service, { library })`.
   */
  async law(name, ...args) {
    return lawLoss(void 0, name, args);
  },
  async sum(...losses) {
    return new Loss(losses.flatMap((loss) => loss.terms));
  },
  async scale(loss, weight) {
    return new Loss(loss.terms.map((term) => ({ ...term, weight: (term.weight ?? 1) * weight })));
  }
};
var LAW_NAMES = ["mapIdentity", "mapFusion", "readMapCommutation", "combineAssociativity", "combineIdentity", "splitZip"];
async function lawLoss(explicit, name, args) {
  const rec = recorder(`objectives.law(${name})`);
  const library = explicit ?? currentFrame()?.task.services?.neuralese;
  if (!library?.bodies) throw new LearningError("learning-law-unavailable", "law objectives need the neuralese standard library");
  const lib = createNeuraleseLibrary(library);
  const ref = (value, what) => {
    if (!isNeuraleseRef(value)) throw new LearningError("learning-law-arguments", `${name}: ${what} must be a Neuralese value`);
    return value;
  };
  const read = async (value) => lib.read(ref(await value, "each side"));
  const fn = (value, what) => {
    if (typeof value !== "function" && !isNeuraleseRef(value)) throw new LearningError("learning-law-arguments", `${name}: ${what} must be a function`);
    return value;
  };
  const [a, b, c, d] = args;
  const pairs = [];
  switch (name) {
    case "mapIdentity":
      pairs.push([() => read(lib.map(ref(a, "v"), fn(b, "id"))), () => read(a)]);
      break;
    case "mapFusion":
      pairs.push([
        () => read(lib.map(ref(a, "v"), fn(b, "g")).then((x) => lib.map(ref(x, "map(v, g)"), fn(c, "f")))),
        () => read(lib.map(ref(a, "v"), fn(d, "fAfterG")))
      ]);
      break;
    case "readMapCommutation":
      pairs.push([
        () => read(lib.map(ref(a, "v"), fn(b, "f"))),
        async () => b(await read(a))
      ]);
      break;
    case "combineAssociativity":
      pairs.push([
        () => read(lib.combine(ref(a, "a"), ref(b, "b")).then((ab) => lib.combine(ref(ab, "combine(a, b)"), ref(c, "c")))),
        () => read(lib.combine(ref(b, "b"), ref(c, "c")).then((bc) => lib.combine(ref(a, "a"), ref(bc, "combine(b, c)"))))
      ]);
      break;
    case "combineIdentity":
      pairs.push([() => read(lib.combine(ref(a, "v"), lib.empty())), () => read(a)]);
      break;
    case "splitZip": {
      const parts = async () => {
        const split = await lib.split(ref(await lib.zip(ref(a, "a"), ref(b, "b")), "zip(a, b)"));
        if (!Array.isArray(split) || split.length !== 2) throw new LearningError("learning-law-arguments", "splitZip: split did not return a pair");
        return split;
      };
      pairs.push([async () => read((await parts())[0]), () => read(a)], [async () => read((await parts())[1]), () => read(b)]);
      break;
    }
    default:
      throw new LearningError("learning-law-unknown", `unknown law ${String(name)}; expected one of ${LAW_NAMES.join(", ")}`);
  }
  const terms = [];
  for (const [left, right] of pairs) {
    let expected;
    try {
      expected = await right();
    } catch (error) {
      throw new LearningError("learning-law-reference", `${name}: the right side failed: ${error.message}`);
    } finally {
      rec.claim();
    }
    let failure;
    try {
      await left();
    } catch (error) {
      failure = error;
    }
    const turns = rec.claim();
    if (!turns.length && failure)
      throw new LearningError("learning-law-left", `${name}: the left side failed before any model turn: ${failure.message}`);
    const turn = lastTurn(turns, `law ${name}`);
    terms.push({ kind: "crossEntropy", law: name, messages: turn.messages, tools: turn.tools, target: returnTarget(expected), ...adapted(turn) });
  }
  return new Loss(terms);
}
var nativeAdapterScope = new AsyncLocalStorage2();
setNativeAdapterSource(() => nativeAdapterScope.getStore());
var nativeStateScope = new AsyncLocalStorage2();
setNativeStateSource(() => nativeStateScope.getStore());
async function withNativeAdapters(adapters, fn) {
  const bindings = (Array.isArray(adapters) ? adapters : [adapters]).map((item) => {
    const ref = isNativeAdapterRef(item) ? item : item.adapter;
    if (!isNativeAdapterRef(ref)) throw new LearningError("learning-native-adapter", "withNativeAdapters takes named native adapter references");
    const scale = isNativeAdapterRef(item) ? 1 : item.scale ?? 1;
    if (!Number.isFinite(scale)) throw new LearningError("learning-native-adapter", "native adapter scales must be finite");
    return { id: ref.$nativeAdapter.id, scale };
  });
  const active = activeService("withNativeAdapters");
  if (!active.store?.getNativeTensorArtifact)
    throw new LearningError("learning-native-archive-unavailable", "withNativeAdapters requires a named native tensor archive");
  for (const binding of bindings) {
    const artifact = await active.store.getNativeTensorArtifact(binding.id);
    if (!artifact || artifact.metadata.kind !== "adapter-coefficients")
      throw new LearningError("learning-native-adapter", `${binding.id} is not an archived native adapter coefficient artifact`);
  }
  return nativeAdapterScope.run([...nativeAdapterScope.getStore() ?? [], ...bindings], fn);
}
async function withNativeStates(states, fn) {
  const bindings = (Array.isArray(states) ? states : [states]).map((id) => {
    if (typeof id !== "string" || !isNativeStateId(id))
      throw new LearningError("learning-native-state", "withNativeStates takes stored native-state IDs");
    return { id };
  });
  if (!bindings.length) throw new LearningError("learning-native-state", "withNativeStates needs at least one stored native-state ID");
  return await nativeStateScope.run(bindings, fn);
}
var promptScope = new AsyncLocalStorage2();
setSystemPromptSource(() => promptScope.getStore());
async function withSystemPrompts(prompts, fn) {
  const bank = systemPromptBank(prompts);
  const outer = promptScope.getStore();
  return promptScope.run(outer?.size ? new Map([...outer, ...bank]) : bank, fn);
}
var stopped = /* @__PURE__ */ new WeakSet();
function stopGradient(v) {
  const copy = (value) => {
    if (isNeuraleseRef(value)) {
      const ref = neuraleseRef(value.$neuralese.type, value.$neuralese.id, true, value.$neuralese.source_occurrence, value.$neuralese.teacher_text === true);
      stopped.add(ref);
      return ref;
    }
    if (Array.isArray(value)) return value.map(copy);
    if (isPlainObject(value))
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
    return value;
  };
  return copy(v);
}
function softLeaves(a) {
  const out = [];
  const visit = (value) => {
    if (isNeuraleseRef(value)) {
      if (!isNativeStateId(value.$neuralese.id)) out.push(value);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
    else if (isPlainObject(value)) Object.values(value).forEach(visit);
  };
  visit(a);
  return out;
}
function mapLeaves(a, replace) {
  if (isNeuraleseRef(a)) return replace(a);
  if (Array.isArray(a)) return a.map((item) => mapLeaves(item, replace));
  if (isPlainObject(a))
    return Object.fromEntries(Object.entries(a).map(([key, item]) => [key, mapLeaves(item, replace)]));
  return a;
}
function nativeLearningLeaves(value) {
  const out = [];
  const visit = (item) => {
    if (isNativeAdapterRef(item)) {
      out.push(item);
      return;
    }
    if (isNeuraleseRef(item) && isNativeStateId(item.$neuralese.id)) {
      if (!stopped.has(item) && !item.$neuralese.stop_gradient) out.push(item);
      return;
    }
    if (Array.isArray(item)) item.forEach(visit);
    else if (isPlainObject(item))
      Object.values(item).forEach(visit);
  };
  visit(value);
  return out;
}
function nativeLearningId(value) {
  return isNativeAdapterRef(value) ? value.$nativeAdapter.id : value.$neuralese.id;
}
function recordedNativeStateModes(turns) {
  const modes = {};
  for (const turn of turns) for (const [id, mode] of Object.entries(turn.native_state_modes ?? {})) {
    if (modes[id] && modes[id] !== mode)
      throw new LearningError("learning-native-state-mode", `recorded turns disagree on native state mode for ${id}`);
    modes[id] = mode;
  }
  return Object.keys(modes).length ? modes : void 0;
}
function mapNativeLearningLeaves(value, replace) {
  if (isNativeAdapterRef(value)) return replace(value);
  if (isNeuraleseRef(value) && isNativeStateId(value.$neuralese.id)) return replace(value);
  if (Array.isArray(value)) return value.map((item) => mapNativeLearningLeaves(item, replace));
  if (isPlainObject(value))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapNativeLearningLeaves(item, replace)]));
  return value;
}
async function nativeLearningTargets(service, refs) {
  if (!service.store?.getNativeState || !service.store.getNativeTensorArtifact)
    throw new LearningError("learning-native-archive-unavailable", "native gradients require named nnt1/nzs1 artifacts");
  const remote = new HttpNeuraleseStore(service.endpoint, service.headers);
  const unique = /* @__PURE__ */ new Map();
  for (const ref of refs) unique.set(nativeLearningId(ref), ref);
  if (!unique.size) throw new LearningError("learning-native-target", "native gradients need at least one differentiable target");
  const targets = [];
  let identity;
  for (const [index, [id, ref]] of [...unique].entries()) {
    let current;
    let target;
    if (isNativeAdapterRef(ref)) {
      const artifact = await service.store.getNativeTensorArtifact(id) ?? await remote.getNativeTensorArtifact(id);
      if (!artifact || artifact.metadata.kind !== "adapter-coefficients")
        throw new LearningError("learning-native-target", `${id} is not an archived native adapter coefficient artifact`);
      await archiveNativeArtifactFrom(remote, service.store, id);
      current = artifact.metadata.native_identity;
      target = { root: `native-target-${index}`, kind: "adapter", id, names: Object.keys(artifact.tensors).sort() };
    } else {
      const artifact = await service.store.getNativeState(id) ?? await remote.getNativeState(id);
      if (!artifact) throw new LearningError("learning-native-target", `${id} is not an archived native state artifact`);
      await archiveNativeArtifactFrom(remote, service.store, id);
      current = artifact.metadata.adapter_binding?.base_native_identity ?? {
        architecture: artifact.metadata.architecture,
        checkpoint_sha256: artifact.metadata.checkpoint_sha256,
        tokenizer_fingerprint: artifact.metadata.tokenizer_fingerprint,
        embedding_weight_sha256: artifact.metadata.embedding_weight_sha256
      };
      target = { root: `native-target-${index}`, kind: "native-state", id };
    }
    if (identity && !nativeModelIdentityEqual(identity, current))
      throw new LearningError("learning-native-target", "native gradient roots must share one exact base checkpoint identity");
    identity = current;
    targets.push(target);
  }
  return { targets, identity, byId: new Map(targets.map((target) => [target.id, target])) };
}
function nativeDerivativeContext(targets) {
  const context = {
    roots: /* @__PURE__ */ new Map(),
    rootById: /* @__PURE__ */ new Map(),
    valueById: /* @__PURE__ */ new Map(),
    currentByRoot: /* @__PURE__ */ new Map(),
    gradientById: /* @__PURE__ */ new Map(),
    next: 0
  };
  for (const target of targets) {
    context.roots.set(target.root, target);
    context.rootById.set(target.id, target.root);
    context.valueById.set(target.id, target.root);
    context.currentByRoot.set(target.root, target.root);
  }
  return context;
}
function registerNativeGradientDerivation(context, targetInfo, objective, gradients) {
  const bindings = Object.fromEntries(context.currentByRoot);
  const nodeTargets = [];
  const requestTargets = [];
  for (const target of targetInfo.targets) {
    let root = context.rootById.get(target.id);
    if (!root) {
      root = `native-root-${context.next++}`;
      const descriptor2 = { ...target, root };
      context.roots.set(root, descriptor2);
      context.rootById.set(target.id, root);
      context.valueById.set(target.id, root);
      context.currentByRoot.set(root, root);
      bindings[root] = root;
    }
    const value = context.valueById.get(target.id);
    const descriptor = context.roots.get(root);
    if (!value || !descriptor) throw new LearningError("learning-native-order2", `native derivative lost exact root ${target.id}`);
    requestTargets.push(descriptor);
    const gradientId = gradients[target.id];
    if (!gradientId) throw new LearningError("learning-native-order2", `native derivative lost gradient for ${target.id}`);
    const alias = `native-gradient-${context.next++}`;
    nodeTargets.push({ name: alias, value });
    context.gradientById.set(gradientId, alias);
  }
  const name = `native-grad-node-${context.next++}`;
  return {
    kind: "gradient",
    name,
    request: {
      schema: "natlang.native-recorded-objective-request/1",
      turns: objective.turns,
      events: objective.events,
      terms: objective.terms,
      targets: requestTargets,
      ...objective.nativeStateModes ? { native_state_modes: objective.nativeStateModes } : {}
    },
    bindings,
    targets: nodeTargets
  };
}
function activeService(where, explicit) {
  const found = explicit ?? boundService.getStore() ?? currentFrame()?.task.services?.learning;
  if (!isLearningService(found))
    throw new LearningError("learning-unavailable", `${where} needs the natlang:learning service, which this caller was not given`);
  return found;
}
var boundService = new AsyncLocalStorage2();
var derivations = new AsyncLocalStorage2();
async function evaluate(service, f, a, order) {
  if (order !== void 0 && order !== 1 && order !== 2)
    throw new LearningError("neuralese-grad-unavailable", "gradients of order 1 or 2");
  const leaves = softLeaves(a).filter((ref) => !stopped.has(ref) && !ref.$neuralese.stop_gradient);
  const nativeLeaves = nativeLearningLeaves(a);
  if (leaves.length)
    throw new LearningError("learning-native-target", "projected nz1 values are not differentiable targets; pass archived nzs1 state or nnt1 coefficient artifacts");
  if (!nativeLeaves.length)
    throw new LearningError("learning-native-target", "recorded gradients need at least one archived native state or coefficient target");
  const targetInfo = nativeLeaves.length ? await nativeLearningTargets(service, nativeLeaves) : void 0;
  const rec = new Recorder();
  const derived = targetInfo ? { nodes: [], native: nativeDerivativeContext(targetInfo.targets) } : void 0;
  const outer = derivations.getStore();
  if (order === 2 && outer) throw new LearningError("learning-grad-order", "native learning supports derivatives through order 2, not nested order-3 programs");
  const loss = await derivations.run(derived, () => recording.run(rec, () => boundService.run(service, () => f(a))));
  if (!(loss instanceof Loss)) throw new LearningError("learning-not-a-loss", "the function passed to grad must return a Loss from objectives");
  if (!loss.terms.length) {
    loss.value = 0;
    const soft = mapLeaves(a, (ref) => isNativeStateId(ref.$neuralese.id) ? ref : null);
    const native = mapNativeLearningLeaves(soft, () => null);
    return { loss, grad: { $gradient: native } };
  }
  if (nativeLeaves.length) {
    if (leaves.length)
      throw new LearningError("learning-native-target", "native checkpoint gradients accept native nnt1/nzs1 roots; projected nz1 values have no native checkpoint-coordinate derivative");
    if (!targetInfo) throw new LearningError("learning-native-target", "native derivative target inventory is missing");
    const turns = [...rec.turns, ...rec.nested];
    const nativeTurns = rec.nativeTurns();
    assertNativeLearningActor(rec, turns, targetInfo.identity);
    const byTurnId = new Map(nativeTurns.map((turn) => [turn.native.id, turn.native]));
    const exactTurns = turns.filter((turn) => turn.native).map((turn) => ({ ...structuredClone(turn), native: byTurnId.get(turn.native.id) }));
    const events = structuredClone([...rec.graphNodes.values()]);
    const requestTargets = targetInfo.targets.map((target) => {
      const root = derived?.native?.rootById.get(target.id) ?? target.root;
      return { ...target, root };
    });
    const nativeStateModes = recordedNativeStateModes(exactTurns);
    const objective = { turns: exactTurns, events, terms: loss.terms, ...nativeStateModes ? { nativeStateModes } : {} };
    let gradientArtifacts, derivativeExecution;
    if (order === 2 || derived?.nodes.length) {
      if (order !== 2 && outer)
        throw new LearningError("learning-grad-order", "a gradient whose loss updates its argument cannot itself run inside another gradient");
      const context = derived?.native;
      if (!context) throw new LearningError("learning-native-order2", "native derivative program roots were not declared");
      const program = {
        schema: "natlang.native-derivative-program/1",
        inputs: Object.fromEntries([...context.roots].map(([root, target]) => [root, {
          kind: target.kind,
          id: target.id,
          ...target.names ? { names: target.names } : {}
        }])),
        nodes: derived.nodes,
        outer: {
          request: {
            schema: "natlang.native-recorded-objective-request/1",
            turns: objective.turns,
            events: objective.events,
            terms: objective.terms,
            targets: requestTargets,
            ...nativeStateModes ? { native_state_modes: nativeStateModes } : {}
          },
          bindings: Object.fromEntries(context.currentByRoot)
        },
        wrt: requestTargets.map((target) => target.root),
        arithmetic: { schema: "natlang.native-reference-arithmetic/1", query_chunk_tokens: 16 },
        ...order === 2 ? {} : { order: 1 }
      };
      const result = await nativeDerivativeProgramGradient(service.endpoint, service.store, program, service.headers);
      loss.value = Number(result.loss);
      gradientArtifacts = result.gradients;
      derivativeExecution = result.execution_id;
    } else {
      const result = await nativeRecordedGraphGradients(service.endpoint, service.store, {
        ...objective,
        nativeStateModes,
        targets: requestTargets,
        nativeIdentity: targetInfo.identity,
        headers: service.headers
      });
      loss.value = Number(result.loss);
      gradientArtifacts = result.gradients;
      const gradients2 = Object.fromEntries([...targetInfo.byId].map(([id, target]) => [id, result.gradients[target.root].id]));
      if (outer?.native) outer.nodes.push(registerNativeGradientDerivation(
        outer.native,
        targetInfo,
        objective,
        gradients2
      ));
    }
    const gradients = Object.fromEntries([...targetInfo.byId].map(([id, target]) => [id, gradientArtifacts[target.root].id]));
    await service.replayRecords?.record({
      arguments: Object.keys(gradients),
      terms: loss.terms,
      order: order ?? 1,
      native_turns: exactTurns,
      native_graph_nodes: events,
      native_gradients: gradients,
      native_targets: requestTargets,
      ...derivativeExecution ? { derivative_execution_id: derivativeExecution } : {},
      loss: loss.value
    });
    if (outer && !outer.native) outer.nodes.push({
      kind: "grad",
      arguments: Object.keys(gradients),
      terms: loss.terms,
      native_turns: exactTurns,
      native_graph_nodes: events,
      native_gradients: gradients
    });
    const grad = mapNativeLearningLeaves(a, (ref) => {
      if (isNativeAdapterRef(ref)) {
        const artifact2 = gradientArtifacts[targetInfo.byId.get(ref.$nativeAdapter.id).root];
        return artifact2 ? { $gradientBlock: { id: artifact2.id, of: ref.$nativeAdapter.id, type: "NativeAdapter" } } : null;
      }
      if (stopped.has(ref) || ref.$neuralese.stop_gradient) return null;
      const id = nativeLearningId(ref), target = targetInfo.byId.get(id), artifact = target && gradientArtifacts[target.root];
      return artifact ? { $gradientBlock: {
        id: artifact.id,
        of: id,
        type: "NativeState"
      } } : null;
    });
    return { loss, grad: { $gradient: grad } };
  }
  throw new LearningError("learning-native-target", "native gradient dispatch requires exact native target references");
}
function optimizer(service, name, hyper) {
  return {
    init: (a) => {
      void a;
      return { $optimizer: { name, hyper, state: null } };
    },
    async step(current, grad) {
      const nativeEntries = nativeLearningLeaves(current.value);
      if (nativeEntries.length) {
        const gradients = /* @__PURE__ */ new Map();
        const collect2 = (value2) => {
          if (value2 && typeof value2 === "object" && "$gradientBlock" in value2) {
            const entry = value2;
            gradients.set(entry.$gradientBlock.of, entry);
            return;
          }
          if (Array.isArray(value2)) value2.forEach(collect2);
          else if (value2 && typeof value2 === "object") Object.values(value2).forEach(collect2);
        };
        collect2(grad.$gradient);
        if (softLeaves(current.value).length || !service().store?.getNativeTensorArtifact)
          throw new LearningError("learning-native-target", "native optimization requires native roots and a named tensor archive");
        const active = service(), store = active.store;
        const betas = hyper.betas;
        const spec = {
          name,
          ...typeof hyper.lr === "number" ? { learning_rate: hyper.lr } : {},
          ...typeof hyper.weightDecay === "number" ? { weight_decay: hyper.weightDecay } : {},
          ...betas ? { beta1: betas[0], beta2: betas[1] } : {},
          ...typeof hyper.momentum === "number" ? { momentum: hyper.momentum } : {}
        };
        const histories = current.opt.$optimizer.state?.native_optimizer_state_ids ?? {};
        const updatedIds = /* @__PURE__ */ new Map(), nextHistories = {};
        let latestStep = 0;
        for (const ref of nativeEntries) {
          const oldId = nativeLearningId(ref);
          if (updatedIds.has(oldId)) continue;
          const entry = gradients.get(oldId);
          if (!entry) throw new LearningError("learning-gradient-shape", `native optimizer gradient is missing for ${oldId}`);
          const gradient = await store.getNativeTensorArtifact(entry.$gradientBlock.id);
          const expectedKind = isNativeAdapterRef(ref) ? "adapter-gradient" : "state-gradient";
          if (!gradient || gradient.metadata.kind !== expectedKind || gradient.metadata.source_artifact_id !== oldId)
            throw new LearningError("learning-native-target", `native optimizer needs an archived ${expectedKind} bound to ${oldId}`);
          const previousState = histories[oldId];
          let newId, optimizerStateId, step;
          if (isNativeAdapterRef(ref)) {
            const updated = await nativeAdapterOptimizerStep(active.endpoint, store, {
              gradient,
              nativeIdentity: gradient.metadata.native_identity,
              optimizer: spec,
              ...previousState ? { optimizerStateId: previousState } : {},
              headers: active.headers
            });
            newId = updated.adapter.id;
            optimizerStateId = updated.optimizer_state_id;
            step = updated.step;
          } else {
            const updated = await nativeStateOptimizerStep(active.endpoint, store, {
              gradient,
              nativeIdentity: gradient.metadata.native_identity,
              optimizer: spec,
              ...previousState ? { optimizerStateId: previousState } : {},
              headers: active.headers
            });
            newId = updated.native_state_id;
            optimizerStateId = updated.optimizer_state_id;
            step = updated.step;
          }
          updatedIds.set(oldId, newId);
          nextHistories[newId] = optimizerStateId;
          latestStep = Math.max(latestStep, step);
          const trace = derivations.getStore();
          if (trace?.native) {
            const value2 = trace.native.valueById.get(oldId), gradientName = trace.native.gradientById.get(gradient.id);
            const root = trace.native.rootById.get(oldId);
            if (!value2 || !gradientName || !root)
              throw new LearningError("learning-native-order2", `native optimizer cannot bind update ancestry for ${oldId}`);
            const node = `native-optim-node-${trace.native.next++}`;
            trace.nodes.push({
              kind: "optimizer",
              name: node,
              value: value2,
              gradient: gradientName,
              optimizer: {
                name,
                ...typeof hyper.lr === "number" ? { learning_rate: hyper.lr } : {},
                ...typeof hyper.weightDecay === "number" ? { weight_decay: hyper.weightDecay } : {},
                ...betas ? { beta1: betas[0], beta2: betas[1] } : {},
                ...typeof hyper.momentum === "number" ? { momentum: hyper.momentum } : {}
              },
              optimizer_state: previousState ?? null,
              // Later recorded turns import this step's own artifact; the program's recomputed update stands for it.
              recorded: newId
            });
            trace.native.valueById.set(newId, node);
            trace.native.rootById.set(newId, root);
            trace.native.currentByRoot.set(root, node);
          } else if (trace) {
            throw new LearningError("learning-native-order2", "native updates inside order-2 learning need native checkpoint roots");
          }
        }
        const value = mapNativeLearningLeaves(current.value, (ref) => {
          const next = updatedIds.get(nativeLearningId(ref));
          return next ? isNativeAdapterRef(ref) ? nativeAdapterRef(next) : neuraleseRef(ref.$neuralese.type, next) : ref;
        });
        const state = { native_optimizer_state_ids: nextHistories, step: latestStep };
        return { value, opt: { $optimizer: { name, hyper, state } } };
      }
      throw new LearningError("learning-native-target", "optimizers require archived native state or named coefficient targets");
    }
  };
}
function f32Values(value) {
  if (value.dtype !== "F32" || value.data.byteLength % 4) throw new LearningError("learning-native-delta", "native adapter deltas currently require FP32 coefficient tensors");
  return new Float32Array(value.data.buffer.slice(value.data.byteOffset, value.data.byteOffset + value.data.byteLength));
}
function f32Bytes(values) {
  return new Uint8Array(values.buffer.slice(values.byteOffset, values.byteOffset + values.byteLength));
}
async function nativeAdapterArtifacts(active, refs) {
  const store = active.store;
  if (!store?.getNativeTensorArtifact || !store.putNativeTensorArtifact)
    throw new LearningError("learning-native-archive-unavailable", "native coefficient deltas require an archived tensor store");
  const artifacts = await Promise.all(refs.map((ref) => store.getNativeTensorArtifact(ref.$nativeAdapter.id)));
  if (artifacts.some((artifact) => !artifact || artifact.metadata.kind !== "adapter-coefficients"))
    throw new LearningError("learning-native-delta", "native deltas require named adapter coefficient artifacts");
  const valid = artifacts;
  const first = valid[0];
  if (valid.some((artifact) => artifact.metadata.source_artifact_id !== first.metadata.source_artifact_id || !nativeModelIdentityEqual(artifact.metadata.native_identity, first.metadata.native_identity) || JSON.stringify(artifact.metadata.tensors) !== JSON.stringify(first.metadata.tensors)))
    throw new LearningError("learning-native-delta", "native coefficient deltas need the same exact checkpoint, basis and named tensor geometry");
  return valid;
}
async function nativeAdapterArithmetic(active, refs, operation) {
  if (!refs.length || refs.some((item) => !Number.isFinite(item.scale)))
    throw new LearningError("learning-native-delta", "native delta arithmetic needs finite scales and at least one coefficient artifact");
  const artifacts = await nativeAdapterArtifacts(active, refs.map((item) => item.ref));
  const first = artifacts[0];
  const tensors = {};
  for (const name of Object.keys(first.tensors).sort()) {
    const values = new Float32Array(first.tensors[name].shape.reduce((count, size) => count * size, 1));
    artifacts.forEach((artifact, index) => {
      const part = f32Values(artifact.tensors[name]);
      for (let at = 0; at < values.length; at++) values[at] += refs[index].scale * part[at];
    });
    tensors[name] = { dtype: "F32", shape: [...first.tensors[name].shape], data: f32Bytes(values) };
  }
  const provenance = { ...first.metadata.provenance, native_delta_operation: operation };
  const result = await active.store.putNativeTensorArtifact({ metadata: { ...first.metadata, provenance }, tensors });
  return nativeAdapterRef(result.id);
}
async function evaluateRecordedNative(service, f, target, nativeIdentity, options = {}) {
  if (!service.store) throw new LearningError("learning-native-state-store", "native recorded learning requires an archived artifact store");
  const rec = new Recorder();
  const loss = await recording.run(rec, () => boundService.run(service, f));
  if (!(loss instanceof Loss)) throw new LearningError("learning-not-a-loss", "native graph learning must return a Loss from objectives");
  if (!loss.terms.length) return { loss: Object.assign(loss, { value: 0 }), gradient: null };
  const nativeTurns = rec.nativeTurns();
  assertNativeLearningActor(rec, [...rec.turns, ...rec.nested], nativeIdentity);
  const byId = new Map(nativeTurns.map((turn) => [turn.native.id, turn.native]));
  const turns = [...rec.turns, ...rec.nested].filter((turn) => turn.native).map((turn) => ({ ...structuredClone(turn), native: byId.get(turn.native.id) }));
  if (!turns.length) throw new LearningError("learning-no-turns", "native graph objective made no recorded native model turns");
  if (loss.terms.some((term) => typeof term.native_turn_id !== "string"))
    throw new LearningError("learning-native-objective", "native graph objectives must score exact recorded native turns");
  const result = await nativeRecordedGraphGradient(service.endpoint, service.store, {
    turns,
    events: structuredClone([...rec.graphNodes.values()]),
    terms: loss.terms,
    target,
    nativeIdentity,
    nativeStateModes: options.nativeStateModes,
    headers: service.headers
  });
  loss.value = Number(result.loss);
  await service.replayRecords?.record({
    arguments: [],
    terms: loss.terms,
    order: 1,
    native_turns: turns,
    native_graph_nodes: [...rec.graphNodes.values()],
    target,
    native_gradient: result.gradient.id,
    loss: loss.value
  });
  return { loss, gradient: result.gradient, stats: result.stats, objective: result.objective };
}
function createLearning(explicit, options = {}) {
  const service = (where = "natlang:learning") => activeService(where, explicit);
  const bound = options.library ? { ...objectives, law: (name, ...args) => lawLoss(options.library, name, args) } : objectives;
  return {
    grad: async (f, a, options2 = {}) => (await evaluate(service("grad"), f, a, options2.order)).grad,
    valueAndGrad: async (f, a, options2 = {}) => evaluate(service("valueAndGrad"), f, a, options2.order),
    stopGradient,
    objectives: bound,
    withNativeAdapters: (adapters, fn) => boundService.run(service("withNativeAdapters"), () => withNativeAdapters(adapters, fn)),
    withNativeStates,
    withSystemPrompts,
    /** Native positional state learning. Updates return a new state artifact with immutable optimizer ancestry. */
    nativeStates: {
      gradient: async (graph, id, nativeIdentity, options2 = {}) => {
        const current = service("nativeStates.gradient");
        if (!current.store) throw new LearningError("learning-native-state-store", "native state learning requires an archived state store");
        return nativeGraphGradient(current.endpoint, current.store, {
          graph,
          target: { kind: "native-state", id },
          nativeIdentity,
          nativeStateModes: options2.nativeStateModes,
          objective: options2.objective,
          headers: current.headers
        });
      },
      optimize: async (gradient, nativeIdentity, optimizer2, optimizerStateId) => {
        const current = service("nativeStates.optimize");
        if (!current.store) throw new LearningError("learning-native-state-store", "native state learning requires an archived state store");
        return nativeStateOptimizerStep(current.endpoint, current.store, {
          gradient,
          nativeIdentity,
          optimizer: optimizer2,
          optimizerStateId,
          headers: current.headers
        });
      }
    },
    /** Native gradients through the exact recorded model and producer/consumer execution graph. */
    nativeGraph: {
      gradient: (f, target, nativeIdentity, options2 = {}) => evaluateRecordedNative(service("nativeGraph.gradient"), f, target, nativeIdentity, options2)
    },
    /** Explicit constructors and optimizer updates for exact-base named native coefficient artifacts. */
    nativeAdapters: {
      create: async (nativeIdentity, options2) => {
        const active = service("nativeAdapters.create");
        if (!active.store) throw new LearningError("learning-native-state-store", "native adapter creation requires an archived tensor store");
        const artifact = await nativeAdapterCreate(active.endpoint, active.store, { nativeIdentity, ...options2, headers: active.headers });
        return nativeAdapterRef(artifact.id);
      },
      ref: (id) => nativeAdapterRef(id),
      optimize: async (gradient, nativeIdentity, optimizer2, optimizerStateId) => {
        const active = service("nativeAdapters.optimize");
        if (!active.store) throw new LearningError("learning-native-state-store", "native adapter updates require an archived tensor store");
        return nativeAdapterOptimizerStep(active.endpoint, active.store, {
          gradient,
          nativeIdentity,
          optimizer: optimizer2,
          optimizerStateId,
          headers: active.headers
        });
      }
    },
    /** Named native coefficient deltas plus ordinary file patches. */
    deltas: {
      diff: async (after, base) => nativeAdapterArithmetic(service("deltas.diff"), [{ ref: after, scale: 1 }, { ref: base, scale: -1 }], "diff"),
      apply: async (base, delta, scale = 1) => nativeAdapterArithmetic(service("deltas.apply"), [{ ref: base, scale: 1 }, { ref: delta, scale }], "apply"),
      compose: async (deltas) => {
        if (!deltas.length) throw new LearningError("learning-native-delta", "compose needs at least one native adapter delta");
        const items = deltas.map((item) => isNativeAdapterRef(item) ? { ref: item, scale: 1 } : { ref: item.delta, scale: item.scale ?? 1 });
        if (items.some((item) => !isNativeAdapterRef(item.ref)))
          throw new LearningError("learning-native-delta", "coefficient composition accepts only exact nnt1 artifacts");
        return nativeAdapterArithmetic(service("deltas.compose"), items, "compose");
      },
      diffFiles,
      applyPatch,
      composePatches,
      /**
       * Interference of deltas trained separately from one base: each delta's gain alone, the gain of their sum, and
       * Σ gains alone − gain of the sum (positive: the updates get in each other's way). `measure` is a loss (lower
       * is better) of a value, e.g. a held-out evaluation.
       */
      async interference(base, deltas, measure2) {
        if (!isNativeAdapterRef(base) || deltas.some((delta) => !isNativeAdapterRef(delta)))
          throw new LearningError("learning-native-delta", "interference requires named native coefficient artifacts");
        const active = service("deltas.interference");
        const reference = await measure2(base);
        const alone = [];
        for (const delta of deltas) alone.push(reference - await measure2(await nativeAdapterArithmetic(
          active,
          [{ ref: base, scale: 1 }, { ref: delta, scale: 1 }],
          "interference-alone"
        )));
        const jointValue = await nativeAdapterArithmetic(active, [{ ref: base, scale: 1 }, ...deltas.map((ref) => ({ ref, scale: 1 }))], "interference-joint");
        const joint = reference - await measure2(jointValue);
        return { base: reference, alone, joint, interference: alone.reduce((sum, gain) => sum + gain, 0) - joint };
      },
      /**
       * Learned merge coefficients (LoRAHub-style, first order): `base + Σ cᵢ·deltaᵢ` with the cᵢ trained by Adam on
       * `loss`. The merge is linear, so ∂L/∂cᵢ = ⟨∇L(merged), deltaᵢ⟩: one gradient session per step.
       */
      async learnMerge(base, deltas, loss, options2 = {}) {
        if (!isNativeAdapterRef(base) || deltas.some((delta) => !isNativeAdapterRef(delta)))
          throw new LearningError("learning-native-delta", "learnMerge requires named native coefficient artifacts");
        if (!deltas.length) throw new LearningError("learning-native-delta", "learnMerge needs at least one native adapter delta");
        const active = service("deltas.learnMerge");
        const parts = await nativeAdapterArtifacts(active, deltas);
        const c = deltas.map((_, i) => Array.isArray(options2.init) ? options2.init[i] ?? 1 : options2.init ?? 1);
        const m = c.map(() => 0), v = c.map(() => 0), lr = options2.lr ?? 0.1, trace = [];
        const merge = async () => nativeAdapterArithmetic(active, [{ ref: base, scale: 1 }, ...deltas.map((ref, i) => ({ ref, scale: c[i] }))], "learn-merge");
        for (let step = 1; step <= (options2.steps ?? 8); step++) {
          const merged = await merge();
          const result = await evaluate(active, (value) => withNativeAdapters(value, () => loss(value)), merged);
          trace.push({ loss: +result.loss, coefficients: [...c] });
          const entry = result.grad.$gradient;
          if (!entry) break;
          const gradient = await active.store?.getNativeTensorArtifact?.(entry.$gradientBlock.id);
          if (!gradient || gradient.metadata.kind !== "adapter-gradient" || gradient.metadata.source_artifact_id !== merged.$nativeAdapter.id)
            throw new LearningError("learning-native-delta", "learnMerge needs the actual named coefficient gradient for its merged actor");
          parts.forEach((part, i) => {
            let dot = 0;
            for (const [name, tensor] of Object.entries(part.tensors)) {
              const g = f32Values(gradient.tensors[name]);
              const d = f32Values(tensor);
              for (let k = 0; k < d.length; k++) dot += g[k] * d[k];
            }
            m[i] = 0.9 * m[i] + 0.1 * dot;
            v[i] = 0.999 * v[i] + 1e-3 * dot * dot;
            c[i] -= lr * (m[i] / (1 - 0.9 ** step)) / (Math.sqrt(v[i] / (1 - 0.999 ** step)) + 1e-8);
          });
        }
        return { coefficients: [...c], value: await merge(), trace };
      }
    },
    /** Record the model turns of one execution as a trajectory (inside grad). */
    async trajectory(run) {
      const rec = recorder("trajectory");
      const failure = await settle(run);
      const claimed = rec.claim();
      const native = new Map(rec.nativeTurns().map((turn) => [turn.native.id, turn]));
      const turns = claimed.map((turn) => turn.native ? native.get(turn.native.id) ?? turn : turn);
      if (failure !== void 0 && !turns.length)
        throw new LearningError(
          "learning-trajectory-failed",
          `trajectory produced no recorded turns before failing: ${failureNote(failure).replace(/^; the output failed: /, "")}`
        );
      return { id: `trajectory-${++trajectories}`, turns, ...failure === void 0 ? {} : {
        failure: {
          ...failure instanceof Error ? {
            name: failure.name,
            ..."code" in failure && typeof failure.code === "string" ? { code: failure.code } : {}
          } : {},
          message: failure instanceof Error ? failure.message : String(failure)
        }
      } };
    },
    optimizers: {
      sgd: (options2) => optimizer(() => service("optimizers.sgd"), "sgd", options2),
      adam: (options2) => optimizer(() => service("optimizers.adam"), "adam", options2)
    },
    /** Save archived native states and named coefficient artifacts to a `.nz` bundle. */
    async save(path, exports) {
      const active = service("save");
      const remote = new HttpNeuraleseStore(active.endpoint, active.headers);
      if (!active.store) throw new LearningError("neuralese-native-archive-unavailable", "save requires a runtime artifact store");
      const entries = {};
      for (const [name, value] of Object.entries(exports)) {
        if (value && typeof value === "object" && "type" in value && "value" in value) entries[name] = value;
        else if (isNativeAdapterRef(value)) entries[name] = { type: "NativeAdapter", value };
        else if (isNeuraleseRef(value)) entries[name] = { type: value.$neuralese.type, value };
        else throw new LearningError("learning-save-type", `export ${name} needs a declared type ({ type, value })`);
      }
      const visit = async (value) => {
        if (isNeuraleseRef(value) || isNativeAdapterRef(value)) {
          const id = isNativeAdapterRef(value) ? value.$nativeAdapter.id : value.$neuralese.id;
          await archiveNativeArtifactFrom(remote, active.store, id);
        } else if (Array.isArray(value)) await Promise.all(value.map(visit));
        else if (isPlainObject(value))
          await Promise.all(Object.values(value).map(visit));
      };
      for (const entry of Object.values(entries)) await visit(entry.value);
      writeFileSync2(path, await saveNz(entries, { store: active.store, dialect: active.dialect ?? "native-state/unknown" }));
      return { path, exports: Object.keys(entries) };
    },
    /** Load a native `.nz` bundle into this task's typed artifact archive. */
    async load(path) {
      const active = service("load");
      if (!active.store) throw new LearningError("neuralese-native-archive-unavailable", "load requires a runtime artifact store");
      const loaded = await loadNz(new Uint8Array(readFileSync2(path)));
      await importNativeArtifactBundle(active.store, loaded.nativeStates, loaded.nativeTensors);
      return { path, header: loaded.header, exports: loaded.exports, types: loaded.types };
    }
  };
}
var learningModule = { __esModule: true, ...createLearning() };

// src/native/python-folderfs.ts
function folderFS(py, view, { mtime = Date.UTC(2026, 0, 1) } = {}) {
  const FS = py.FS, MEMFS = FS.filesystems.MEMFS, ERRNO = py._module.ERRNO_CODES;
  const fail2 = (code) => {
    throw new FS.ErrnoError(ERRNO[code]);
  };
  const emptyDirs = /* @__PURE__ */ new Set();
  let seen = view.revision(), root;
  const pathOf = (node) => {
    const parts = [];
    for (let n = node; n.parent !== n; n = n.parent) parts.unshift(n.name);
    return parts.join("/");
  };
  const join6 = (parent, name) => {
    const base = pathOf(parent);
    return base ? `${base}/${name}` : name;
  };
  const refresh = () => {
    const now2 = view.revision();
    if (now2 === seen) return;
    seen = now2;
    const drop = (dir) => {
      for (const [name, child] of Object.entries(dir.contents)) {
        if (FS.isDir(child.mode)) drop(child);
        if (!child.dirty) {
          FS.destroyNode(child);
          delete dir.contents[name];
        }
      }
    };
    drop(root);
  };
  const write = (path, bytes) => {
    const mine = view.revision() === seen;
    view.write(path, bytes);
    if (mine) seen = view.revision();
  };
  const fileNode = (parent, name, contents) => {
    const node = MEMFS.createNode(parent, name, 33188, 0);
    node.loaded = !!contents;
    node.contents = contents ?? null;
    node.usedBytes = contents ? contents.length : -1;
    node.revision = view.revision();
    node.stream_ops = fileStreamOps;
    node.node_ops = { ...MEMFS.ops_table.file.node, getattr, setattr: fileSetattr };
    return node;
  };
  const dirNode = (parent, name, mode = 16877) => {
    const node = MEMFS.createNode(parent, name, mode, 0);
    node.node_ops = dirOps;
    return node;
  };
  const load2 = (node) => {
    if (node.loaded && (node.dirty || node.revision === view.revision())) return;
    const bytes = view.read(pathOf(node));
    node.contents = bytes;
    node.usedBytes = bytes.length;
    node.loaded = true;
    node.revision = view.revision();
  };
  const flush = (node) => {
    if (!node.dirty) return;
    const data = node.contents ? node.contents.subarray(0, node.usedBytes) : new Uint8Array();
    write(pathOf(node), new Uint8Array(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)));
    node.dirty = false;
  };
  function getattr(node) {
    if (FS.isFile(node.mode) && !node.loaded && node.usedBytes < 0) node.usedBytes = view.size(pathOf(node));
    const attr = MEMFS.ops_table.file.node.getattr(node);
    attr.atime = attr.mtime = attr.ctime = new Date(mtime);
    return attr;
  }
  function fileSetattr(node, attr) {
    if (attr.size !== void 0) {
      load2(node);
      node.dirty = true;
    }
    return MEMFS.ops_table.file.node.setattr(node, attr);
  }
  const memStream = MEMFS.ops_table.file.stream;
  const fileStreamOps = {
    ...memStream,
    open(stream) {
      load2(stream.node);
    },
    write(stream, ...rest) {
      stream.node.dirty = true;
      return memStream.write(stream, ...rest);
    },
    msync(stream, ...rest) {
      const out = memStream.msync(stream, ...rest);
      flush(stream.node);
      return out;
    },
    close(stream) {
      flush(stream.node);
    }
  };
  const dirOps = {
    ...MEMFS.ops_table.dir.node,
    getattr,
    lookup(parent, name) {
      if (parent.contents[name]) return parent.contents[name];
      const path = join6(parent, name), kind2 = view.kind(path);
      if (kind2 === "file") return fileNode(parent, name);
      if (kind2 === "dir" || emptyDirs.has(path)) return dirNode(parent, name);
      fail2("ENOENT");
    },
    readdir(node) {
      const base = pathOf(node), prefix = base ? `${base}/` : "";
      const names = /* @__PURE__ */ new Set([...Object.keys(node.contents), ...view.entries(base)]);
      for (const dir of emptyDirs) if (dir.startsWith(prefix) && !dir.slice(prefix.length).includes("/")) names.add(dir.slice(prefix.length));
      return [".", "..", ...[...names].sort()];
    },
    mknod(parent, name, mode) {
      const path = join6(parent, name);
      if (FS.isDir(mode)) {
        emptyDirs.add(path);
        return dirNode(parent, name, mode);
      }
      write(path, new Uint8Array());
      return fileNode(parent, name, new Uint8Array());
    },
    rename(oldNode, newDir, newName) {
      const from = pathOf(oldNode), to = join6(newDir, newName);
      if (FS.isFile(oldNode.mode)) flush(oldNode);
      if (view.kind(to) === "file") view.remove(to);
      if (FS.isDir(oldNode.mode) && emptyDirs.has(from) && view.kind(from) !== "dir") {
        emptyDirs.delete(from);
        emptyDirs.add(to);
      } else view.move(from, to);
      seen = view.revision();
      delete oldNode.parent.contents[oldNode.name];
      oldNode.name = newName;
      oldNode.parent = newDir;
      newDir.contents[newName] = oldNode;
    },
    unlink(parent, name) {
      view.remove(join6(parent, name));
      seen = view.revision();
      delete parent.contents[name];
    },
    rmdir(parent, name) {
      const path = join6(parent, name);
      if (view.entries(path).length) fail2("ENOTEMPTY");
      emptyDirs.delete(path);
      delete parent.contents[name];
    },
    symlink() {
      fail2("EPERM");
    }
  };
  return { mount() {
    root = dirNode(null, "/");
    return root;
  }, refresh };
}
function folderView(folder) {
  return {
    revision: () => folder.revision(),
    kind: (path) => folder.kind(path),
    entries: (dir) => folder.childNames(dir),
    size: (path) => folder.size(path),
    read: (path) => folder.readBytesSync(path),
    write: (path, bytes) => folder.writeBytes(path, bytes),
    remove: (path) => folder.remove(path),
    move: (from, to) => folder.move(from, to)
  };
}

// src/native/python-sources.ts
var PYTHON_POLICY = "\"\"\"Spike: natlang's code policy for Python. Source is checked and lowered before it runs:\n- no `while`, no function that calls itself (directly or through another in the same module);\n- no exec/eval/compile/__import__/importlib, and no modules that reach the host or load code around the policy;\n- every `for` and comprehension iterates through __natlang_finite: concrete collections pass, anything else is taken\n  up to a cap and raises beyond it;\n- endless itertools iterators and iter(callable, sentinel) are Python generators, so the timeout can stop C code that\n  drains them.\nLocal modules imported from the folder get the same treatment through an import hook.\"\"\"\nimport ast, builtins, importlib.abc, importlib.util, itertools, sys\n\nCAP = 100_000\nFORBIDDEN_CALLS = {'exec', 'eval', 'compile', '__import__', 'breakpoint'}\n# Modules that reach the host or load code around the policy. Network is not among the reasons: it follows the\n# runtime's network setting, as fetch in eval does.\nFORBIDDEN_MODULES = {'js', 'pyodide_js', 'pyodide.ffi', 'micropip', 'importlib', 'ctypes'}\nCONCRETE = (list, tuple, str, bytes, bytearray, dict, set, frozenset, range, type({}.keys()), type({}.values()), type({}.items()))\n\nclass PolicyError(SyntaxError): pass\n\ndef finite(iterable):\n    if isinstance(iterable, CONCRETE) or type(iterable).__module__.split('.')[0] in ('numpy', 'pandas'):\n        return iterable\n    items = list(itertools.islice(iterable, CAP + 1))\n    if len(items) > CAP:\n        raise RuntimeError(f'this loop would take more than {CAP} items from a {type(iterable).__name__}; '\n                           'repeat an open-ended process with iterate_on(step, initial).until(done)')\n    return items\n\ndef check(tree, filename):\n    problems = []\n    report = (lambda node, message: problems.append(f'{filename}:{node.lineno}: {message}'))\n    calls = {}                                  # function name -> names it calls\n    class Visitor(ast.NodeVisitor):\n        def __init__(self): self.function = []\n        def visit_While(self, node): report(node, '`while` loops are not allowed; use `for` over a collection, or iterate_on(step, initial).until(done) for an open-ended process')\n        def visit_FunctionDef(self, node):\n            self.function.append(node.name); calls.setdefault(node.name, set()); self.generic_visit(node); self.function.pop()\n        visit_AsyncFunctionDef = visit_FunctionDef\n        def visit_Call(self, node):\n            if isinstance(node.func, ast.Name):\n                if node.func.id in FORBIDDEN_CALLS: report(node, f'`{node.func.id}` is not allowed')\n                if self.function: calls[self.function[-1]].add(node.func.id)\n            self.generic_visit(node)\n        def visit_Import(self, node):\n            for alias in node.names: self.module(node, alias.name)\n        def visit_ImportFrom(self, node): self.module(node, node.module or '')\n        def module(self, node, name):\n            if any(name == m or name.startswith(m + '.') for m in FORBIDDEN_MODULES): report(node, f'module `{name}` is not available')\n    Visitor().visit(tree)\n    # Recursion: a cycle in the call graph among this module's functions.\n    def reaches(start, target, seen):\n        return any(callee == target or (callee in calls and callee not in seen and reaches(callee, target, seen | {callee})) for callee in calls.get(start, ()))\n    for name in calls:\n        if reaches(name, name, {name}):\n            problems.append(f'{filename}: `{name}` calls itself; recursion is not allowed, use a loop over a work list')\n    if problems: raise PolicyError('\\n'.join(problems))\n\nclass Lower(ast.NodeTransformer):\n    def wrap(self, node): return ast.Call(ast.Name('__natlang_finite', ast.Load()), [node], [])\n    def visit_For(self, node): self.generic_visit(node); node.iter = self.wrap(node.iter); return node\n    visit_AsyncFor = visit_For\n    def visit_comprehension(self, node): self.generic_visit(node); node.iter = self.wrap(node.iter); return node\n\ndef prepare(source, filename='<cell>'):\n    tree = ast.parse(source, filename)\n    check(tree, filename)\n    return ast.fix_missing_locations(Lower().visit(tree))\n\nclass LocalModules(importlib.abc.MetaPathFinder, importlib.abc.Loader):\n    \"\"\"Modules found under the working folder are checked and lowered like cells.\"\"\"\n    def __init__(self, root): self.root = root\n    def find_spec(self, name, path, target=None):\n        import os\n        candidate = os.path.join(self.root, *name.split('.')) + '.py'\n        return importlib.util.spec_from_file_location(name, candidate, loader=self) if os.path.exists(candidate) else None\n    def create_module(self, spec): return None\n    def exec_module(self, module):\n        module.__dict__.update(__builtins__=USER_BUILTINS, __natlang_finite=finite)\n        _exec(_compile(prepare(open(module.__spec__.origin).read(), module.__spec__.origin), module.__spec__.origin, 'exec'), module.__dict__)\n\n# The policy binds user code only: library code (the standard library, pandas) keeps the real builtins, which it uses\n# (dataclasses runs exec, for one), and Pyodide's own modules stay importable for the libraries that need them.\n_exec, _compile = builtins.exec, builtins.compile\n\n# Endless iterators written in C can be drained by C code without running a line of Python (sum(itertools.count()),\n# any(itertools.repeat(0))), so the timeout's interrupt, which Python checks between instructions, never arrives and\n# the interpreter hangs. User code gets the same iterators as Python generators, which the timeout stops.\ndef _count(start=0, step=1):\n    while True:\n        yield start\n        start += step\n\ndef _cycle(iterable):\n    saved = []\n    for item in iterable:\n        yield item\n        saved.append(item)\n    while saved:\n        for item in saved: yield item\n\ndef _repeat(object, times=None):\n    if times is not None: return itertools.repeat(object, times)\n    return _forever(object)\n\ndef _forever(item):\n    while True: yield item\n\ndef _until(call, sentinel):\n    while True:\n        value = call()\n        if value == sentinel: return\n        yield value\n\ndef _iter(source, *sentinel):\n    if not sentinel: return builtins.iter(source)\n    if not callable(source): raise TypeError('iter(v, w): v must be callable')\n    return _until(source, *sentinel)\n\nUSER_ITERTOOLS = type(itertools)('itertools', itertools.__doc__)\nUSER_ITERTOOLS.__dict__.update({name: value for name, value in itertools.__dict__.items() if not name.startswith('__')},\n                               count=_count, cycle=_cycle, repeat=_repeat)\n\ndef _import(name, globals=None, locals=None, fromlist=(), level=0):\n    module = builtins.__import__(name, globals, locals, fromlist, level)\n    return USER_ITERTOOLS if module is itertools else module\n\nUSER_BUILTINS = {name: value for name, value in builtins.__dict__.items() if name not in FORBIDDEN_CALLS - {'__import__'}}\nUSER_BUILTINS.update(__import__=_import, iter=_iter)\n\ndef fresh_namespace():\n    return {'__builtins__': USER_BUILTINS, '__natlang_finite': finite}\n\ndef install(root):\n    sys.meta_path.insert(0, LocalModules(root))\n\ndef run_cell(source, namespace):\n    _exec(_compile(prepare(source), '<cell>', 'exec'), namespace)\n";
var PYTHON_NATLANG = `"""Spike: the natlang module for Python. nl, iterate_on and reducers are the host's (the same objects eval uses); this
module gives them Python's shapes: nl[T] types a call, a Python type becomes the host's type text, and wait() runs one
in synchronous code (a pandas apply) through Pyodide's JSPI."""
import dataclasses, types, typing
from pyodide.ffi import create_proxy, run_sync
import _natlang_host as host

def type_text(t) -> str:
    """A Python annotation as natlang type text."""
    origin, args = typing.get_origin(t), typing.get_args(t)
    if t is bool: return 'boolean'
    if t in (int, float): return 'number'
    if t is str: return 'string'
    if t is type(None): return 'null'
    if t is typing.Any or t is None: return 'unknown'
    if origin is typing.Literal: return ' | '.join(repr(a).replace("'", '"') for a in args)
    if origin in (typing.Union, types.UnionType): return ' | '.join(type_text(a) for a in args)
    if origin in (list, tuple): return f'{type_text(args[0]) if args else "unknown"}[]'
    if origin is dict: return f'Record<string, {type_text(args[1])}>'
    if dataclasses.is_dataclass(t) or typing.is_typeddict(t):
        hints = typing.get_type_hints(t)
        return '{ ' + ', '.join(f'{k}: {type_text(v)}' for k, v in hints.items()) + ' }'
    raise TypeError(f'{t!r} has no natlang type')

class _Nl:
    """nl("instructions") is an open-result function; nl[T]("instructions") returns T."""
    def __init__(self, returns='unknown'): self.returns = returns
    def __getitem__(self, t): return _Nl(type_text(t))
    def __call__(self, instructions):
        return host.nl(instructions, self.returns)

nl = _Nl()

def wait(awaitable):
    """Run an nl call (or any awaitable) from synchronous code, such as a function pandas applies."""
    return run_sync(awaitable)

class _Iteration:
    """The host's iterateOn with a Python step: its progress reviews, limits and trace are the same as in eval. The
    step and the stopping check are lent to the host for the whole run (a plain Python callable passed to JavaScript
    lives only for the duration of the call), and released when it ends."""
    def __init__(self, step, initial, fixed): self.step, self.initial, self.fixed = step, initial, fixed
    async def until(self, done):
        step, check = create_proxy(self.step), create_proxy(done)
        try: return await host.iterate_on(step, self.initial, *self.fixed).until(check)
        finally: step.destroy(); check.destroy()

def iterate_on(step, initial, *fixed): return _Iteration(step, initial, fixed)
`;

// src/native/folder-changes.ts
var folderContents = (folder) => new Map(folder.diffSync().changes.map((change) => [change.path, change.after]));
function pathsChangedSince(folder, before) {
  const changedPaths = [], removedPaths = [];
  for (const change of folder.diffSync().changes) {
    const prior = before.get(change.path), after = change.after;
    if (before.has(change.path) && prior?.length === after?.length && !prior?.some((byte, i) => byte !== after?.[i])) continue;
    (after === void 0 ? removedPaths : changedPaths).push(change.path);
  }
  return { changedPaths, ...removedPaths.length ? { removedPaths } : {} };
}

// src/native/folder-python.ts
var RUNNER = `
import ast as __ast, builtins as __builtins, inspect as __inspect
from natlang_policy import prepare as __prepare
async def __natlang_run(source, namespace):
    tree = __prepare(source)
    if tree.body and isinstance(tree.body[-1], __ast.Expr):
        last = tree.body[-1]
        tree.body[-1] = __ast.Assign(targets=[__ast.Name(id='__natlang_result__', ctx=__ast.Store())], value=last.value)
        __ast.fix_missing_locations(tree)
    code = __builtins.compile(tree, '<cell>', 'exec', flags=__ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
    try:
        answer = __builtins.eval(code, namespace)
        if __inspect.isawaitable(answer): await answer
    except KeyboardInterrupt:
        return {'__natlang_timeout__': True}
    return namespace.pop('__natlang_result__', None)
`;
var singleton;
var currentHost;
var currentRefresh;
var awaitingChild = false;
var tail = Promise.resolve();
var growthCap;
var capped = false;
var wasm;
function boundMemoryGrowth(py) {
  const memory = py._module?.wasmMemory ?? py._module?.memory;
  if (!memory || typeof memory.grow !== "function") throw new Error("Pyodide exposes no WASM memory to bound");
  wasm = memory;
  const grow = WebAssembly.Memory.prototype.grow;
  Object.defineProperty(memory, "grow", { configurable: true, value: (pages) => {
    if (growthCap !== void 0 && memory.buffer.byteLength + pages * 65536 > growthCap) {
      capped = true;
      throw new RangeError("natlang: the cell reached its memory limit");
    }
    return grow.call(memory, pages);
  } });
}
function fromPython(value) {
  if (value && typeof value.toJs === "function") return fromPython(value.toJs({ dict_converter: Object.fromEntries }));
  if (typeof value === "bigint") return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const items = Array.from(value, fromPython);
    return items.length === 1 ? items[0] : items;
  }
  if (Array.isArray(value)) return value.map(fromPython);
  if (value instanceof Map) return Object.fromEntries([...value].map(([key, item]) => [String(key), fromPython(item)]));
  if (isPlainObject(value))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fromPython(item)]));
  return value;
}
async function interpreter() {
  singleton ??= (async () => {
    const { loadPyodide } = await import("pyodide");
    const node = typeof process !== "undefined" && Boolean(process.versions?.node);
    const localAssets = node ? new URL("../../vendor/pyodide/", import.meta.url).href : new URL("../pyodide/", import.meta.url).href;
    const py = await loadPyodide(node ? {
      packageBaseUrl: localAssets,
      packageCacheDir: decodeURIComponent(new URL(localAssets).pathname)
    } : { indexURL: localAssets, packageBaseUrl: localAssets });
    py.FS.writeFile("/lib/python3.14/site-packages/natlang_policy.py", PYTHON_POLICY);
    py.FS.writeFile("/lib/python3.14/site-packages/natlang.py", PYTHON_NATLANG);
    py.registerJsModule("_natlang_host", {
      nl: (instructions, returns) => {
        if (!currentHost?.nl) throw new Error("nl is unavailable outside a natlang Python call");
        return async (...args) => {
          awaitingChild = true;
          try {
            return await currentHost.nl(instructions, returns)(...args.map(fromPython));
          } finally {
            awaitingChild = false;
            currentRefresh?.();
          }
        };
      },
      iterate_on: (step, initial, ...fixed) => {
        if (!currentHost?.iterateOn) throw new Error("iterate_on is unavailable outside a natlang Python call");
        return currentHost.iterateOn(step, fromPython(initial), ...fixed.map(fromPython));
      }
    });
    py.runPython(RUNNER);
    boundMemoryGrowth(py);
    return py;
  })();
  return singleton;
}
async function runFolderPython(folder, source, host = {}, timeoutMs = 3e4, cwd = "") {
  if (awaitingChild) throw new Error("a Python child cannot reenter the shared interpreter while its parent awaits nl");
  const previous = tail;
  let unlock;
  tail = new Promise((resolve7) => {
    unlock = resolve7;
  });
  await previous;
  let py;
  const before = folderContents(folder);
  const mount = "/workspace";
  const stdout = [], stderr = [];
  const sink = (parts) => {
    const decoder2 = new TextDecoder();
    return { write: (bytes) => {
      parts.push(decoder2.decode(bytes, { stream: true }));
      return bytes.length;
    } };
  };
  const collected = (parts) => parts.join("").replace(/\n$/, "");
  let watchdog;
  try {
    py = await interpreter();
    py.setStdout(sink(stdout));
    py.setStderr(sink(stderr));
    currentHost = host;
    await py.loadPackagesFromImports(source, { messageCallback: () => {
    } });
    const adapter = folderFS(py, folderView(folder));
    currentRefresh = adapter.refresh;
    try {
      py.FS.rmdir(mount);
    } catch {
    }
    py.FS.mkdir(mount);
    py.FS.mount(adapter, {}, mount);
    const start = `${mount}/${cwd.replace(/^\/workspace(?:\/|$)/, "").replace(/^\/+|\/+$/g, "")}`.replace(/\/$/, "");
    try {
      py.FS.chdir(start);
    } catch {
      py.FS.chdir(mount);
    }
    const namespace = py.runPython("import natlang_policy; natlang_policy.fresh_namespace()");
    namespace.set("__natlang_source", source);
    namespace.set("__natlang_run", py.globals.get("__natlang_run"));
    if (typeof SharedArrayBuffer !== "undefined") {
      const buffer = new SharedArrayBuffer(4);
      py.setInterruptBuffer(new Int32Array(buffer));
      watchdog = host.watchdog?.(buffer, timeoutMs);
    }
    let value;
    const limitMb = evalMemoryLimitMb();
    capped = false;
    growthCap = limitMb ? wasm.buffer.byteLength + limitMb * 1024 * 1024 : void 0;
    try {
      try {
        value = await py.runPythonAsync("await __natlang_run(__natlang_source, globals())", { globals: namespace });
      } finally {
        py.runPython("import sys\nsys.stdout.flush()\nsys.stderr.flush()");
      }
      const openWriter = py.FS.streams.find((stream) => stream?.path?.startsWith(`${mount}/`) && (stream.flags & 3) !== 0);
      if (openWriter) throw new Error(`close the Python file or sqlite connection before leaving the cell: ${openWriter.path}`);
    } catch (error) {
      if (String(error).includes("KeyboardInterrupt")) throw new Error(`Python timed out after ${timeoutMs} ms`);
      if (capped) throw new Error(memoryLimitMessage("python", "python run", limitMb));
      throw error;
    } finally {
      growthCap = void 0;
      namespace.destroy();
    }
    const converted = fromPython(value);
    if (converted && typeof converted === "object" && converted.__natlang_timeout__)
      throw new Error(`Python timed out after ${timeoutMs} ms`);
    return { value: converted, stdout: collected(stdout), stderr: collected(stderr), ...pathsChangedSince(folder, before) };
  } finally {
    currentHost = void 0;
    currentRefresh = void 0;
    if (py) {
      py.FS.chdir("/");
      try {
        py.FS.unmount(mount);
        py.FS.rmdir(mount);
      } catch {
      }
    }
    if (watchdog) await watchdog.terminate();
    unlock();
  }
}

// src/native/python-watchdog.ts
var WATCHDOG_SCRIPT = "const flag = new Int32Array(buffer); setTimeout(() => { const interrupt = () => Atomics.store(flag, 0, 2); interrupt(); setInterval(interrupt, Math.max(1, Math.min(25, ms))); }, ms)";

// src/native/folder-shell.ts
import {
  Bash,
  InMemoryFs,
  MountableFs,
  defineCommand,
  getCommandNames
} from "just-bash";

// src/native/natlang-command.ts
function parseAskArgs(args) {
  const options = {}, words = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--lines") options.lines = true;
    else if (arg === "--jsonl") options.jsonl = true;
    else if (arg === "--filter") options.filter = true;
    else if (arg === "--returns" || arg === "--files" || arg === "--jobs") {
      const value = args[++index];
      if (value === void 0) throw new Error(`${arg} needs a value`);
      if (arg === "--returns") options.returns = value;
      else if (arg === "--files") options.files = value;
      else options.jobs = Number(value);
    } else if (arg.startsWith("--")) throw new Error(`unknown natlang ask option: ${arg}`);
    else words.push(arg);
  }
  if (!words.length) throw new Error("natlang ask needs an instruction");
  return { instruction: words.join(" "), options };
}
function format(value, json3 = false) {
  return json3 || value === null || typeof value === "object" ? JSON.stringify(value) : String(value);
}
async function executeNatlangCall(name, stdin, mode, call, options = {}) {
  const whole = () => {
    if (!options.text) return stdin.trim() ? JSON.parse(stdin) : {};
    try {
      const parsed = JSON.parse(stdin);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
    }
    return stdin.replace(/\r?\n$/, "");
  };
  const inputs = mode === "whole" ? [whole()] : stdin.split(/\r?\n/).filter((line) => line.length).map((line) => mode === "jsonl" ? JSON.parse(line) : line);
  const values = [];
  for (const input of inputs) values.push(format(await call(name, input, mode), options.json));
  return values.length ? `${values.join("\n")}
` : "";
}
async function executeNatlangAsk(folder, instruction, stdin, options, ask) {
  if (options.lines && options.jsonl) throw new Error("--lines and --jsonl are mutually exclusive");
  if (options.files && (options.lines || options.jsonl)) throw new Error("--files cannot be combined with --lines or --jsonl");
  const jobs = options.jobs ?? 1;
  if (!Number.isSafeInteger(jobs) || jobs < 1 || jobs > 64) throw new RangeError("--jobs must be between 1 and 64");
  const returns = options.returns ?? (options.filter ? "boolean" : "string");
  let items;
  if (options.files) items = (await folder.root().files(options.files)).map((file) => ({ input: file, display: file.path, path: file.path }));
  else if (options.lines || options.jsonl) items = stdin.split(/\r?\n/).filter((line) => line.length).map((line) => ({ input: options.jsonl ? JSON.parse(line) : line, display: line }));
  else items = [{ input: stdin ? stdin : folder.root(), display: stdin }];
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await ask(instruction, returns, items[index].input);
    }
  }));
  const lines = items.flatMap((item, index) => {
    const result = results[index];
    if (options.filter) return result === true ? [item.display] : [];
    return [item.path ? `${item.path}	${format(result)}` : format(result)];
  });
  return lines.length ? `${lines.join("\n")}
` : "";
}

// src/native/folder-shell.ts
var ROOT2 = "/workspace";
var BINARIES = new Set(getCommandNames());
for (const name of ["python", "python3", "sqlite3", "changes", "natlang"]) BINARIES.add(name);
var builtin2 = (path) => /^\/(?:usr\/)?bin\/[^/]+$/.test(path) && BINARIES.has(path.split("/").at(-1));
var PINNED_TIME = /* @__PURE__ */ new Date("2026-01-01T00:00:00.000Z");
var asBytes = (value) => typeof value === "string" ? new TextEncoder().encode(value) : value;
var decodeStdin = (value) => new TextDecoder().decode(Uint8Array.from(value, (char) => char.charCodeAt(0)));
var EMPTY_DIRS = /* @__PURE__ */ new WeakMap();
var FolderFs = class {
  /** `writeBudget`: bytes one bash command may add to the folder (it lives in this process's memory); absent: unbounded. */
  constructor(folder, writeBudget) {
    this.folder = folder;
    this.writeBudget = writeBudget;
    let dirs = EMPTY_DIRS.get(folder);
    if (!dirs) EMPTY_DIRS.set(folder, dirs = /* @__PURE__ */ new Set());
    this.emptyDirs = dirs;
  }
  folder;
  writeBudget;
  emptyDirs;
  /** Net bytes this shell's writes added to the folder, against `writeBudget` (the memory bound of one bash command). */
  grown = 0;
  resolvePath(base, path) {
    const full = path.startsWith("/") ? path : `${base}/${path}`;
    const parts = [];
    for (const part of full.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    const resolved = `/${parts.join("/")}`;
    return resolved;
  }
  relative(path) {
    const resolved = this.resolvePath(ROOT2, path);
    if (resolved !== ROOT2 && !resolved.startsWith(`${ROOT2}/`))
      throw new RangeError(`path escapes folder root ${ROOT2}: ${path}`);
    return resolved.slice(ROOT2.length).replace(/^\//, "");
  }
  kind(path) {
    if (builtin2(path)) return "file";
    if (path === "/bin" || path === "/usr" || path === "/usr/bin") return "directory";
    const resolved = this.resolvePath(ROOT2, path);
    if (resolved !== ROOT2 && !resolved.startsWith(`${ROOT2}/`)) return null;
    const relative3 = this.relative(path);
    return this.folder.isFile(relative3) ? "file" : this.folder.isFolder(relative3) || this.emptyDirs.has(relative3) ? "directory" : null;
  }
  async readFileBuffer(path) {
    return builtin2(path) ? new Uint8Array() : this.folder.readBytesSync(this.relative(path));
  }
  async readFile(path, options) {
    const encoding = typeof options === "string" ? options : options?.encoding ?? "utf8";
    const data = await this.readFileBuffer(path);
    if (encoding === "binary" || encoding === "latin1") return Array.from(data, (byte) => String.fromCharCode(byte)).join("");
    if (encoding === "hex") return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (encoding === "base64") return btoa(Array.from(data, (byte) => String.fromCharCode(byte)).join(""));
    return new TextDecoder(encoding === "ascii" ? "ascii" : "utf-8").decode(data);
  }
  async writeFile(path, content, _options) {
    const relative3 = this.relative(path), data = asBytes(content);
    if (this.writeBudget) {
      const growth = data.length - (this.folder.isFile(relative3) ? (await this.folder.stat(relative3)).bytes : 0);
      if (this.grown + growth > this.writeBudget.bytes) throw new Error(this.writeBudget.message);
      this.grown += growth;
    }
    this.folder.writeBytes(relative3, data);
  }
  async appendFile(path, content, options) {
    const old = await this.exists(path) ? await this.readFileBuffer(path) : new Uint8Array();
    const next = asBytes(content), joined = new Uint8Array(old.length + next.length);
    joined.set(old);
    joined.set(next, old.length);
    await this.writeFile(path, joined, options);
  }
  async exists(path) {
    return this.kind(path) !== null;
  }
  async stat(path) {
    const kind2 = this.kind(path);
    if (!kind2) throw new Error(`ENOENT: ${path}`);
    const size = kind2 === "file" && !builtin2(path) ? (await this.folder.stat(this.relative(path))).bytes : 0;
    return {
      isFile: kind2 === "file",
      isDirectory: kind2 === "directory",
      isSymbolicLink: false,
      mode: kind2 === "file" ? 33188 : 16877,
      size,
      mtime: PINNED_TIME
    };
  }
  async lstat(path) {
    return this.stat(path);
  }
  async mkdir(path, options) {
    const relative3 = this.relative(path);
    if (this.kind(path)) {
      if (options?.recursive) return;
      throw new Error(`EEXIST: ${path}`);
    }
    const parts = relative3.split("/");
    if (!options?.recursive && parts.length > 1 && !this.kind(`${ROOT2}/${parts.slice(0, -1).join("/")}`))
      throw new Error(`ENOENT: parent of ${path}`);
    for (let i = 1; i <= parts.length; i++) this.emptyDirs.add(parts.slice(0, i).join("/"));
  }
  async readdir(path) {
    if (this.kind(path) !== "directory") throw new Error(`ENOTDIR: ${path}`);
    const relative3 = this.relative(path), prefix = relative3 ? `${relative3}/` : "";
    const children = new Set(this.folder.list(relative3).map((entry) => entry.path.slice(prefix.length)));
    for (const dir of this.emptyDirs) if (dir.startsWith(prefix) && !dir.slice(prefix.length).includes("/"))
      children.add(dir.slice(prefix.length));
    return [...children].sort();
  }
  async readdirWithFileTypes(path) {
    const names = await this.readdir(path);
    return names.map((name) => ({
      name,
      isFile: this.kind(`${path}/${name}`) === "file",
      isDirectory: this.kind(`${path}/${name}`) === "directory",
      isSymbolicLink: false
    }));
  }
  async rm(path, options) {
    const kind2 = this.kind(path), relative3 = this.relative(path);
    if (!kind2) {
      if (options?.force) return;
      throw new Error(`ENOENT: ${path}`);
    }
    if (kind2 === "directory" && !options?.recursive && (await this.readdir(path)).length)
      throw new Error(`ENOTEMPTY: ${path}`);
    if (this.folder.isFile(relative3) || this.folder.isFolder(relative3) && relative3) this.folder.remove(relative3);
    for (const dir of [...this.emptyDirs]) if (dir === relative3 || dir.startsWith(`${relative3}/`)) this.emptyDirs.delete(dir);
  }
  async cp(src, dest, options) {
    if (this.kind(src) === "directory") {
      if (!options?.recursive) throw new Error("cp: directory needs -r");
      await this.mkdir(dest, { recursive: true });
      for (const name of await this.readdir(src)) await this.cp(`${src}/${name}`, `${dest}/${name}`, options);
    } else await this.writeFile(dest, await this.readFileBuffer(src));
  }
  async mv(src, dest) {
    const from = this.relative(src), to = this.relative(dest);
    if (this.kind(dest) === "file") await this.rm(dest);
    if (this.folder.isFile(from) || this.folder.isFolder(from)) this.folder.move(from, to);
    for (const dir of [...this.emptyDirs]) if (dir === from || dir.startsWith(`${from}/`)) {
      this.emptyDirs.delete(dir);
      this.emptyDirs.add(`${to}${dir.slice(from.length)}`);
    }
  }
  getAllPaths() {
    return [
      ROOT2,
      ...this.folder.listFiles().map((entry) => `${ROOT2}/${entry.path}`),
      ...this.folder.listFolders().map((entry) => `${ROOT2}/${entry.path}`),
      ...[...this.emptyDirs].map((path) => `${ROOT2}/${path}`)
    ];
  }
  async chmod(path) {
    if (!await this.exists(path)) throw new Error(`ENOENT: ${path}`);
  }
  async symlink() {
    throw new Error("symlinks are not supported in folder bash");
  }
  async link() {
    throw new Error("hard links are not supported in folder bash");
  }
  async readlink() {
    throw new Error("not a symlink");
  }
  async realpath(path) {
    if (!await this.exists(path)) throw new Error(`ENOENT: ${path}`);
    return this.resolvePath(ROOT2, path);
  }
  async utimes(path) {
    if (!await this.exists(path)) throw new Error(`ENOENT: ${path}`);
  }
};
var DeviceFs = class _DeviceFs extends InMemoryFs {
  static SINKS = /* @__PURE__ */ new Set(["/null", "/zero"]);
  constructor() {
    super({ "/null": "", "/zero": "", "/stdin": "", "/stdout": "", "/stderr": "" });
  }
  async writeFile(path, content, options) {
    if (!_DeviceFs.SINKS.has(this.resolvePath("/", path))) await super.writeFile(path, content, options);
  }
  async appendFile(path, content, options) {
    if (!_DeviceFs.SINKS.has(this.resolvePath("/", path))) await super.appendFile(path, content, options);
  }
};
function bashMemory() {
  const limitMb = evalMemoryLimitMb();
  return limitMb ? { bytes: Math.floor(limitMb * 1024 * 1024), message: memoryLimitMessage("bash", "bash command", limitMb) } : void 0;
}
function memoryLimits(memory) {
  if (!memory) return {};
  const bytes = memory.bytes, small = Math.min(bytes, 64 * 1024 * 1024);
  return {
    maxLiveBytes: bytes,
    maxInputBytes: bytes,
    maxOutputSize: bytes,
    maxFileSystemBytes: bytes,
    maxDatabaseBytes: bytes,
    maxDatabaseResultBytes: bytes,
    maxArchiveBytes: bytes,
    maxArchiveCompressedBytes: bytes,
    maxArchiveEntryBytes: bytes,
    maxStringLength: small,
    maxHeredocSize: small
  };
}
function shellFs(folder, memory) {
  return new MountableFs({ base: new FolderFs(folder, memory), mounts: [
    { mountPoint: "/dev", filesystem: new DeviceFs() },
    { mountPoint: "/tmp", filesystem: new InMemoryFs({}, memory ? { maxTotalBytes: memory.bytes } : {}) }
  ] });
}
function staticWord(word) {
  const text = (parts) => {
    if (!parts) return void 0;
    let out = "";
    for (const part of parts) {
      if (part.type === "Literal" || part.type === "SingleQuoted") out += part.value ?? "";
      else if (part.type === "DoubleQuoted") {
        const inner = text(part.parts);
        if (inner === void 0) return void 0;
        out += inner;
      } else return void 0;
    }
    return out;
  };
  return text(word?.parts);
}
function checkNestedShell(node) {
  const args = node.args;
  const flag = staticWord(args?.[0]);
  if (!flag || !/^-[a-z]*c[a-z]*$/.test(flag)) return false;
  const script = staticWord(args?.[1]);
  if (script === void 0) return false;
  checkBashAst(new Bash().transform(script).ast);
  return true;
}
function checkBashAst(tree) {
  const calls = /* @__PURE__ */ new Map();
  const visit = (value, current) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, current));
      return;
    }
    const node = value;
    if (["While", "Until", "CStyleFor"].includes(String(node.type)))
      throw new SyntaxError(`${node.type} loops are not allowed; use for x in a finite list or iterateOn`);
    if (node.type === "FunctionDef") {
      const name = String(node.name);
      calls.set(name, /* @__PURE__ */ new Set());
      visit(node.body, name);
      return;
    }
    if (node.type === "SimpleCommand") {
      const parts = node.name?.parts;
      const name = parts?.every((part) => part.type === "Literal") ? parts.map((part) => part.value).join("") : void 0;
      if (name && (name === "bash" || name === "sh") && checkNestedShell(node)) return;
      if (name && ["source", ".", "eval", "bash", "sh"].includes(name))
        throw new SyntaxError(name === "bash" || name === "sh" ? `${name} runs only a literal script here, as ${name} -c '...'; or write the commands directly` : `${name} cannot bypass the bash policy; use commands directly`);
      if (current && name) calls.get(current)?.add(name);
    }
    for (const [key, child] of Object.entries(node)) if (key !== "name" || node.type !== "SimpleCommand") visit(child, current);
  };
  visit(tree);
  const reaches = (start, name, seen = /* @__PURE__ */ new Set()) => {
    if (seen.has(name)) return false;
    seen.add(name);
    return [...calls.get(name) ?? []].some((next) => next === start || reaches(start, next, seen));
  };
  for (const name of calls.keys()) if (reaches(name, name))
    throw new SyntaxError(`function ${name} calls itself; use a finite for loop`);
}
async function runFolderBash(folder, command, options = {}) {
  const before = folderContents(folder);
  const changes = defineCommand("changes", async () => ({ stdout: JSON.stringify(folder.diffSync().changes.map((change) => ({ path: change.path, kind: change.kind })), null, 2) + "\n", stderr: "", exitCode: 0 }));
  const pythonCommand = (name) => defineCommand(name, async (args, ctx) => {
    try {
      let source;
      if (args[0] === "-c") source = args[1] ?? "";
      else if (args[0] === "-" || !args.length) source = decodeStdin(ctx.stdin);
      else source = await folder.readText(args[0]);
      const result2 = await runFolderPython(folder, source, options.python, void 0, ctx.cwd);
      return { stdout: result2.stdout ? `${result2.stdout}
` : "", stderr: result2.stderr, exitCode: 0 };
    } catch (error) {
      return { stdout: "", stderr: String(error), exitCode: 1 };
    }
  });
  const sqlite2 = defineCommand("sqlite3", async (args, ctx) => {
    const flags = [], positional = [];
    let separator = "|";
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (arg === "-separator") {
        if (args[index + 1] === void 0) return { stdout: "", stderr: "-separator needs a value", exitCode: 1 };
        separator = args[++index];
      } else if (arg.startsWith("-")) flags.push(arg);
      else positional.push(arg);
    }
    const database = positional[0], sql = positional.slice(1).join(" ") || decodeStdin(ctx.stdin);
    if (!database) return { stdout: "", stderr: "sqlite3 needs a database path", exitCode: 1 };
    const script = `import sqlite3, csv, io, json
con = sqlite3.connect(${JSON.stringify(database)})
sql = ${JSON.stringify(sql)}
rows = []; columns = []
pending = ''
for char in sql:
    pending += char
    if char == ';' and sqlite3.complete_statement(pending):
        cur = con.execute(pending)
        if cur.description: columns = [item[0] for item in cur.description]; rows = cur.fetchall()
        pending = ''
if pending.strip():
    cur = con.execute(pending)
    if cur.description: columns = [item[0] for item in cur.description]; rows = cur.fetchall()
con.commit(); con.close()
buffer = io.StringIO()
` + (flags.includes("-json") ? `print(json.dumps([dict(zip(columns, row)) for row in rows]))
` : `writer = csv.writer(buffer, delimiter=${JSON.stringify(flags.includes("-csv") ? "," : separator)}, lineterminator='\\n')
${flags.includes("-header") ? "writer.writerow(columns)\n" : ""}writer.writerows(rows)
print(buffer.getvalue(), end='')
`);
    try {
      const result2 = await runFolderPython(folder, script, options.python, void 0, ctx.cwd);
      return { stdout: result2.stdout ? `${result2.stdout}
` : "", stderr: result2.stderr, exitCode: 0 };
    } catch (error) {
      return { stdout: "", stderr: String(error), exitCode: 1 };
    }
  });
  const natlang = defineCommand("natlang", async (args, ctx) => {
    try {
      if (args[0] === "ask") {
        if (!options.ask) throw new Error("natlang calls are unavailable outside a natlang runtime");
        const parsed = parseAskArgs(args.slice(1));
        return {
          stdout: await executeNatlangAsk(folder, parsed.instruction, decodeStdin(ctx.stdin), parsed.options, options.ask),
          stderr: "",
          exitCode: 0
        };
      }
      if (args[0] === "call") {
        if (!options.call) throw new Error("natlang calls are unavailable outside a natlang runtime");
        const words = args.slice(1).filter((arg) => arg !== "--lines" && arg !== "--jsonl");
        if (words.length !== 1) throw new Error("usage: natlang call NAME|FILE.nl [--lines|--jsonl]");
        const lines = args.includes("--lines"), jsonl = args.includes("--jsonl");
        if (lines && jsonl) throw new Error("--lines and --jsonl are mutually exclusive");
        return {
          stdout: await executeNatlangCall(words[0], decodeStdin(ctx.stdin), lines ? "line" : jsonl ? "jsonl" : "whole", options.call),
          stderr: "",
          exitCode: 0
        };
      }
      if (args[0] === "apply") {
        if (!options.apply) throw new Error("natlang reducers are unavailable outside a natlang runtime");
        if (args.length !== 3) throw new Error("usage: natlang apply REDUCER DIR");
        const value = await options.apply(args[1], args[2]);
        return {
          stdout: `${value === null || typeof value === "object" ? JSON.stringify(value) : String(value)}
`,
          stderr: "",
          exitCode: 0
        };
      }
      return { stdout: "", stderr: "usage: natlang ask|call|apply ...", exitCode: 2 };
    } catch (error) {
      return { stdout: "", stderr: String(error), exitCode: 1 };
    }
  });
  const memory = bashMemory();
  const bash = new Bash({
    fs: shellFs(folder, memory),
    cwd: ROOT2,
    env: { HOME: ROOT2 },
    python: false,
    javascript: false,
    ...options.network === false ? {} : { network: { dangerouslyAllowFullInternetAccess: true } },
    customCommands: [changes, pythonCommand("python"), pythonCommand("python3"), sqlite2, natlang],
    executionLimits: { maxCommandCount: 1e3, maxLoopIterations: 1e4, ...memoryLimits(memory) }
  });
  checkBashAst(bash.transform(command).ast);
  const result = await bash.exec(command, {
    ...options.cwd === void 0 ? {} : { cwd: bash.fs.resolvePath(ROOT2, options.cwd) },
    ...options.env ? { env: options.env } : {},
    ...options.signal ? { signal: options.signal } : {},
    ...options.args ? { args: options.args } : {}
  });
  const stderr = memory && /\b(size|byte|string|length|output) limit exceeded|\boutput size exceeded/.test(result.stderr) && !result.stderr.includes(memory.message) ? `${result.stderr.replace(/\n?$/, "\n")}${memory.message}
` : result.stderr;
  return { exitCode: result.exitCode, stdout: result.stdout, stderr, ...pathsChangedSince(folder, before) };
}

// src/gepa/index.ts
var missing = -1;
var scoreOn = (member, caseId) => member.scores.find((score) => score.caseId === caseId)?.quality ?? missing;
function caseIds(members) {
  return [...new Set(members.flatMap((member) => member.scores.map((score) => score.caseId)))].sort();
}
function frontier(members) {
  const winners = [];
  for (const caseId of caseIds(members)) {
    const best = Math.max(...members.map((member) => scoreOn(member, caseId)));
    for (const member of members) if (scoreOn(member, caseId) === best) winners.push(member.id);
  }
  return winners.sort();
}
function frontierSet(members) {
  return new Set(frontier(members));
}
function wonCases(members) {
  const won = {};
  for (const caseId of caseIds(members)) {
    const best = Math.max(...members.map((member) => scoreOn(member, caseId)));
    for (const member of members) if (scoreOn(member, caseId) === best) (won[member.id] ??= []).push(caseId);
  }
  return won;
}
function draw(seed) {
  let x = seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  const next = x >>> 0;
  return { value: next / 4294967296, next };
}
function pick(choices, value) {
  if (!choices.length) throw new RangeError("nothing to choose from");
  return choices[Math.min(choices.length - 1, Math.floor(value * choices.length))];
}
function parentChoices(members) {
  const winners = frontier(members);
  return winners.length ? winners : members.map((member) => member.id).sort();
}
function drawParent(members, seed) {
  const { value, next } = draw(seed);
  return { id: pick(parentChoices(members), value), next };
}
function better(left, right, rule = {}) {
  const eligible = rule.eligible ?? (() => true);
  if (!eligible(left)) return false;
  if (!eligible(right)) return true;
  if (left.quality !== right.quality) return left.quality > right.quality;
  if (!rule.measure) return false;
  const a = rule.measure(left), b = rule.measure(right);
  return a !== null && (b === null || a < b);
}
function objectiveMeasure(objective = "quality") {
  if (objective === "source-size") return (member) => member.cost ?? null;
  if (objective === "model-calls") return (member) => member.modelCalls ?? null;
  return void 0;
}
function leaders(members, objective = "quality") {
  const maximum = Math.max(...members.map((member) => member.quality));
  let eligible = members.filter((member) => member.quality === maximum);
  const measure2 = objectiveMeasure(objective);
  if (measure2) {
    const minimum = Math.min(...eligible.map((member) => measure2(member) ?? Infinity));
    eligible = eligible.filter((member) => (measure2(member) ?? Infinity) === minimum);
  }
  return eligible.map((member) => member.id).sort();
}
function chooseIncumbent(members, incumbent, objective = "quality") {
  const chosen = leaders(members, objective);
  return chosen.includes(incumbent) ? incumbent : chosen[0];
}
function prune(members, protectedIds, limit) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("population limit must be a positive integer");
  const keep = new Set(protectedIds);
  const unique = members.filter((member, index) => members.findIndex((other) => other.id === member.id) === index);
  const onFrontier = frontierSet(unique);
  const kept = new Set(unique.filter((member) => keep.has(member.id)).map((member) => member.id));
  const rest = unique.filter((member) => !kept.has(member.id)).sort((a, b) => Number(onFrontier.has(b.id)) - Number(onFrontier.has(a.id)) || b.quality - a.quality || a.id.localeCompare(b.id));
  for (const member of rest) {
    if (kept.size >= limit) break;
    kept.add(member.id);
  }
  return unique.filter((member) => kept.has(member.id));
}
var isRecord2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var canonicalJson = (value) => JSON.stringify(value, (_key, item) => isRecord2(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item) ?? "undefined";
function componentProblem(parent, candidate, keys) {
  if (!isRecord2(candidate)) return "components.json holds one JSON object whose keys are the component keys.";
  const missing2 = Object.keys(parent).filter((key) => !(key in candidate));
  if (missing2.length) return `components.json keeps every component of the parent; these are missing: ${missing2.join(", ")}.`;
  const unknown = Object.keys(candidate).filter((key) => !(key in parent));
  if (unknown.length) return `components.json holds only the components of the parent; these are not among them: ${unknown.join(", ")}.`;
  for (const key of Object.keys(parent)) {
    const before = parent[key], after = candidate[key];
    if (!keys.includes(key)) {
      if (canonicalJson(before) !== canonicalJson(after)) return `The component ${key} is not selected, so it keeps its parent value; the selected components are: ${keys.join(", ")}.`;
      continue;
    }
    if (!isRecord2(before) || !isRecord2(after)) return `The component ${key} is an object with a kind.`;
    if (after.kind !== before.kind) return `The component ${key} keeps its kind \`${String(before.kind)}\`.`;
    if (before.kind === "program.guidance") {
      if (typeof after.text !== "string") return `The guidance component ${key} has its text as a string.`;
      continue;
    }
    const was = before.template, now2 = after.template;
    if (!isRecord2(was) || !isRecord2(now2)) return `The instructions component ${key} has a template object.`;
    if (!Array.isArray(now2.segments) || now2.segments.some((segment) => typeof segment !== "string"))
      return `The segments of ${key} are a JSON array of strings; each static segment is one string in that array.`;
    if (canonicalJson(now2.slotIds) !== canonicalJson(was.slotIds)) return `The slot ids of ${key} keep their parent value: ${canonicalJson(was.slotIds)}.`;
    if (now2.segments.length !== was.segments.length) return `${key} keeps its ${was.segments.length} segments (it has ${now2.segments.length}); write the new text inside the existing segments.`;
  }
  return "";
}
var gepaModule = {
  __esModule: true,
  caseIds,
  frontier,
  frontierSet,
  wonCases,
  draw,
  pick,
  parentChoices,
  drawParent,
  better,
  objectiveMeasure,
  leaders,
  chooseIncumbent,
  prune,
  componentProblem
};

// src/calls/offline.ts
import { existsSync as existsSync3 } from "node:fs";
import { resolve as resolve5 } from "node:path";
function definitionFor(store, record) {
  const identity = record.definition;
  if (identity.source?.endsWith(".nl") && record.program_root) {
    const path = resolve5(record.program_root, identity.source);
    if (existsSync3(path)) {
      try {
        const definition = natlangDefinition(loadNamedFunction(path, nodeSourceFiles(record.program_root)));
        if (definitionKey(definition) === identity.key) return { definition, loaded: true };
      } catch {
      }
    }
  }
  const body = store.value(identity.instructions);
  if (typeof body !== "string") throw new Error(`the instructions of ${identity.name} were not recorded`);
  return { loaded: false, definition: {
    id: identity.id,
    name: identity.name,
    body,
    params: identity.params,
    returns: identity.returns,
    types: identity.types,
    codebase: {},
    subtype: identity.subtype,
    ...identity.declaredParameters ? { declaredParameters: true } : {},
    ...identity.readout ? { readout: identity.readout } : {},
    ...identity.source ? { source: identity.source } : {}
  } };
}
var signatureOf = (definition) => `${definition.name}(${definition.params.map((param) => `${param.name}${param.optional ? "?" : ""}: ${param.type}`).join(", ")}): ${definition.returns}`;
function caseFor(platform, store, definitionKeyValue, hash, definition) {
  const compilation = store.currentCompilation(definitionKeyValue);
  if (!compilation?.files["cases.ts"]) return void 0;
  return loadCases(platform, compilation.id, compilation.files["cases.ts"], definition.codebase, definition.types).find((item) => item.hash === hash);
}
async function replayCaseOn(runtime, store, item, record) {
  const args = recordedArguments(store, record);
  if (!args) return { skipped: "the call has inputs that were not recorded exactly" };
  const outcome = await replay(
    runtime,
    item.run,
    args,
    subtreeEffects(store, record),
    { captureNames: Object.keys(record.captures) }
  );
  return {
    ...outcome.error !== void 0 ? { error: outcome.error } : { value: outcome.value },
    effects: outcome.observed,
    captureWrites: outcome.captureWrites,
    files: outcome.files ?? []
  };
}
async function rerunAgent(runtime, store, definition, record) {
  const args = recordedArguments(store, record);
  if (!args) return { skipped: "the call has inputs that were not recorded exactly" };
  const captures = Object.fromEntries(Object.keys(record.captures).map((name) => {
    let value = args[name];
    return [name, { name, type: "unknown", mutable: true, get: () => value, set: (next) => {
      value = next;
      args[name] = next;
    } }];
  }));
  const positional = [...definition.subtype === "directory-reducer" ? [args.folder] : [], ...definition.params.map((param) => args[param.name])];
  while (positional.length && positional.at(-1) === void 0) positional.pop();
  const outcome = await replay(
    runtime,
    () => invokeDefinition(
      currentFrame(),
      definition,
      positional,
      Object.keys(captures).length ? { captures } : {}
    ),
    args,
    subtreeEffects(store, record),
    { captureNames: Object.keys(record.captures), taskOptions: { auditOf: record.call_id } }
  );
  return {
    ...outcome.error !== void 0 ? { error: outcome.error } : { value: outcome.value },
    effects: outcome.observed,
    captureWrites: outcome.captureWrites,
    files: outcome.files ?? []
  };
}
async function verdictFor(runtime, store, definition, record, agent, crisp) {
  const inputs = Object.fromEntries(Object.entries({ ...record.captures, ...record.inputs }).map(([name, ref]) => [name, store.value(ref)]));
  return judge(runtime, {
    instructions: definition.body,
    signature: signatureOf(definition),
    inputs,
    reference: agent,
    candidate: crisp,
    annotations: store.annotations(record.call_id).map((item) => ({ kind: item.kind, value: item.value })),
    seed: record.call_id
  });
}
async function runJob(runtime, store, job) {
  const record = store.call(job.call_id);
  if (!record) return { status: "skipped", detail: "the call is no longer in the store" };
  const { definition } = definitionFor(store, record);
  const item = caseFor(runtime.platform, store, record.definition.key, job.case_hash, definition);
  if (!item) return { status: "skipped", detail: "the case is no longer in the current compilation" };
  if (job.kind === "shadow") {
    if (!isModelEvidence(record)) return { status: "skipped", detail: "the call did not run a declared model (a scripted or undeclared executor)" };
    const crisp = await replayCaseOn(runtime, store, item, record);
    if ("skipped" in crisp) return { status: "skipped", detail: crisp.skipped };
    const { verdict: verdict2, differences: differences2 } = await verdictFor(runtime, store, definition, record, recordedBehavior(store, record), crisp);
    store.caseVerdict(job.case_hash, record.call_id, "shadow", verdict2);
    if (verdict2 === "better") store.finding({
      definitionKey: record.definition.key,
      definitionId: record.definition.id,
      definitionName: record.definition.name,
      definitionSource: record.definition.source,
      kind: "executor-worse",
      summary: `live calls where case ${job.case_hash} did better than the executor`,
      detail: { case: job.case_hash, call: record.call_id, differences: differences2 }
    });
    return { status: "done", verdict: verdict2, detail: differences2.join("; ") };
  }
  const agent = await rerunAgent(runtime, store, definition, record);
  if ("skipped" in agent) return { status: "skipped", detail: agent.skipped };
  const { verdict, differences } = await verdictFor(runtime, store, definition, record, agent, recordedBehavior(store, record));
  store.caseVerdict(job.case_hash, record.call_id, "audit", verdict);
  return { status: "done", verdict, detail: differences.join("; ") };
}
async function runJobs(runtime, store, options = {}) {
  let count = 0;
  for (const job of store.pendingJobs(options.limit ?? 50)) {
    if (options.signal?.aborted) break;
    try {
      const result = await runJob(runtime, store, job);
      store.finishJob(job.id, result.status, result.verdict, result.detail);
      options.log?.(`${job.kind} ${job.case_hash} on ${job.call_id}: ${result.status}${result.verdict ? ` ${result.verdict}` : ""}${result.detail ? ` (${result.detail})` : ""}`);
    } catch (error) {
      store.finishJob(job.id, "failed", null, error instanceof Error ? error.message : String(error));
      options.log?.(`${job.kind} ${job.case_hash} on ${job.call_id}: failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    count++;
  }
  return count;
}

// src/calls/specializer.ts
import ts11 from "typescript";
function study(store, key, options = {}) {
  const summaries = store.agentCalls(key, options.limit ?? 2e3).filter((call) => call.outcome === "done" && call.executor === "agent");
  const records = /* @__PURE__ */ new Map();
  const examples = [];
  let skipped = 0;
  for (const summary of summaries) {
    const record = store.call(summary.call_id);
    const args = record && recordedArguments(store, record);
    if (!record || !args) {
      skipped++;
      continue;
    }
    if (!isModelEvidence(record)) {
      skipped++;
      continue;
    }
    records.set(record.call_id, record);
    examples.push({
      callId: record.call_id,
      args,
      features: record.features,
      evals: evalsOf(record),
      approach: "",
      split: splitOf(record.call_id),
      behavior: behaviorOf(store, record)
    });
  }
  if (!examples.length) return void 0;
  const found = approaches(examples);
  const byCall = new Map(found.flatMap((approach) => approach.calls.map((id) => [id, approach.id])));
  for (const example of examples) example.approach = byCall.get(example.callId);
  const { rules, unclassified } = induceRules(examples, { minSupport: options.minSupport });
  const latest = records.get(examples.at(-1).callId);
  const { definition, loaded } = definitionFor(store, latest);
  return { key, definition, loaded, records, examples, approaches: found, rules, unclassified, skipped };
}
function behaviorOf(store, record, depth = 0) {
  const steps = record.effects.filter((effect) => !effect.error).sort((a, b) => a.order - b.order).map((effect) => `${effect.service}.${effect.method}`);
  if (depth < 4) for (const child of store.children(record.call_id)) steps.push(child.definition_name);
  return behaviorLabel(steps);
}
function evalsOf(record) {
  return record.approach.evals.filter(Boolean);
}
function crispDecline(subject, minCalls) {
  if (subject.examples.length < minCalls)
    return { reason: "not-worth-it", why: `${subject.examples.length} recorded calls with exact inputs; at least ${minCalls} are needed` };
  const repeated = subject.approaches.filter((approach) => approach.calls.length >= 3);
  if (!repeated.length && !subject.rules.length)
    return { reason: "no-clusters", why: `no approach repeats in ${subject.examples.length} calls and no condition selects one` };
  return void 0;
}
var json = (value) => JSON.stringify(value, null, 2);
var fence = (text, language = "") => `\`\`\`${language}
${text}
\`\`\``;
function renderEvidence(store, subject, extra = {}) {
  const files = { "function.md": renderFunction(subject) };
  renderApproaches(store, subject, files);
  return renderRest(store, subject, files, extra);
}
function renderFunction(subject) {
  const { definition } = subject;
  const callees = Object.keys(definition.codebase);
  const cost = [...subject.records.values()].reduce((sum, record) => ({
    tokens: sum.tokens + record.cost.tokens_in + record.cost.tokens_out,
    wall: sum.wall + record.cost.wall_ms
  }), { tokens: 0, wall: 0 });
  const count = subject.examples.length;
  return [
    `# ${definition.name}`,
    "",
    `Signature: \`${signatureOf(definition)}\``,
    "",
    `Source: ${definition.source ?? "(inline)"}${subject.loaded ? "" : " (rebuilt from the record; its context is not available)"}`,
    "",
    "## Instructions",
    "",
    definition.body.trim(),
    "",
    ...Object.keys(definition.types).length ? ["## Types", "", fence(Object.entries(definition.types).map(([name, text]) => `type ${name} = ${text};`).join("\n"), "ts"), ""] : [],
    "## What a case may call",
    "",
    callees.length ? `Items of the function's context, imported by name (\`import helper from './helper'\`): ${callees.join(", ")}.` : "No context items.",
    `Services, imported from 'natlang:services': ${[...new Set([...subject.records.values()].flatMap((record) => record.effects.map((effect) => effect.service)))].join(", ") || "none recorded"}.`,
    "",
    "## Volume",
    "",
    `${count} successful agent calls with exact inputs (${subject.skipped} more could not be used), ${Math.round(cost.tokens / Math.max(1, count))} tokens and ${Math.round(cost.wall / Math.max(1, count))} ms per call on average.`,
    "",
    `Split: ${subject.examples.filter((example) => example.split === "training").length} training, ${subject.examples.filter((example) => example.split === "held-out").length} held out (used only to check your cases).`,
    ""
  ].join("\n");
}
function renderApproaches(store, subject, files) {
  const overview = [
    "# Approaches",
    "",
    "Each approach is a group of calls whose code was the same after normalization. One line each.",
    "Approaches with one call have no folder: one call is not a pattern. traces.call(id) shows such a call in full.",
    "",
    "| approach | calls | what they did | a call | its result | code |",
    "| --- | --- | --- | --- | --- | --- |"
  ];
  for (const approach of subject.approaches) {
    const first = subject.records.get(approach.calls[0]);
    const example = subject.examples.find((item) => item.callId === approach.calls[0]);
    const cell = (value, limit) => (JSON.stringify(value) ?? "").replace(/\|/g, "\\|").slice(0, limit);
    overview.push(`| ${approach.calls.length > 1 ? approach.id : `${approach.id} (${approach.calls[0]})`} | ${approach.calls.length} | ${example?.behavior ?? ""} | ${cell(example?.args, 80)} | ${cell(first ? store.value(first.output) : null, 60)} | ${(approach.template[0] ?? "(no code)").replace(/\|/g, "\\|").slice(0, 100)} |`);
  }
  files["approaches/README.md"] = overview.join("\n") + "\n";
  for (const approach of subject.approaches) {
    if (approach.calls.length < 2) continue;
    const dir = `approaches/${approach.id}`;
    const calls = approach.calls.map((id) => subject.records.get(id)).filter(Boolean);
    files[`${dir}/approach.ts`] = approach.answerOnly ? "// The agent answered without running any code.\n" : [
      `// ${approach.calls.length} calls ran these evals (normalized: $in.<path> is that input, v0, v1 ... are locals,`,
      `// $h0, $h1 ... are literals that differed between calls; see stats.md).`,
      "",
      ...approach.template.map((program, index) => `// eval ${index + 1}
${program}
`)
    ].join("\n");
    const outputs = /* @__PURE__ */ new Map();
    for (const record of calls) {
      const key = JSON.stringify(store.value(record.output));
      outputs.set(key, (outputs.get(key) ?? 0) + 1);
    }
    const behaviorsHere = [...new Set(approach.calls.map((id) => subject.examples.find((example) => example.callId === id)?.behavior ?? "none"))];
    files[`${dir}/stats.md`] = [
      `# ${approach.id}`,
      "",
      `${approach.calls.length} calls (${calls.filter((record) => splitOf(record.call_id) === "held-out").length} held out).`,
      `What they did: ${behaviorsHere.join("; ")}.`,
      "",
      "Most common results:",
      ...[...outputs].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, n]) => `- ${n}\xD7 ${value.slice(0, 300)}`),
      "",
      ...Object.values(approach.holes)[0]?.length ? ["Hole values per call:", ...Object.entries(approach.holes).slice(0, 20).map(([id, values]) => `- ${id}: ${values.join(", ")}`), ""] : []
    ].join("\n");
    for (const record of calls.filter((record2) => splitOf(record2.call_id) === "training").slice(0, 5))
      files[`${dir}/examples/${record.call_id.replace(/[^\w.-]/g, "_")}.json`] = json(exampleOf(store, record));
  }
}
function renderRest(store, subject, files, extra) {
  const behaviors = /* @__PURE__ */ new Map();
  for (const example of subject.examples) behaviors.set(example.behavior ?? "none", [...behaviors.get(example.behavior ?? "none") ?? [], example]);
  files["conditions.md"] = [
    "# Conditions",
    "",
    "What the calls did, whatever code they ran (their service calls and the functions they called):",
    "",
    ...[...behaviors].sort((a, b) => b[1].length - a[1].length).map(([behavior, list]) => `- ${behavior}: ${list.length} calls, approaches ${[...new Set(list.map((example) => example.approach))].join(", ")}`),
    "",
    "Conditions found by search over the training calls: each selects one behavior with no exception among the training calls",
    "not covered by an earlier condition. They are evaluated in order, like the cases of a cases file. `held out` shows how",
    "the condition does on calls it was not chosen on. Use, change, merge or drop them; they are evidence, not the answer.",
    "",
    ...subject.rules.flatMap((rule, index) => [`## ${index + 1}. ${rule.label} (${rule.covers.length} training calls; held out: ${rule.heldOut.correct}/${rule.heldOut.covered} correct)`, "", fence(rule.guard, "ts"), ""]),
    ...subject.rules.length ? [] : ["No condition selects a behavior without exception.", ""],
    `${subject.unclassified.length} training calls are not covered by any condition (unclassified/).`,
    ""
  ].join("\n");
  files["unclassified/README.md"] = `${subject.unclassified.length} training calls no condition covers. A few are listed here.
`;
  for (const id of subject.unclassified.slice(0, 10)) {
    const record = subject.records.get(id);
    const example = subject.examples.find((item) => item.callId === id);
    if (record) files[`unclassified/${id.replace(/[^\w.-]/g, "_")}.json`] = json({ approach: example?.approach, behavior: example?.behavior, ...exampleOf(store, record) });
  }
  files["history.md"] = extra.history ?? "No earlier compilation or decline for this function.\n";
  if (extra.previousCases) files["previous-cases.ts"] = extra.previousCases;
  files["report.md"] = extra.report ?? "No cases have been checked yet.\n";
  return files;
}
function exampleOf(store, record) {
  return {
    call: record.call_id,
    inputs: Object.fromEntries(Object.entries({ ...record.captures, ...record.inputs }).map(([name, ref]) => [name, store.value(ref) ?? ref])),
    result: store.value(record.output),
    effects: record.effects.map((effect) => ({
      call: `${effect.service}.${effect.method}`,
      args: store.value(effect.args),
      ...effect.error ? { error: effect.error } : { result: store.value(effect.result) }
    })),
    evals: record.approach.evals,
    children: store.children(record.call_id).map((child) => child.definition_name)
  };
}
function renderHistory(store, key) {
  const current = store.currentCompilation(key);
  const decline = store.declineFor(key);
  const lines = ["# History", ""];
  if (decline) lines.push(`Declined before (${decline.created_at}): ${decline.reason}: ${decline.why}`, "");
  if (current) {
    lines.push(`Current compilation ${current.id} (${current.created_at}); its cases.ts is in previous-cases.ts.`, "");
    for (const item of current.cases) {
      lines.push(`- case ${item.position + 1} (${item.hash}): ${item.tier}; served ${item.served}, handed back ${item.handed_off}, compared ${item.compared} (${item.worse} worse, ${item.better} better; ${item.live_compared ?? 0} live, ${item.live_worse ?? 0} worse), audited ${item.audited} (${item.audit_worse} worse)`);
      for (const link of store.caseCalls(item.hash, "handed-off", 5)) {
        const record = store.call(link.call_id);
        if (record?.executor.case_error) lines.push(`  - handed back on ${link.call_id}: ${record.executor.case_error.slice(0, 300)}`);
      }
      for (const link of store.caseCalls(item.hash, void 0, 50).filter((link2) => link2.verdict === "worse" || link2.verdict === "diverged").slice(0, 5))
        lines.push(`  - ${link.role} on ${link.call_id}: ${link.verdict}`);
    }
    lines.push("");
  }
  if (!decline && !current) lines.push("No earlier compilation or decline for this function.");
  return { history: lines.join("\n") + "\n", ...current?.files["cases.ts"] ? { previousCases: current.files["cases.ts"] } : {} };
}
async function verifyCases(runtime, store, subject, text, options = {}) {
  let cases;
  try {
    cases = loadCases(runtime.platform, `candidate-${subject.key.slice(0, 8)}`, text, subject.definition.codebase, subject.definition.types);
  } catch (error) {
    return { checks: [], error: error instanceof Error ? error.message : String(error) };
  }
  const sources = caseSources(text);
  const checks = cases.map((item, position) => ({
    position,
    hash: item.hash,
    source: sources[position],
    admitted: 0,
    heldOutAdmitted: 0,
    results: [],
    guardErrors: 0,
    accepted: false,
    reason: ""
  }));
  const judged = /* @__PURE__ */ new Map();
  for (const example of subject.examples) {
    if (options.signal?.aborted) break;
    const at = cases.findIndex((item, position) => {
      try {
        return item.when(example.args) === true;
      } catch {
        checks[position].guardErrors++;
        return false;
      }
    });
    if (at < 0) continue;
    const check = checks[at];
    check.admitted++;
    if (example.split === "held-out") check.heldOutAdmitted++;
    const record = subject.records.get(example.callId);
    const crisp = await replayCaseOn(runtime, store, cases[at], record);
    if ("skipped" in crisp) {
      check.results.push({ callId: example.callId, split: example.split, verdict: "skipped", detail: crisp.skipped });
      continue;
    }
    if (crisp.error !== void 0) {
      check.results.push({ callId: example.callId, split: example.split, verdict: "error", detail: crisp.error });
      continue;
    }
    const agent = recordedBehavior(store, record);
    const count = judged.get(at) ?? 0;
    try {
      const { verdict, differences } = count < (options.maxJudged ?? 25) || example.split === "held-out" ? await verdictFor(runtime, store, subject.definition, record, agent, crisp) : { verdict: "diverged", differences: ["not judged: too many differing calls for this case"] };
      if (verdict !== "equal") judged.set(at, count + 1);
      check.results.push({ callId: example.callId, split: example.split, verdict, ...differences.length ? { detail: differences.join("; ") } : {} });
    } catch (error) {
      check.results.push({ callId: example.callId, split: example.split, verdict: "skipped", detail: `judge failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  const bound = options.bound ?? 0.05;
  for (const check of checks) {
    const bad = check.results.filter((result) => ["worse", "error", "diverged"].includes(result.verdict)).length;
    const counted = check.results.filter((result) => result.verdict !== "skipped").length;
    check.accepted = counted > 0 && bad <= bound * counted && check.guardErrors === 0;
    check.reason = !check.admitted ? "its guard admits none of the recorded calls" : !counted ? "none of its calls could be replayed" : check.guardErrors ? `its guard threw on ${check.guardErrors} calls` : bad > bound * counted ? `${bad} of ${counted} calls worse, failed or diverged` : `${counted - bad} of ${counted} calls equal or better`;
  }
  return { checks };
}
function renderReport(store, subject, result) {
  if (result.error) return `# Report

The cases file does not load: ${result.error}

Fix it and keep the shape \`export const cases = [{ when: (args) => ..., run: async (args) => ... }]\`.
`;
  const lines = ["# Report", "", "Each case was run on the recorded calls its guard admits, against the recorded effects, and compared with what the agent did.", ""];
  for (const check of result.checks) {
    lines.push(
      `## Case ${check.position + 1}: ${check.accepted ? "accepted" : "not accepted"}: ${check.reason}`,
      "",
      `Admitted ${check.admitted} calls (${check.heldOutAdmitted} held out).`,
      ""
    );
    const counts = /* @__PURE__ */ new Map();
    for (const result2 of check.results) counts.set(result2.verdict, (counts.get(result2.verdict) ?? 0) + 1);
    lines.push([...counts].map(([verdict, n]) => `${verdict}: ${n}`).join(", ") || "No results.", "");
    for (const result2 of check.results.filter((item) => !["equal", "better", "equivalent"].includes(item.verdict)).slice(0, 6)) {
      const record = subject.records.get(result2.callId);
      lines.push(`- ${result2.callId} (${result2.split}): ${result2.verdict}${result2.detail ? `: ${result2.detail}` : ""}`);
      if (record) lines.push(
        `  inputs: ${JSON.stringify(exampleOf(store, record).inputs).slice(0, 400)}`,
        `  agent result: ${JSON.stringify(store.value(record.output))?.slice(0, 300)}`
      );
    }
    lines.push("");
  }
  const admittedIds = new Set(result.checks.flatMap((check) => check.results.map((item) => item.callId)));
  lines.push(`${subject.examples.length - admittedIds.size} of ${subject.examples.length} calls are left to the agent.`, "");
  return lines.join("\n");
}
function keepCases(text, keep) {
  const file = ts11.createSourceFile("cases.ts", text, ts11.ScriptTarget.ES2022, true, ts11.ScriptKind.TS);
  let array;
  const visit = (node) => {
    if (array) return;
    if (ts11.isVariableDeclaration(node) && ts11.isIdentifier(node.name) && node.name.text === "cases" && node.initializer) {
      let initializer = node.initializer;
      while (ts11.isAsExpression(initializer) || ts11.isSatisfiesExpression(initializer) || ts11.isParenthesizedExpression(initializer)) initializer = initializer.expression;
      if (ts11.isArrayLiteralExpression(initializer)) array = initializer;
    }
    ts11.forEachChild(node, visit);
  };
  visit(file);
  if (!array) return text;
  const kept = array.elements.filter((_element, index) => keep.includes(index)).map((element) => `  ${element.getText(file)},`);
  return `${text.slice(0, array.getStart(file))}[
${kept.join("\n")}
]${text.slice(array.getEnd())}`;
}
function saveAccepted(store, subject, text, checks, report, meta = {}, extraFiles = {}) {
  const accepted = checks.filter((check) => check.accepted).map((check) => check.position);
  if (!accepted.length) return void 0;
  const finalText = accepted.length === checks.length ? text : keepCases(text, accepted);
  const hashes = caseHashes(finalText);
  const kept = checks.filter((check) => check.accepted);
  const record = [...subject.records.values()].at(-1);
  const links = [];
  kept.forEach((check, index) => {
    for (const result of check.results) if (result.split === "training")
      links.push({ caseHash: hashes[index], callId: result.callId, role: "training", verdict: result.verdict === "error" || result.verdict === "skipped" ? null : result.verdict });
  });
  const id = store.saveCompilation({
    definitionKey: subject.key,
    definitionId: subject.definition.id,
    definitionName: subject.definition.name,
    definitionSource: subject.definition.source ?? null,
    interfaceHash: record.definition.interface,
    programRoot: record.program_root,
    files: { ...extraFiles, "cases.ts": finalText, "report.md": report, "meta.json": JSON.stringify({
      definition: subject.definition.name,
      key: subject.key,
      source: subject.definition.source ?? null,
      interface: record.definition.interface,
      calls: subject.examples.length,
      created: (/* @__PURE__ */ new Date()).toISOString(),
      ...meta
    }, null, 2) + "\n" },
    caseHashes: hashes,
    links
  });
  kept.forEach((check, index) => {
    for (const result of check.results) if (result.split === "held-out" && !["skipped"].includes(result.verdict))
      store.caseVerdict(hashes[index], result.callId, "held-out", result.verdict === "error" ? "worse" : result.verdict);
  });
  return { id, cases: kept.length };
}

// src/calls/groups.ts
import ts12 from "typescript";
function labeler(examples) {
  const byBehavior = new Set(examples.map((example) => example.behavior)).size > 1;
  return (example) => byBehavior ? example.behavior ?? "none" : example.approach;
}
function groupsOf(subject, options = {}) {
  const label = labeler(subject.examples);
  const byLabel = /* @__PURE__ */ new Map();
  for (const example of subject.examples) byLabel.set(label(example), [...byLabel.get(label(example)) ?? [], example]);
  const groups = [];
  for (const [name, list] of byLabel) {
    const training = list.filter((example) => example.split === "training");
    if (training.length < (options.minSupport ?? 3)) continue;
    const ids = new Set(list.map((example) => example.callId));
    groups.push({
      id: "",
      label: name,
      training,
      heldOut: list.length - training.length,
      approaches: subject.approaches.filter((approach) => approach.calls.some((id) => ids.has(id)))
    });
  }
  groups.sort((a, b) => b.training.length - a.training.length);
  groups.forEach((group, index) => {
    group.id = `g${index + 1}`;
  });
  return groups.slice(0, options.max ?? 8);
}
function measure(subject, group, guard) {
  const compiled = compileGuard(guard);
  const groupSize = group.training.length;
  if (!compiled) return { valid: false, error: "not a JavaScript expression over args", ofGroup: 0, groupSize, others: 0, counterexamples: [] };
  const label = labeler(subject.examples);
  const training = subject.examples.filter((example) => example.split === "training");
  const admitted = training.filter((example) => compiled.test(example.args));
  const others = admitted.filter((example) => label(example) !== group.label);
  return {
    valid: true,
    ofGroup: admitted.length - others.length,
    groupSize,
    others: others.length,
    counterexamples: others.slice(0, 5).map((example) => ({ call: example.callId, did: label(example), inputs: example.args }))
  };
}
var json2 = (value) => JSON.stringify(value, null, 2);
var fence2 = (text, language = "") => `\`\`\`${language}
${text}
\`\`\``;
var short = (value, limit) => {
  const text = JSON.stringify(value) ?? "undefined";
  return text.length > limit ? `${text.slice(0, limit)}\u2026` : text;
};
function candidateConditions(subject, group, limit = 6) {
  const measured = candidatePredicates(group.training).map((item) => ({ guard: item.text, ...measure(subject, group, item.text) })).filter((item) => item.valid && item.ofGroup >= Math.min(3, group.training.length));
  const exact = measured.filter((item) => item.others === 0).sort((a, b) => b.ofGroup - a.ofGroup || a.guard.length - b.guard.length);
  const near = measured.filter((item) => item.others > 0 && item.others <= 2 && item.ofGroup > (exact[0]?.ofGroup ?? 0)).sort((a, b) => b.ofGroup - a.ofGroup || a.others - b.others);
  return [...exact.slice(0, limit), ...near.slice(0, 2)];
}
function renderGroup(store, subject, group, functionMd, extra = {}) {
  const files = { "function.md": functionMd };
  const label = labeler(subject.examples);
  const results = /* @__PURE__ */ new Map();
  for (const example of group.training) {
    const record = subject.records.get(example.callId);
    const key = short(record ? store.value(record.output) : null, 200);
    results.set(key, (results.get(key) ?? 0) + 1);
  }
  const conditions = candidateConditions(subject, group);
  files["group.md"] = [
    `# Group ${group.id}`,
    "",
    `${group.training.length} recorded calls did this: ${group.label === "none" ? "no service call and no function call (an answer only)" : group.label}.`,
    `${group.heldOut} more are held out: the host uses them to check your case.`,
    "",
    "## Code the executor ran (normalized: $in.<path> is that input, $part.<path> a part of it, v0, v1 ... locals, $h0 ... literals that varied)",
    "",
    ...group.approaches.slice(0, 6).flatMap((approach) => [
      `- ${approach.id}, ${approach.calls.filter((id) => group.training.some((example) => example.callId === id)).length} of these calls:`,
      approach.answerOnly ? "  (no code: the executor answered directly)" : fence2(approach.template.join("\n;;\n").slice(0, 1200), "ts")
    ]),
    "",
    "## Results",
    "",
    ...[...results].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([value, n]) => `- ${n}\xD7 ${value}`),
    "",
    "## Conditions to start from",
    "",
    "Measured on the training calls of all groups. A case's condition must admit no call of another group.",
    "",
    ...conditions.length ? conditions.map((item) => `- \`${item.guard}\`: ${item.ofGroup} of ${item.groupSize} calls of this group, ${item.others} of other groups`) : ["No single test on the inputs separates this group. Look at the examples for what does."],
    ""
  ].join("\n");
  for (const example of group.training.slice(0, 6)) {
    const record = subject.records.get(example.callId);
    if (record) files[`examples/${example.callId.replace(/[^\w.-]/g, "_")}.json`] = json2(exampleOf(store, record));
  }
  const keys = (example) => new Set(Object.entries(example.features).map(([key, value]) => `${key}=${value}`));
  const mine = group.training.map(keys);
  const contrast = subject.examples.filter((example) => example.split === "training" && label(example) !== group.label).map((example) => {
    const theirs = keys(example);
    return { example, score: Math.max(0, ...mine.map((set) => [...set].filter((key) => theirs.has(key)).length)) };
  }).sort((a, b) => b.score - a.score).slice(0, 8);
  files["others.md"] = [
    "# Calls of other groups",
    "",
    "The calls most like this group's that did something else. Your condition must not admit them.",
    "",
    ...contrast.map(({ example }) => {
      const record = subject.records.get(example.callId);
      return `- inputs ${short(example.args, 300)} \u2192 did ${label(example)}, result ${short(record ? store.value(record.output) : null, 160)}`;
    }),
    ""
  ].join("\n");
  files["report.md"] = extra.report ?? "No case has been checked yet for this group.\n";
  return files;
}
function assembleCases(parts) {
  const imports = /* @__PURE__ */ new Map();
  const elements = [], included = [], errors = [];
  for (const part of parts) {
    const file = ts12.createSourceFile(`${part.id}.ts`, part.text, ts12.ScriptTarget.ES2022, true, ts12.ScriptKind.TS);
    const body = [];
    let when = false, run = false, problem;
    const partImports = [];
    for (const statement of file.statements) {
      if (ts12.isImportDeclaration(statement) && ts12.isStringLiteral(statement.moduleSpecifier)) {
        const clause = statement.importClause;
        if (clause?.isTypeOnly) continue;
        const entry = { named: [] };
        if (clause?.name) entry.default = clause.name.text;
        const bindings = clause?.namedBindings;
        if (bindings && ts12.isNamespaceImport(bindings)) entry.namespace = bindings.name.text;
        if (bindings && ts12.isNamedImports(bindings)) {
          for (const element of bindings.elements) if (!element.isTypeOnly) entry.named.push([element.name.text, (element.propertyName ?? element.name).text]);
        }
        partImports.push([statement.moduleSpecifier.text, entry]);
        continue;
      }
      let text = statement.getText(file);
      if (ts12.isVariableStatement(statement) && statement.modifiers?.some((item) => item.kind === ts12.SyntaxKind.ExportKeyword)) {
        for (const declaration of statement.declarationList.declarations)
          if (ts12.isIdentifier(declaration.name)) {
            if (declaration.name.text === "when") when = true;
            if (declaration.name.text === "run") run = true;
          }
        text = text.replace(/^export\s+/, "");
      } else if (ts12.isFunctionDeclaration(statement) && statement.modifiers?.some((item) => item.kind === ts12.SyntaxKind.ExportKeyword)) {
        if (statement.name?.text === "when") when = true;
        if (statement.name?.text === "run") run = true;
        text = text.replace(/^export\s+(default\s+)?/, "");
      } else if (ts12.isExportAssignment(statement) || ts12.isExportDeclaration(statement)) {
        problem = "export only `when` and `run`";
        break;
      }
      body.push(text);
    }
    if (!problem && (!when || !run)) problem = "case.ts must export `when` and `run`";
    for (const [module, entry] of partImports) {
      const merged = imports.get(module) ?? { named: /* @__PURE__ */ new Map() };
      if (entry.default) {
        if (merged.default && merged.default !== entry.default) problem ??= `${module} is imported under two default names`;
        merged.default = entry.default;
      }
      if (entry.namespace) {
        if (merged.namespace && merged.namespace !== entry.namespace) problem ??= `${module} is imported under two namespace names`;
        merged.namespace = entry.namespace;
      }
      for (const [local, name] of entry.named) {
        if (merged.named.has(local) && merged.named.get(local) !== name) problem ??= `${local} names two different imports`;
        merged.named.set(local, name);
      }
      if (!problem) imports.set(module, merged);
    }
    if (problem) {
      errors.push({ id: part.id, error: problem });
      continue;
    }
    elements.push(`  // ${part.id}
  (() => {
${body.map((line) => line.replace(/^/gm, "    ")).join("\n")}
    return { when, run };
  })(),`);
    included.push(part.id);
  }
  const head = [...imports].map(([module, entry]) => {
    const pieces = [
      entry.default,
      entry.namespace ? `* as ${entry.namespace}` : void 0,
      entry.named.size ? `{ ${[...entry.named].map(([local, name]) => local === name ? local : `${name} as ${local}`).join(", ")} }` : void 0
    ].filter(Boolean);
    return pieces.length ? `import ${pieces.join(", ")} from ${JSON.stringify(module)};` : `import ${JSON.stringify(module)};`;
  });
  return { text: `${head.join("\n")}${head.length ? "\n\n" : ""}export const cases = [
${elements.join("\n")}
];
`, included, errors };
}

// src/calls/findings.ts
var canonical3 = (value) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
var kind = (value) => value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
function detectFindings(store, subject) {
  const base = {
    definitionKey: subject.key,
    definitionId: subject.definition.id,
    definitionName: subject.definition.name,
    definitionSource: subject.definition.source ?? null
  };
  const findings = [];
  const byInputs = /* @__PURE__ */ new Map();
  for (const example of subject.examples) {
    const key = canonical3(example.args);
    byInputs.set(key, [...byInputs.get(key) ?? [], example]);
  }
  const split = [...byInputs.values()].filter((list) => new Set(list.map((example) => example.behavior)).size > 1);
  if (split.length) findings.push({
    ...base,
    kind: "inconsistent",
    summary: `identical inputs led to different service calls in ${split.length} case${split.length > 1 ? "s" : ""}`,
    detail: { examples: split.slice(0, 5).map((list) => ({
      inputs: list[0].args,
      did: [...new Set(list.map((example) => example.behavior))],
      calls: list.slice(0, 6).map((example) => example.callId)
    })) }
  });
  const types = /* @__PURE__ */ new Map();
  for (const record of subject.records.values()) for (const effect of record.effects) {
    const args = store.value(effect.args);
    if (!Array.isArray(args)) continue;
    args.forEach((arg, position) => {
      const at = `${effect.service}.${effect.method} argument ${position + 1}`;
      const seen = types.get(at) ?? /* @__PURE__ */ new Map();
      seen.set(kind(arg), [...seen.get(kind(arg)) ?? [], record.call_id]);
      types.set(at, seen);
    });
  }
  for (const [at, seen] of types) {
    const kinds = [...seen.keys()].filter((item) => item !== "undefined");
    if (kinds.length < 2) continue;
    findings.push({
      ...base,
      kind: "argument-types",
      summary: `${at} is passed as ${kinds.join(" or ")} in different calls`,
      detail: { argument: at, calls: Object.fromEntries([...seen].map(([type, ids]) => [type, ids.slice(0, 5)])) }
    });
  }
  return findings;
}
function betterFinding(subject, caseLabel, calls) {
  if (!calls.length) return void 0;
  return {
    definitionKey: subject.key,
    definitionId: subject.definition.id,
    definitionName: subject.definition.name,
    definitionSource: subject.definition.source ?? null,
    kind: "executor-worse",
    summary: `for calls that did ${caseLabel}, a compiled case did better than the executor (judged against the instructions)`,
    detail: { calls: calls.slice(0, 10) }
  };
}

// src/calls/corpus.ts
import { mkdirSync as mkdirSync2, writeFileSync as writeFileSync3 } from "node:fs";
import { join as join4 } from "node:path";
var README = `# Specialization corpus

Exported by \`natlang compilations export-corpus\` from a machine's call store (ts-host/src/calls/corpus.ts).

- cases.jsonl: one compiled case per line: the function (name, source, revision key, instructions, signature), the case's
  TypeScript (guard and body), its tier and counts, and the recorded calls it was checked on. Each call has its inputs,
  the agent's result and service calls, the role of the check (training, held-out, shadow, audit, served) and the
  judge's verdict (equal, equivalent, better, worse).
- declines.jsonl: one decline per line: the function, the reason (semantic, unstable, effects, no-clusters, budget,
  not-worth-it), why, and sample calls with inputs, result and what they did.
- findings.jsonl: what compiling found about the program or its executor.

Calls are from real runs on this machine; inputs may contain conversation text. Copies and derived subsets are not
independent examples. Training admission is recorded in the corpus registry, not here.
`;
function callEvidence(store, record) {
  return {
    call: record.call_id,
    executor: record.executor.kind,
    model: record.executor.model_id,
    inputs: Object.fromEntries(Object.entries({ ...record.captures, ...record.inputs }).map(([name, ref]) => [name, store.value(ref) ?? ref])),
    result: store.value(record.output) ?? record.output,
    outcome: record.outcome,
    effects: record.effects.map((effect) => ({
      call: `${effect.service}.${effect.method}`,
      args: store.value(effect.args),
      ...effect.error ? { error: effect.error } : { result: store.value(effect.result) }
    })),
    evals: record.approach.evals,
    cost: record.cost
  };
}
function exportSpecializationCorpus(store, out, options = {}) {
  mkdirSync2(out, { recursive: true });
  let calls = 0;
  const cases = [];
  for (const row of store.compilations({ definition: options.definition, status: "current", limit: 1e4 })) {
    const compilation = store.compilation(row.id);
    if (!compilation?.files["cases.ts"]) continue;
    const text = compilation.files["cases.ts"];
    const sources = caseSources(text), services = caseServices(text);
    const sample = compilation.cases.length ? store.call(store.caseCalls(compilation.cases[0].hash, void 0, 1)[0]?.call_id ?? "") : void 0;
    const definition = sample?.definition;
    for (const item of compilation.cases) {
      const links = store.caseCalls(item.hash, void 0, options.perCase ?? 40);
      const checked = links.map((link) => {
        const record = store.call(link.call_id);
        return record ? { role: link.role, verdict: link.verdict, ...callEvidence(store, record) } : void 0;
      }).filter(Boolean);
      calls += checked.length;
      cases.push(JSON.stringify({
        schema: "natlang.specialization-case/1",
        compilation: row.id,
        created: row.created_at,
        definition: {
          name: row.definition_name,
          id: row.definition_id,
          source: row.definition_source,
          key: row.definition_key,
          instructions: definition ? store.value(definition.instructions) ?? null : null,
          params: definition?.params ?? null,
          returns: definition?.returns ?? null,
          types: definition?.types ?? null
        },
        case: {
          hash: item.hash,
          position: item.position,
          source: sources[item.position] ?? null,
          services: services[item.position] ?? [],
          tier: item.tier,
          served: item.served,
          handed_off: item.handed_off,
          compared: item.compared,
          worse: item.worse,
          better: item.better,
          live_compared: item.live_compared ?? 0,
          live_worse: item.live_worse ?? 0
        },
        file: text,
        calls: checked
      }));
    }
  }
  const declines = [];
  for (const decline of store.declines(1e4)) {
    const sample = store.calls({ key: decline.definition_key, outcome: "done", executor: "agent", limit: options.perDecline ?? 8 });
    const records = sample.map((summary) => store.call(summary.call_id)).filter((record) => !!record);
    const definition = records[0]?.definition;
    if (options.definition && ![decline.definition_key, decline.definition_id, definition?.name, definition?.source].includes(options.definition)) continue;
    calls += records.length;
    declines.push(JSON.stringify({
      schema: "natlang.specialization-decline/1",
      created: decline.created_at,
      reason: decline.reason,
      why: decline.why,
      calls_at_decline: decline.calls_at_decline,
      definition: {
        name: definition?.name ?? null,
        id: decline.definition_id,
        source: definition?.source ?? null,
        key: decline.definition_key,
        instructions: definition ? store.value(definition.instructions) ?? null : null,
        params: definition?.params ?? null,
        returns: definition?.returns ?? null
      },
      calls: records.map((record) => callEvidence(store, record))
    }));
  }
  const findings = store.findings({ definition: options.definition, all: true, limit: 1e4 }).map((row) => JSON.stringify({ schema: "natlang.specialization-finding/1", ...row }));
  const write = (name, lines) => writeFileSync3(join4(out, name), lines.length ? lines.join("\n") + "\n" : "");
  write("cases.jsonl", cases);
  write("declines.jsonl", declines);
  write("findings.jsonl", findings);
  writeFileSync3(join4(out, "README.md"), README);
  return { cases: cases.length, declines: declines.length, findings: findings.length, calls, files: ["README.md", "cases.jsonl", "declines.jsonl", "findings.jsonl"] };
}

// src/calls/service.ts
function tracesService(store) {
  const call = (id) => {
    const record = store.call(id);
    if (!record) return null;
    return {
      call: record.call_id,
      definition: record.definition.name,
      executor: record.executor.kind,
      outcome: record.outcome,
      started: record.started_at,
      ms: record.cost.wall_ms,
      inputs: Object.fromEntries(Object.entries({ ...record.captures, ...record.inputs }).map(([name, ref]) => [name, store.value(ref) ?? null])),
      result: store.value(record.output) ?? null,
      effects: record.effects.map((effect) => ({
        call: `${effect.service}.${effect.method}`,
        args: store.value(effect.args) ?? null,
        ...effect.error ? { error: effect.error } : { result: store.value(effect.result) ?? null }
      })),
      evals: record.approach.evals,
      ...record.executor.case_hash ? { case: record.executor.case_hash } : {}
    };
  };
  return {
    hot: (options = {}) => store.hot({ ...options, limit: Math.min(options.limit ?? 20, 200) }),
    calls: (filter = {}) => store.calls({ ...filter, limit: Math.min(filter.limit ?? 20, 200) }),
    call,
    children: (id) => store.children(id),
    annotate: (id, kind2, value) => store.annotate(id, kind2, value, "traces-service"),
    compilation: (definition) => {
      const row = store.compilations({ definition, status: "current", limit: 1 })[0];
      const compilation = row && store.compilation(row.id);
      return compilation ? { id: compilation.id, cases: compilation.cases, source: compilation.files["cases.ts"] ?? "" } : null;
    },
    caseCalls: (hash, role, limit = 20) => store.caseCalls(hash, role, Math.min(limit, 200))
  };
}
var TRACES_DECLARATIONS = `/** A recorded call, with its values. */
export type TraceCall = { call: string; definition: string; executor: 'agent' | 'crisp' | 'crisp-agent'; outcome: string; started: string; ms: number;
  inputs: Record<string, unknown>; result: unknown; effects: { call: string; args: unknown; result?: unknown; error?: string }[];
  /** The eval programs the executor ran, in order. */ evals: string[]; case?: string };
export type CallSummary = { call_id: string; definition_name: string; executor: string; outcome: string; started_at: string; wall_ms: number;
  approach_hash: string | null };
/** Functions by how often (or how expensively) they ran. */
export function hot(options?: { program?: string; since?: string; by?: 'calls' | 'tokens' | 'wall_ms'; limit?: number }): { definition_name: string;
  definition_source: string | null; definition_key: string; calls: number; agent_calls: number; crisp_calls: number; tokens: number }[];
/** Recorded calls, newest first. definition is a function name, source path or revision key. */
export function calls(filter?: { definition?: string; outcome?: string; executor?: string; since?: string; limit?: number; after?: string }): CallSummary[];
/** One recorded call with its inputs, result, service calls and eval programs; null when it is not in the store. */
export function call(id: string): TraceCall | null;
/** The calls a call started. */
export function children(id: string): CallSummary[];
/** Attach feedback or a judgment to a call. */
export function annotate(id: string, kind: string, value: unknown): void;
/** The current compilation of a function: its cases with their numbers and its cases.ts source. */
export function compilation(definition: string): { id: string; cases: unknown[]; source: string } | null;
/** The calls linked to a case, by role (training, held-out, served, handed-off, shadow, audit). */
export function caseCalls(hash: string, role?: string, limit?: number): { call_id: string; role: string; verdict: string | null }[];
`;

// src/runtime/node.ts
var storage = new AsyncLocalStorage3();
var nodeContextStore = { current: () => storage.getStore(), run: (frame, fn) => storage.run(frame, fn) };
var nodePythonWatchdog = (buffer, ms) => new Worker2(
  `const { workerData } = require('worker_threads'); const buffer = workerData.buffer, ms = workerData.ms; ${WATCHDOG_SCRIPT}`,
  { eval: true, workerData: { buffer, ms } }
);
function nodePlatform() {
  return defaultNodePlatform ??= createNodePlatform();
}
var defaultNodePlatform;
function createNodePlatform() {
  const packages = /* @__PURE__ */ new Map();
  return {
    name: "node",
    contextStore: nodeContextStore,
    environment: (options) => new TypeScriptEnvironment({ workspace: options.workspace, network: options.network }),
    moduleRealm: () => new TypeScriptEnvironment({ mode: "retained" }),
    // Every runtime records to the machine's call store unless it says otherwise (NATLANG_CALL_STORE=off disables it);
    // inside a collector episode, to the episode's own store (episode-call-store.ts runInEpisodeCallStore).
    callStore: () => {
      const root = episodeCallStoreRoot() ?? machineStoreRoot();
      return root ? openMachineStore(root) : void 0;
    },
    builtinModules: { "natlang:learning": () => learningModule, "natlang:neuralese": () => neuraleseModule, "natlang:gepa": () => gepaModule },
    packageLoader: (specifier, task) => {
      const workspace = task?.runtime.options.workspace ?? findPackageWorkspace(process.cwd());
      if (!workspace) throw new Error(`package imports need an application package.json: ${specifier}`);
      let loader = packages.get(workspace);
      if (!loader) packages.set(workspace, loader = new WorkspaceModules(workspace));
      return loader.load(specifier);
    },
    runFolderBash: runFolderBash2,
    runFolderPython: runFolderPython2,
    get returnErrorText() {
      return process.env.NATLANG_RETURN_ERROR_TEXT;
    }
  };
}
function runFolderPython2(folder, source, host = {}, timeoutMs) {
  return runFolderPython(folder, source, { watchdog: nodePythonWatchdog, ...host }, timeoutMs);
}
function runFolderBash2(folder, command, options = {}) {
  return runFolderBash(folder, command, { ...options, python: { watchdog: nodePythonWatchdog, ...options.python } });
}
var { __natlang, createNatlangRuntime: createNatlangRuntime2, compileVirtualProject: compileVirtualProject2, projectEntry: projectEntry2, loadVirtualNatlang: loadVirtualNatlang2, loadVirtualCallables: loadVirtualCallables2 } = platformDefaults(nodePlatform);
function ownedTracingPlatform(factory, base = nodePlatform()) {
  if (typeof factory !== "function") throw new TypeError("Owned tracing evaluator factory required");
  function instantiate(mode, options) {
    const evaluator = factory(mode, options);
    if (!evaluator || evaluator.mode !== mode || typeof evaluator.authority !== "string" || !evaluator.authority.startsWith("owned-") || typeof evaluator.execute !== "function" || typeof evaluator.executeAsync !== "function" || typeof evaluator.evaluateModule !== "function" || typeof evaluator.close !== "function" || typeof evaluator.fork !== "function")
      throw new TypeError("Owned tracing factory returned an incompatible evaluator; native fallback forbidden");
    if (evaluator.scopeCapabilities?.allowNetwork)
      throw new TypeError("An owned tracing evaluator cannot declare ambient network access");
    return evaluator;
  }
  return { ...base, environment: (options) => instantiate("fresh", options), moduleRealm: () => instantiate("retained") };
}
function selectedSemanticPlatform(factory, base = nodePlatform()) {
  if (typeof factory !== "function") throw new TypeError("Selected semantic evaluator factory required");
  const instantiate = (mode, options) => {
    const driver = factory(mode, options);
    if (!driver || driver.mode !== mode || typeof driver.authority !== "string" || !driver.authority.startsWith("selected-semantic/") || typeof driver.executeAsync !== "function" || typeof driver.evaluateModuleAsync !== "function" || typeof driver.fork !== "function" || typeof driver.close !== "function")
      throw new TypeError("Selected semantic driver needs async entry and async module execution");
    if (driver.scopeCapabilities?.allowNetwork)
      throw new TypeError("Ambient network access is not a selected capability grant");
    driver.configureNativeBindings?.({
      adaptValue: (value) => selectedNativeSurface(selectedServiceSurface(value)),
      resourceIdentity: selectedNativeIdentity,
      resourceCleanup: selectedNativeCleanup
    });
    let closed = false;
    const check = () => {
      if (closed) throw new EvalFailure("Selected semantic environment is closed", []);
    };
    const evaluate2 = async (work) => {
      check();
      try {
        const result = await work();
        check();
        return result;
      } catch (error) {
        if (error instanceof EvalFailure) throw error;
        const failure = error;
        throw new EvalFailure(
          typeof failure?.message === "string" ? failure.message : String(error),
          Array.isArray(failure?.events) ? failure.events : [],
          {
            ...failure?.debug && typeof failure.debug === "object" ? failure.debug : {},
            ...typeof failure?.stack === "string" ? { sourceStack: failure.stack } : {}
          }
        );
      }
    };
    return {
      authority: driver.authority,
      mode,
      scopeCapabilities: { allowModules: true, allowNetwork: false },
      execute() {
        throw new Error("Selected semantic execution is asynchronous; use executeAsync");
      },
      executeAsync(request) {
        return evaluate2(() => driver.executeAsync(request));
      },
      evaluateModule() {
        throw new Error("Selected semantic module initialization is asynchronous; use moduleInstanceAsync");
      },
      evaluateModuleAsync(code, bindings) {
        return evaluate2(() => driver.evaluateModuleAsync(code, bindings));
      },
      declarationOf(name) {
        return driver.declarationOf?.(name);
      },
      fork() {
        check();
        return instantiate("fresh", options);
      },
      close() {
        if (!closed) {
          closed = true;
          driver.close();
        }
      }
    };
  };
  return { ...base, environment: (options) => instantiate("fresh", options), moduleRealm: () => instantiate("retained") };
}
function hybridTracingPlatform(factory, options = {}, base = nodePlatform()) {
  if (typeof factory !== "function") throw new TypeError("Hybrid owned evaluator factory required");
  if (!options || typeof options !== "object" || options.route !== void 0 && typeof options.route !== "function" || options.onNativeExecution !== void 0 && typeof options.onNativeExecution !== "function")
    throw new TypeError("Invalid hybrid tracing options");
  const route = options.route ?? (() => "owned");
  function instantiate(mode, runtimeOptions) {
    const owned = factory(mode, runtimeOptions);
    if (!owned || owned.mode !== mode || !owned.authority?.startsWith("owned-") || typeof owned.execute !== "function" || typeof owned.executeAsync !== "function" || typeof owned.evaluateModule !== "function" || typeof owned.close !== "function" || typeof owned.fork !== "function")
      throw new TypeError("Hybrid tracing factory returned an incompatible owned evaluator");
    let closed = false;
    const choose = (kind2, code, path) => {
      if (closed) throw new Error("Hybrid tracing environment is closed");
      const decision = route({ kind: kind2, mode, code, path });
      if (decision !== "owned" && decision !== "native")
        throw new TypeError("Hybrid tracing route must return owned or native");
      if (decision === "native")
        throw new Error("Trace required: native execution has no owned semantic archive");
      return decision;
    };
    return {
      authority: "owned-trace-required/1",
      mode,
      scopeCapabilities: { allowModules: false, allowNetwork: false },
      execute(request) {
        if (choose("execute", request.code, request.path) === "owned")
          return owned.execute(request);
        throw new Error("Trace required: native execution has no owned semantic archive");
      },
      async executeAsync(request) {
        if (choose("executeAsync", request.code, request.path) === "owned")
          return owned.executeAsync(request);
        throw new Error("Trace required: native execution has no owned semantic archive");
      },
      evaluateModule(code, bindings) {
        if (choose("evaluateModule", code) === "owned")
          return owned.evaluateModule(code, bindings);
        throw new Error("Trace required: native execution has no owned semantic archive");
      },
      declarationOf(name) {
        return owned.declarationOf?.(name);
      },
      fork() {
        return instantiate("fresh", runtimeOptions);
      },
      close() {
        if (closed) return;
        closed = true;
        owned.close();
      }
    };
  }
  return { ...base, environment: (options2) => instantiate("fresh", options2), moduleRealm: () => instantiate("retained") };
}
function observedNativeTracingPlatform(onTrace, base = nodePlatform()) {
  if (typeof onTrace !== "function") throw new TypeError("Native trace observer required");
  function instantiate(mode, runtimeOptions) {
    const native = new TypeScriptEnvironment({
      mode,
      workspace: runtimeOptions?.workspace,
      network: runtimeOptions?.network
    });
    let closed = false;
    let invocationSequence = 0;
    const observeExports = (bindings) => {
      const exportsValue = bindings.module?.exports ?? bindings.exports;
      if (!exportsValue || typeof exportsValue !== "object") return;
      for (const key of Reflect.ownKeys(exportsValue)) {
        const descriptor = Reflect.getOwnPropertyDescriptor(exportsValue, key);
        if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "function" || !descriptor.configurable || !descriptor.writable) continue;
        const name = typeof key === "symbol" ? key.toString() : key;
        const original = descriptor.value;
        const wrap = new Proxy(original, {
          apply(target, thisArg, args) {
            const id = ++invocationSequence;
            onTrace({
              schema: "natlang-native-observation/1",
              phase: "start",
              kind: "exportCall",
              mode,
              code: "",
              exportName: name,
              invocationId: id
            });
            try {
              const value = Reflect.apply(target, thisArg, args);
              onTrace({
                schema: "natlang-native-observation/1",
                phase: "completed",
                kind: "exportCall",
                mode,
                code: "",
                exportName: name,
                invocationId: id,
                completion: "returned"
              });
              if (value instanceof Promise) {
                value.then(
                  () => {
                    try {
                      onTrace({
                        schema: "natlang-native-observation/1",
                        phase: "settled",
                        kind: "exportCall",
                        mode,
                        code: "",
                        exportName: name,
                        invocationId: id,
                        completion: "fulfilled"
                      });
                    } catch {
                    }
                  },
                  (error) => {
                    try {
                      onTrace({
                        schema: "natlang-native-observation/1",
                        phase: "settled",
                        kind: "exportCall",
                        mode,
                        code: "",
                        exportName: name,
                        invocationId: id,
                        completion: "rejected",
                        error: error instanceof Error ? error.message : String(error)
                      });
                    } catch {
                    }
                  }
                );
              }
              return value;
            } catch (error) {
              onTrace({
                schema: "natlang-native-observation/1",
                phase: "failed",
                kind: "exportCall",
                mode,
                code: "",
                exportName: name,
                invocationId: id,
                error: error instanceof Error ? error.message : String(error)
              });
              throw error;
            }
          },
          construct(target, args, newTarget) {
            const id = ++invocationSequence;
            onTrace({
              schema: "natlang-native-observation/1",
              phase: "start",
              kind: "exportCall",
              mode,
              code: "",
              exportName: name,
              invocationId: id
            });
            try {
              const value = Reflect.construct(target, args, newTarget);
              onTrace({
                schema: "natlang-native-observation/1",
                phase: "completed",
                kind: "exportCall",
                mode,
                code: "",
                exportName: name,
                invocationId: id,
                completion: "returned"
              });
              return value;
            } catch (error) {
              onTrace({
                schema: "natlang-native-observation/1",
                phase: "failed",
                kind: "exportCall",
                mode,
                code: "",
                exportName: name,
                invocationId: id,
                error: error instanceof Error ? error.message : String(error)
              });
              throw error;
            }
          }
        });
        Reflect.defineProperty(exportsValue, key, { ...descriptor, value: wrap });
      }
    };
    const emit = (phase, kind2, code, path, error) => {
      const record = {
        schema: "natlang-native-observation/1",
        phase,
        kind: kind2,
        mode,
        code,
        path,
        ...error === void 0 ? {} : { error: error instanceof Error ? error.message : String(error) }
      };
      onTrace(record);
    };
    const start = (kind2, code, path) => {
      if (closed) throw new Error("Observed native environment is closed");
      emit("start", kind2, code, path);
    };
    return {
      authority: "native-observed/1",
      mode,
      scopeCapabilities: { allowModules: true, allowNetwork: Boolean(runtimeOptions?.network) },
      execute(request) {
        start("execute", request.code, request.path);
        try {
          const result = native.execute(request);
          emit("completed", "execute", request.code, request.path);
          return { ...result, events: [
            {
              operation: "execution.provenance",
              authority: "native-observed/1",
              traceSchema: "natlang-native-observation/1"
            },
            ...result.events
          ] };
        } catch (error) {
          emit("failed", "execute", request.code, request.path, error);
          throw error;
        }
      },
      async executeAsync(request) {
        start("executeAsync", request.code, request.path);
        try {
          const result = await native.executeAsync(request);
          emit("completed", "executeAsync", request.code, request.path);
          return { ...result, events: [
            {
              operation: "execution.provenance",
              authority: "native-observed/1",
              traceSchema: "natlang-native-observation/1"
            },
            ...result.events
          ] };
        } catch (error) {
          emit("failed", "executeAsync", request.code, request.path, error);
          throw error;
        }
      },
      evaluateModule(code, bindings) {
        start("evaluateModule", code);
        try {
          const result = native.evaluateModule(code, bindings);
          observeExports(bindings);
          emit("completed", "evaluateModule", code);
          return result;
        } catch (error) {
          emit("failed", "evaluateModule", code, void 0, error);
          throw error;
        }
      },
      declarationOf(name) {
        return native.declarationOf(name);
      },
      fork() {
        return instantiate("fresh", runtimeOptions);
      },
      close() {
        if (!closed) {
          closed = true;
          native.close();
        }
      }
    };
  }
  return { ...base, environment: (options) => instantiate("fresh", options), moduleRealm: () => instantiate("retained") };
}

// src/runtime/node-files.ts
function nodeSourceFiles(root = process.cwd()) {
  const base = resolve6(root);
  return {
    join: join5,
    dirname: dirname4,
    basename: basename2,
    extname: extname2,
    isFile: (path) => existsSync4(path) && statSync2(path).isFile(),
    isDirectory: (path) => existsSync4(path) && statSync2(path).isDirectory(),
    read: (path) => readFileSync3(path, "utf8"),
    list: readdirSync,
    readBytes: (path) => new Uint8Array(readFileSync3(path)),
    relative: (path) => relative2(base, resolve6(path)).split("\\").join("/")
  };
}
function loadNatlang(path, root = dirname4(resolve6(path)), options = {}) {
  const absolute = resolve6(path);
  const name = basename2(absolute, ".nl");
  const home = options.platform ?? nodePlatform();
  if (!options.live) return namedCallable(name, loadNamedFunction(absolute, nodeSourceFiles(root)), void 0, home);
  return liveCallable(name, () => {
    const watched = /* @__PURE__ */ new Map();
    const callable = namedCallable(name, loadNamedFunction(absolute, watchedSourceFiles(nodeSourceFiles(root), watched)), void 0, home);
    return { callable, watched };
  });
}
function sourceState(path) {
  if (!existsSync4(path)) return "absent";
  const stat = statSync2(path);
  return stat.isDirectory() ? `dir:${readdirSync(path).sort().join("/")}` : `file:${stat.size}:${stat.mtimeMs}`;
}
function watchedSourceFiles(files, watched) {
  const watch = (path, value) => {
    if (!watched.has(path)) watched.set(path, sourceState(path));
    return value;
  };
  return {
    ...files,
    isFile: (path) => watch(path, files.isFile(path)),
    isDirectory: (path) => watch(path, files.isDirectory(path)),
    read: (path) => watch(path, files.read(path)),
    ...files.readBytes ? { readBytes: (path) => watch(path, files.readBytes(path)) } : {},
    list: (path) => watch(path, files.list(path))
  };
}
function liveCallable(name, load2) {
  let current = load2(), reported;
  const fresh = () => {
    if ([...current.watched].some(([path, state]) => sourceState(path) !== state)) {
      try {
        current = load2();
        reported = void 0;
        rememberRecord(live2, recordOf(current.callable));
        syncChildren();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message !== reported) console.warn(`natlang: ${name} keeps its last definition; the changed sources do not load: ${message}`);
        reported = message;
      }
    }
    return current.callable;
  };
  const meta = callableMeta(current.callable);
  const live2 = makeCallable({ ...meta, invoke: (args, frame, at) => callableMeta(fresh()).invoke(args, frame, at) });
  for (const key of ["definition", "captures"]) if (key in meta)
    Object.defineProperty(callableMeta(live2), key, { get: () => callableMeta(current.callable)[key], enumerable: true });
  const children = /* @__PURE__ */ new Set();
  const syncChildren = () => {
    for (const child of Object.keys(current.callable)) if (!children.has(child)) {
      children.add(child);
      Object.defineProperty(live2, child, { get: () => fresh()[child], enumerable: true });
    }
  };
  rememberRecord(live2, recordOf(current.callable));
  syncChildren();
  return live2;
}
function loadCallables(dir, root = dirname4(resolve6(dir)), platform = nodePlatform()) {
  return callableTree(loadCallableFolder(resolve6(dir), nodeSourceFiles(root)), void 0, platform);
}
function applicationContextRecords(start, root) {
  const files = nodeSourceFiles(root ?? start);
  const dir = findApplicationContext(resolve6(start), files);
  return dir ? { dir, records: loadCallableFolder(dir, nodeSourceFiles(root ?? dirname4(dir))) } : void 0;
}
function fileTraceSink(dir) {
  const fileOf = (callId) => join5(dir, `${callId.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 160)}.jsonl`);
  const written = /* @__PURE__ */ new Map();
  const sink = (trace) => {
    mkdirSync3(dir, { recursive: true });
    written.delete(trace.callId);
    writeFileSync4(fileOf(trace.callId), trace.events.map((event) => JSON.stringify(event)).join("\n") + "\n");
  };
  return Object.assign(sink, { stream(callId, events) {
    const from = written.get(callId) ?? 0;
    if (events.length <= from) return;
    if (!from) mkdirSync3(dir, { recursive: true });
    appendFileSync(fileOf(callId), events.slice(from).map((event) => JSON.stringify(event)).join("\n") + "\n", { flag: from ? "a" : "w" });
    written.set(callId, events.length);
  } });
}

export {
  compileProject,
  formatDiagnostics,
  episodeCallStoreRoot,
  enterEpisodeCallStore,
  constructorRealm,
  RealmEnvironment,
  loadVirtualNatlang,
  loadVirtualCallables,
  CallStore,
  machineStoreRoot,
  openMachineStore,
  frontier,
  wonCases,
  draw,
  pick,
  better,
  prune,
  componentProblem,
  realmPlatform,
  sanitizeDecision,
  promotionPolicy,
  reviewPromotions,
  SelectedEventQueue,
  foldSelectedEvents,
  mapSelectedEvents,
  hostCaptures,
  ReplayDivergence,
  sameData,
  subtreeEffects,
  ReplayServices,
  recordedArguments,
  replay,
  recordedBehavior,
  compareBehaviors,
  judge,
  behaviorLabel,
  splitOf,
  approaches,
  accessor,
  compileGuard,
  candidatePredicates,
  induceRules,
  measureGuard,
  nodeSourceFiles,
  loadNatlang,
  loadCallables,
  applicationContextRecords,
  fileTraceSink,
  definitionFor,
  signatureOf,
  caseFor,
  replayCaseOn,
  rerunAgent,
  verdictFor,
  runJob,
  runJobs,
  study,
  crispDecline,
  renderEvidence,
  renderFunction,
  exampleOf,
  renderHistory,
  verifyCases,
  renderReport,
  keepCases,
  saveAccepted,
  labeler,
  groupsOf,
  measure,
  candidateConditions,
  renderGroup,
  assembleCases,
  detectFindings,
  betterFinding,
  exportSpecializationCorpus,
  tracesService,
  TRACES_DECLARATIONS,
  nodePlatform,
  runFolderPython2 as runFolderPython,
  runFolderBash2 as runFolderBash,
  __natlang,
  createNatlangRuntime2 as createNatlangRuntime,
  compileVirtualProject2 as compileVirtualProject,
  projectEntry2 as projectEntry,
  loadVirtualNatlang2,
  loadVirtualCallables2,
  ownedTracingPlatform,
  selectedSemanticPlatform,
  hybridTracingPlatform,
  observedNativeTracingPlatform,
  node_exports
};
