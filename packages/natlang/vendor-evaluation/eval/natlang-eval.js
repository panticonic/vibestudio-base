import {
  EvaluationInfrastructureError,
  EvidenceView,
  FixtureObservationStore,
  WEIGHTS_SCHEMA,
  WeightManifestError,
  candidateArtifact,
  createResolvedModelSession,
  evaluate,
  executorIdentityForChoice,
  loadModelConfiguration,
  localModelPrerequisites,
  manifestDigest,
  parseManifest,
  preflightEvaluation,
  sealManifest,
  sessionDriver,
  summarize,
  validateManifest,
  validateMetrics
} from "./chunk-chunk-V72OLIJD.js";
import {
  AUTHORED_IMPROVER
} from "./chunk-chunk-4S4AEQC2.js";
import {
  buildProject,
  defineEvaluationSuite,
  loadEvaluationSuite,
  nodeProjectFiles,
  prepareEvaluationSuite,
  validateBudget,
  validateCases
} from "./chunk-chunk-KJPRUOSK.js";
import "./chunk-chunk-URFGSJ3U.js";
import {
  CallStore,
  RealmEnvironment,
  ReplayDivergence,
  ReplayServices,
  SelectedEventQueue,
  TRACES_DECLARATIONS,
  __natlang,
  accessor,
  applicationContextRecords,
  approaches,
  assembleCases,
  behaviorLabel,
  better,
  betterFinding,
  candidateConditions,
  candidatePredicates,
  caseFor,
  compareBehaviors,
  compileGuard,
  compileVirtualProject,
  componentProblem,
  constructorRealm,
  createNatlangRuntime,
  crispDecline,
  definitionFor,
  detectFindings,
  draw,
  exampleOf,
  exportSpecializationCorpus,
  fileTraceSink,
  foldSelectedEvents,
  formatDiagnostics,
  frontier,
  groupsOf,
  hostCaptures,
  hybridTracingPlatform,
  induceRules,
  judge,
  keepCases,
  labeler,
  loadCallables,
  loadNatlang,
  loadVirtualCallables2 as loadVirtualCallables,
  loadVirtualNatlang,
  loadVirtualNatlang2,
  machineStoreRoot,
  mapSelectedEvents,
  measure,
  measureGuard,
  nodePlatform,
  nodeSourceFiles,
  observedNativeTracingPlatform,
  openMachineStore,
  ownedTracingPlatform,
  pick,
  projectEntry,
  promotionPolicy,
  prune,
  realmPlatform,
  recordedArguments,
  recordedBehavior,
  renderEvidence,
  renderFunction,
  renderGroup,
  renderHistory,
  renderReport,
  replay,
  replayCaseOn,
  rerunAgent,
  reviewPromotions,
  runFolderBash,
  runFolderPython,
  runJob,
  runJobs,
  sameData,
  sanitizeDecision,
  saveAccepted,
  selectedSemanticPlatform,
  signatureOf,
  splitOf,
  study,
  subtreeEffects,
  tracesService,
  verdictFor,
  verifyCases,
  wonCases
} from "./chunk-chunk-V5SNWGZ5.js";
import "./chunk-chunk-JJ6NRDGL.js";
import {
  ADAPTATION_SCHEMA,
  AUDIT_MINIMUM,
  AdaptationError,
  BudgetExhausted,
  CALLS_VERSION,
  CALL_MINIMUM,
  CallCapture,
  CompilationCache,
  Context,
  ContextError,
  CrispTier,
  DEFAULT_SETTINGS,
  Deopt,
  FileHandle,
  Folder,
  FolderHandle,
  FolderIteration,
  FolderSnapshot,
  ImplementationTier,
  Iteration,
  IterationDivergedError,
  IterationLimitError,
  IterationStepError,
  MemoryIterationStatistics,
  MemoryVerdictCache,
  ModelTier,
  ModuleUnavailableError,
  NatlangCallError,
  NatlangContextError,
  NatlangPlatformUnavailableError,
  NatlangRecursionError,
  NatlangRuntime,
  NatlangTask,
  NeuraleseTier,
  NzFileError,
  ProgramView,
  RECENT,
  ROOT_NODE,
  RefinementCallError,
  RefinementChecker,
  RefinementError,
  SYSTEM_PROMPT,
  SlotContextStore,
  SpecializedTier,
  TierEngine,
  TierLedger,
  UsageGateway,
  VALUE_CLASSES,
  WeightBinding,
  WeightBindingError,
  admit,
  applyDecision,
  approachHash,
  artifactDigest,
  assume,
  authoredTextGuidance,
  bindAdaptation,
  bindingSemanticHash,
  builtin,
  builtinDefinition,
  builtinNames,
  builtinRecords,
  callFailureReason,
  callableTree,
  canonicalValue,
  caseHashes,
  caseServices,
  caseSources,
  cloneData,
  compileScopeTree,
  componentKey,
  contextInterface,
  crispPolicy,
  currentFrame,
  decide,
  decisionJudge,
  decodeNz,
  defaultProgressJudge,
  defineNatlang,
  definitionKey,
  emptyEvidence,
  encodeNz,
  excluded,
  failureKind,
  fingerprint,
  foldEvent,
  guidanceForCall,
  handoffNote,
  importedNativeArtifacts,
  inputFeatures,
  inputLeaves,
  inspectComponents,
  interfaceHash,
  invokeAt,
  invokeDefinition,
  isDeopt,
  isModelEvidence,
  isModelOutcomeFailure,
  isNatlangCallable,
  iterateOn,
  ladderOf,
  live,
  loadCases,
  loadNz,
  loadNzSync,
  modelTurnsSoFar,
  moveTier,
  namedCallable,
  nativeProgramGuidance,
  newTierEvidence,
  nl,
  normalizeProgram,
  nzExports,
  parseAdaptation,
  parseRefinementSettings,
  parseStrictJSON,
  pluggable,
  pluggableMode,
  programGuidance,
  programGuidanceIdentity,
  programGuidanceProgram,
  rebind,
  recordingServices,
  refine,
  refinements,
  resolveFrame,
  ruleOf,
  runTiered,
  save,
  saveNz,
  setTierState,
  snapshot,
  softFunction,
  softFunctionOf,
  specializerOutput,
  stackIdentity,
  summaryOfTier,
  tokens,
  untrusted,
  validateAdaptation,
  validateCandidate,
  wrapDriver
} from "./chunk-chunk-7RHMLU3S.js";
import "./chunk-chunk-WRUGMGG2.js";
import {
  canonical
} from "./chunk-chunk-Y6L7V2T3.js";
import "./chunk-chunk-YDKDWV2X.js";
import "./chunk-chunk-KX6VIJEB.js";

// src/evaluation/constraints.ts
var words = (text) => text.match(/[\p{L}\p{N}'’-]+/gu) ?? [];
var lowerWords = (text) => words(text).map((w) => w.toLowerCase());
var sentences = (text) => text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => words(s).length > 0);
var paragraphs = (text) => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
var bullets = (text) => text.split("\n").filter((line) => /^\s*[-*•]\s+\S/.test(line));
var normalizeEditText = (text) => text.normalize("NFC").replace(/\r\n?/g, "\n").replace(/[\u2018\u2019\u201b]/g, "'").replace(/[\u201c\u201d\u201f]/g, '"').replace(/[\u00a0\u2007\u202f]/g, " ").trim();
var editTokens = (text) => normalizeEditText(text).match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? [];
var nameCount = (text, name, flags) => (text.match(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, flags)) ?? []).length;
function tokenDistance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return Infinity;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...row) > limit) return Infinity;
    previous = row;
  }
  return previous[b.length];
}
var fourGrams = (tokens2) => new Set(tokens2.map((t) => t.toLowerCase()).flatMap((_, i, all) => i + 4 <= all.length ? [all.slice(i, i + 4).join(" ")] : []));
function editFidelityProblems(text, c) {
  const problems = [];
  const reference = c.paragraphs.map((p) => editTokens(p));
  const candidate = normalizeEditText(text);
  const split = (pattern) => candidate.split(pattern).map((p) => p.trim()).filter(Boolean);
  let paragraphs2 = split(/\n\s*\n/);
  if (paragraphs2.length !== reference.length) {
    const lines = split(/\n+/);
    if (lines.length === reference.length) paragraphs2 = lines;
  }
  if (paragraphs2.length !== reference.length)
    problems.push(`has ${paragraphs2.length} paragraphs where the edited document has ${reference.length}`);
  else paragraphs2.forEach((paragraph, i) => {
    const want = reference[i], limit = Math.floor(c.tolerance * want.length);
    const got = editTokens(paragraph);
    if (got.length > 2 * want.length + 8 || tokenDistance(got, want, limit) > limit)
      problems.push(`paragraph ${i + 1} is not the edited document's paragraph ${i + 1}`);
  });
  const referenceText = c.paragraphs.join("\n\n");
  for (const { from, to } of c.renames) for (const name of [from, to]) for (const flags of ["g", "gi"]) {
    const got = nameCount(candidate, name, flags), want = nameCount(referenceText, name, flags);
    if (got !== want) {
      problems.push(`"${name}" occurs ${got} times where the edited document has it ${want} times${flags === "gi" ? " (ignoring case)" : ""}`);
      break;
    }
  }
  const kept = fourGrams(reference.flat()), present = fourGrams(editTokens(candidate));
  c.deleted.forEach((paragraph, i) => {
    const distinctive = [...fourGrams(editTokens(paragraph))].filter((gram) => !kept.has(gram));
    if (distinctive.some((gram) => present.has(gram))) problems.push(`text of deleted paragraph ${i + 1} remains`);
  });
  return problems;
}
function holds(text, c) {
  switch (c.kind) {
    case "edit_fidelity":
      return editFidelityProblems(text, c).length === 0;
    case "word_count": {
      const n = words(text).length;
      return (c.min === void 0 || n >= c.min) && (c.max === void 0 || n <= c.max);
    }
    case "sentence_count": {
      const n = sentences(text).length;
      return (c.min === void 0 || n >= c.min) && (c.max === void 0 || n <= c.max);
    }
    case "paragraph_count":
      return paragraphs(text).length === c.count;
    case "bullet_count":
      return bullets(text).length === c.count;
    case "include_words": {
      const present = new Set(lowerWords(text));
      return c.words.every((w) => lowerWords(w).every((part) => present.has(part)));
    }
    case "exclude_words": {
      const present = new Set(lowerWords(text));
      return c.words.every((w) => !lowerWords(w).every((part) => present.has(part)));
    }
    case "word_frequency":
      return lowerWords(text).filter((w) => w === c.word.toLowerCase()).length >= c.min;
    case "starts_with":
      return text.trimStart().startsWith(c.text);
    case "ends_with":
      return text.trimEnd().endsWith(c.text);
    case "no_commas":
      return !text.includes(",");
    case "all_lowercase":
      return text === text.toLowerCase() && new RegExp("\\p{L}", "u").test(text);
    case "title":
      return /<<[^<>\n]+>>/.test(text);
    case "placeholders":
      return (text.match(/\[[^\[\]\n]+\]/g) ?? []).length >= c.min;
    case "json_keys": {
      try {
        const body2 = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const value = JSON.parse(body2);
        return value !== null && typeof value === "object" && !Array.isArray(value) && c.keys.every((k) => k in value);
      } catch {
        return false;
      }
    }
  }
}
function checkConstraints(text, constraints) {
  if (typeof text !== "string") return { passed: false, score: 0, failed: ["the answer is not text"] };
  const failed = constraints.filter((c) => !holds(text, c)).map(describeConstraint);
  return { passed: failed.length === 0, score: constraints.length ? 1 - failed.length / constraints.length : 1, failed };
}
function describeConstraint(c) {
  switch (c.kind) {
    case "word_count":
      return c.min !== void 0 && c.max !== void 0 ? `Use between ${c.min} and ${c.max} words.` : c.min !== void 0 ? `Use at least ${c.min} words.` : `Use at most ${c.max} words.`;
    case "sentence_count":
      return c.min !== void 0 && c.max !== void 0 ? c.min === c.max ? `Write exactly ${c.min} sentences.` : `Write between ${c.min} and ${c.max} sentences.` : c.min !== void 0 ? `Write at least ${c.min} sentences.` : `Write at most ${c.max} sentences.`;
    case "paragraph_count":
      return `Write exactly ${c.count} paragraphs, separated by a blank line.`;
    case "bullet_count":
      return `Include exactly ${c.count} bullet points, each on its own line starting with "- ".`;
    case "include_words":
      return `Use these words: ${c.words.map((w) => `"${w}"`).join(", ")}.`;
    case "exclude_words":
      return `Do not use these words: ${c.words.map((w) => `"${w}"`).join(", ")}.`;
    case "word_frequency":
      return `Use the word "${c.word}" at least ${c.min} times.`;
    case "starts_with":
      return `Start with exactly: ${JSON.stringify(c.text)}.`;
    case "ends_with":
      return `End with exactly: ${JSON.stringify(c.text)}.`;
    case "no_commas":
      return "Do not use any commas.";
    case "all_lowercase":
      return "Write everything in lowercase letters.";
    case "title":
      return "Give it a title wrapped in double angle brackets, like <<title>>.";
    case "placeholders":
      return `Include at least ${c.min} placeholders in square brackets, like [name].`;
    case "json_keys":
      return `Answer with a JSON object that has the keys ${c.keys.map((k) => `"${k}"`).join(", ")}.`;
    case "edit_fidelity":
      return "Return the whole document with exactly the requested edits applied and nothing else changed.";
  }
}

// src/oracle-kit/json-record.ts
function canonical2(value) {
  if (Array.isArray(value)) return `[${value.map(canonical2).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical2(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
function jsonStringRecordCanonical(value) {
  if (typeof value !== "string") return null;
  const string = String.raw`"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*"`;
  const pair = `${string}\\s*:\\s*${string}`;
  if (!new RegExp(`^\\s*\\{\\s*(?:${pair}(?:\\s*,\\s*${pair})*)?\\s*\\}\\s*$`).test(value)) return null;
  try {
    const names = /* @__PURE__ */ new Set();
    for (const match of value.matchAll(new RegExp(`(${string})\\s*:\\s*${string}`, "g"))) {
      const key = JSON.parse(match[1]);
      if (names.has(key)) return null;
      names.add(key);
    }
    return canonical2(JSON.parse(value));
  } catch {
    return null;
  }
}

// src/oracle-kit/decimal.ts
var DECIMAL_NUMERIC = /^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?|\.\d+)$/;
function decimalForms(value) {
  if (value.length > 512 || !DECIMAL_NUMERIC.test(value)) return null;
  const negative = value.startsWith("-");
  const unsigned = value.replace(/^[+-]/, "").replace(/,/g, "");
  const [wholeRaw = "0", fractionRaw = ""] = unsigned.split(".");
  const whole = wholeRaw || "0";
  const digits = `${whole}${fractionRaw}`.replace(/^0+(?=\d)/, "");
  const normalizedExact = (() => {
    let d = digits, scale = fractionRaw.length;
    while (scale > 0 && d.endsWith("0")) {
      d = d.slice(0, -1);
      scale--;
    }
    if (!d) d = "0";
    return `${negative && d !== "0" ? "-" : ""}${d}:${scale}`;
  })();
  const magnitude = BigInt(digits || "0");
  if (fractionRaw.length <= 2) {
    const cents2 = magnitude * 10n ** BigInt(2 - fractionRaw.length);
    return { exact: normalizedExact, rounded: `${negative && cents2 !== 0n ? "-" : ""}${cents2}` };
  }
  const scaleFactor = 10n ** BigInt(fractionRaw.length - 2);
  let cents = magnitude / scaleFactor;
  const remainder = magnitude % scaleFactor;
  const half = scaleFactor / 2n;
  const tie = remainder === half;
  if (remainder > half) cents++;
  return {
    exact: normalizedExact,
    rounded: tie ? null : `${negative && cents !== 0n ? "-" : ""}${cents}`
  };
}

// src/oracle-kit/oracle-registry.ts
var comparators = /* @__PURE__ */ new Map();
function recordComparator(name) {
  return typeof name === "string" ? comparators.get(name) : void 0;
}
function assertKnownComparator(kind, name, builtin2) {
  if (name === void 0 || typeof name === "string" && (builtin2.includes(name) || comparators.has(name))) return;
  throw new RangeError(`unknown ${kind} "${String(name)}": not built in and no benchmark registered it (import benchmarks/builtin.js, or register it with registerRecordComparator)`);
}

// src/evaluation/answer-sets.ts
var ANSWER_SET_NORMALIZATIONS = ["result-set", "numeric-tolerance", "answer-list", "qa-alias-map"];
var NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
function readNumber(value, loose = false) {
  if (typeof value === "number") return Number.isFinite(value) ? value : void 0;
  if (typeof value !== "string") return void 0;
  let text = value.normalize("NFKC").trim().replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, "");
  if (loose) text = text.replace(/^\$\s*/, "").replace(/^\((.*)\)$/, "-$1").replace(/\s*(?:%|percent)$/i, "").trim();
  return NUMBER.test(text) ? Number(text) : void 0;
}
function cell(value) {
  if (value === null || value === void 0) return "null";
  if (typeof value === "boolean") return `n:${value ? 1 : 0}`;
  const number = readNumber(value);
  if (number !== void 0) return `n:${Number(number.toPrecision(9))}`;
  if (typeof value === "string") return `s:${value.normalize("NFKC").trim()}`;
  return `j:${canonical2(value)}`;
}
function rows(value) {
  if (!Array.isArray(value)) return value !== null && typeof value === "object" ? void 0 : [[cell(value)]];
  return value.map((row) => Array.isArray(row) ? row.map(cell) : row !== null && typeof row === "object" ? Object.values(row).map(cell) : [cell(row)]);
}
function resultSetEqual(actual, expected, ordered = false) {
  const left = rows(actual), right = rows(expected);
  if (!left || !right || left.length !== right.length) return false;
  const key = (table) => {
    const lines = table.map((row) => JSON.stringify(row));
    return ordered ? lines : lines.sort();
  };
  return canonical2(key(left)) === canonical2(key(right));
}
function numericClose(actual, expected, spec = {}) {
  const got = readNumber(actual, true), want = readNumber(expected, true);
  if (got === void 0 || want === void 0) return false;
  const relative2 = spec.tolerance ?? 1e-4, absolute = spec.abs_tolerance ?? 0;
  const close = (a, b) => Math.abs(a - b) <= Math.max(absolute, relative2 * Math.max(Math.abs(a), Math.abs(b)));
  return close(got, want) || !!spec.percent_equivalent && (close(got, want * 100) || close(got * 100, want));
}
function shortAnswer(value) {
  const number = readNumber(value);
  if (number !== void 0) return `n:${Number(number.toPrecision(9))}`;
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("en-US").replace(/[\p{P}\p{S}]/gu, " ").split(/\s+/u).filter((token) => token && !["a", "an", "the"].includes(token)).join(" ");
}
function answerListEqual(actual, expected) {
  const want = (Array.isArray(expected) ? expected : [expected]).map(shortAnswer).sort();
  const got = (Array.isArray(actual) ? actual : [actual]).map(shortAnswer).sort();
  return canonical2(got) === canonical2(want);
}
function qaAliasMapScore(actual, expected, f1, threshold = 0.8) {
  let record = actual;
  if (typeof record === "string") {
    try {
      record = JSON.parse(record);
    } catch {
      return { accepted: false, failed: ["<not a record>"] };
    }
  }
  if (!record || typeof record !== "object" || Array.isArray(record) || !expected || typeof expected !== "object")
    return { accepted: false, failed: ["<not a record>"] };
  const gold = expected, got = record;
  const failed = Object.keys(got).filter((key) => !Object.hasOwn(gold, key));
  for (const [key, aliases] of Object.entries(gold)) {
    const options = Array.isArray(aliases) ? aliases : [aliases];
    const answer = got[key];
    if (typeof answer !== "string" && typeof answer !== "number") {
      failed.push(key);
      continue;
    }
    if (Math.max(0, ...options.map((alias) => f1(String(answer), String(alias)))) < threshold) failed.push(key);
  }
  return { accepted: failed.length === 0, failed };
}

// src/evaluation/puzzle-solutions.ts
var PUZZLE_SOLUTION_NORMALIZATIONS = ["puzzle-solution"];
var gcd = (a, b) => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};
function rational(n, d) {
  if (d === 0n) throw new RangeError("division by zero");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
function evaluateArithmetic(text) {
  const tokens2 = text.replace(/×/g, "*").replace(/÷/g, "/").match(/\d+|[-+*/()]|\S/g) ?? [];
  let at = 0;
  const literals = [];
  const peek = () => tokens2[at];
  function primary() {
    const token = tokens2[at++];
    if (token === "(") {
      const value = sum();
      if (tokens2[at++] !== ")") throw new SyntaxError("expected )");
      return value;
    }
    if (token !== void 0 && /^\d+$/.test(token)) {
      const n = BigInt(token);
      literals.push(n);
      return { n, d: 1n };
    }
    throw new SyntaxError(`unexpected ${token ?? "end"}`);
  }
  function product() {
    let value = primary();
    while (peek() === "*" || peek() === "/") {
      const op = tokens2[at++], right = primary();
      value = op === "*" ? rational(value.n * right.n, value.d * right.d) : rational(value.n * right.d, value.d * right.n);
    }
    return value;
  }
  function sum() {
    let value = product();
    while (peek() === "+" || peek() === "-") {
      const op = tokens2[at++], right = product();
      value = rational(op === "+" ? value.n * right.d + right.n * value.d : value.n * right.d - right.n * value.d, value.d * right.d);
    }
    return value;
  }
  try {
    const value = sum();
    return at === tokens2.length && tokens2.length ? { value, literals } : void 0;
  } catch {
    return void 0;
  }
}
function countdownSolves(actual, instance) {
  const numbers = instance.numbers, target = instance.target;
  if (typeof actual !== "string" || !Array.isArray(numbers) || typeof target !== "number" || !Number.isInteger(target)) return false;
  const parsed = evaluateArithmetic(actual.replace(/=\s*-?\d+\s*$/, ""));
  if (!parsed) return false;
  const pool = /* @__PURE__ */ new Map();
  for (const n of numbers) pool.set(String(n), (pool.get(String(n)) ?? 0) + 1);
  for (const literal of parsed.literals) {
    const left = pool.get(String(literal)) ?? 0;
    if (!left) return false;
    pool.set(String(literal), left - 1);
  }
  if (instance.use_all === true && [...pool.values()].some((left) => left > 0)) return false;
  return parsed.value.d === 1n && parsed.value.n === BigInt(target);
}
function queensSolve(actual, instance) {
  const n = instance.n;
  if (!Array.isArray(actual) || typeof n !== "number" || !Number.isInteger(n) || n < 1) return false;
  const cell3 = (item) => {
    const pair = Array.isArray(item) ? item : item && typeof item === "object" ? [item.row, item.col] : void 0;
    if (!pair || pair.length !== 2 || !pair.every((v) => Number.isInteger(v) && v >= 0 && v < n)) return void 0;
    return pair;
  };
  const placed = /* @__PURE__ */ new Map();
  for (const item of [...Array.isArray(instance.fixed) ? instance.fixed : [], ...actual]) {
    const c = cell3(item);
    if (!c) return false;
    placed.set(c.join(","), c);
  }
  const queens = [...placed.values()];
  if (queens.length !== n) return false;
  const distinct = (key) => new Set(queens.map(key)).size === n;
  return distinct((q) => q[0]) && distinct((q) => q[1]) && distinct((q) => q[0] - q[1]) && distinct((q) => q[0] + q[1]);
}
function sokobanSolves(actual, instance) {
  const grid = instance.grid;
  if (typeof actual !== "string" || !Array.isArray(grid) || !grid.every((row) => typeof row === "string")) return false;
  const walls = /* @__PURE__ */ new Set(), goals = /* @__PURE__ */ new Set(), boxes = /* @__PURE__ */ new Set();
  let player;
  grid.forEach((row, r) => [...row].forEach((ch, c) => {
    const key = `${r},${c}`;
    if (ch === "#") walls.add(key);
    if (".+*".includes(ch)) goals.add(key);
    if ("$*".includes(ch)) boxes.add(key);
    if ("@+".includes(ch)) player = [r, c];
  }));
  if (!player || !boxes.size || boxes.size !== goals.size) return false;
  const moves = actual.replace(/[\s,]/g, "").toUpperCase();
  if (!/^[LRUD]*$/.test(moves)) return false;
  const step = { L: [0, -1], R: [0, 1], U: [-1, 0], D: [1, 0] };
  for (const move of moves) {
    const [dr, dc] = step[move];
    const next = `${player[0] + dr},${player[1] + dc}`;
    if (walls.has(next)) return false;
    if (boxes.has(next)) {
      const beyond = `${player[0] + 2 * dr},${player[1] + 2 * dc}`;
      if (walls.has(beyond) || boxes.has(beyond)) return false;
      boxes.delete(next);
      boxes.add(beyond);
    }
    player = [player[0] + dr, player[1] + dc];
  }
  return [...boxes].every((box) => goals.has(box));
}
function puzzleSolves(actual, instance, puzzle) {
  if (!instance || typeof instance !== "object" || Array.isArray(instance)) return false;
  const spec = instance;
  if (puzzle === "countdown") return countdownSolves(actual, spec);
  if (puzzle === "n-queens") return queensSolve(actual, spec);
  if (puzzle === "sokoban") return sokobanSolves(actual, spec);
  throw new RangeError(`unknown puzzle-solution puzzle: ${String(puzzle)}`);
}

// src/evaluation/oracles.ts
var ORACLE_LEVELS = ["exact", "normalized", "span", "agreement", "judged", "constraints"];
var ANSWER_COMPARISON_VERSION = answerEquivalenceEnabled() ? "normalized-decimal-exact/5" : "normalized-decimal-exact/4";
var BUILTIN_NORMALIZATIONS = [
  "qa",
  "qa-string-map",
  "named-tree",
  "json-string-record",
  "semantic-structured",
  ...ANSWER_SET_NORMALIZATIONS,
  ...PUZZLE_SOLUTION_NORMALIZATIONS
];
function declaredStructuralCanonical(value, unorderedPaths, prosePaths = [], ignoreProse = false) {
  const parsePointer = (pointer) => {
    if (!pointer.startsWith("/") || /~(?![01])/.test(pointer)) throw new RangeError(`invalid comparison path: ${pointer}`);
    return pointer.slice(1).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  };
  const unordered = unorderedPaths.map(parsePointer), prose = prosePaths.map(parsePointer);
  const matches = (path, pattern) => path.length === pattern.length && path.every((part, index) => pattern[index] === "*" || pattern[index] === part);
  const visit = (item, path) => {
    if (ignoreProse && prose.some((pattern) => matches(path, pattern))) {
      if (typeof item !== "string") return null;
      return JSON.stringify("__reviewed_prose__");
    }
    if (Array.isArray(item)) {
      const parts = item.map((child, index) => visit(child, [...path, String(index)]));
      if (parts.some((part) => part === null)) return null;
      if (unordered.some((pattern) => matches(path, pattern))) parts.sort();
      return `[${parts.join(",")}]`;
    }
    if (item && typeof item === "object") {
      const fields = Object.entries(item).sort(([a], [b]) => a.localeCompare(b));
      const parts = fields.map(([key, child]) => [key, visit(child, [...path, key])]);
      if (parts.some(([, child]) => child === null)) return null;
      return `{${parts.map(([key, child]) => `${JSON.stringify(key)}:${child}`).join(",")}}`;
    }
    if (item === null || typeof item === "string" || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item)) return JSON.stringify(item);
    return null;
  };
  return visit(value, []);
}
var BUILTIN_FILE_COMPARES = [
  "content",
  "exact",
  "moves",
  "rewrite",
  "csv",
  "counts",
  "json-string-record",
  "qa-string-map",
  "json-semantic-structured",
  "ordinal-distance-json-record",
  "markdown-terminal-newline"
];
function namedTreeCanonical(value) {
  let remaining = 1e4;
  const visit = (input, depth) => {
    if (--remaining < 0 || depth > 128 || !input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_named_tree");
    const node = input;
    if (typeof node.name !== "string" || !Array.isArray(node.children) || Object.keys(node).length !== 2 || !Object.hasOwn(node, "name") || !Object.hasOwn(node, "children")) throw new Error("invalid_named_tree");
    const names = /* @__PURE__ */ new Set();
    const children = node.children.map((child) => {
      const parsed = visit(child, depth + 1);
      if (names.has(parsed[0])) throw new Error("duplicate_named_child");
      names.add(parsed[0]);
      return parsed;
    }).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    return [node.name, children];
  };
  try {
    return JSON.stringify(visit(value, 0));
  } catch {
    return null;
  }
}
function jsonStringRecordWithNumericKeysCanonical(value, numericKeys = []) {
  if (!Array.isArray(numericKeys) || numericKeys.some((key) => typeof key !== "string") || new Set(numericKeys).size !== numericKeys.length) return null;
  let record;
  if (typeof value === "string") {
    if (jsonStringRecordCanonical(value) === null) return null;
    try {
      record = JSON.parse(value);
    } catch {
      return null;
    }
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    try {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return null;
      record = /* @__PURE__ */ Object.create(null);
      for (const key of Object.keys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor?.enumerable || !("value" in descriptor) || typeof descriptor.value !== "string") return null;
        record[key] = descriptor.value;
      }
    } catch {
      return null;
    }
  } else return null;
  for (const key of numericKeys) {
    if (!Object.hasOwn(record, key) || typeof record[key] !== "string" || decimalForms(record[key]) === null)
      return null;
  }
  const selected = new Set(numericKeys);
  return JSON.stringify(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => {
    if (!selected.has(key)) return [key, { exact_string: entry }];
    return [key, { exact_decimal: decimalForms(entry).exact }];
  }));
}
function jsonStringRecordWithRadixFieldsCanonical(value, radixFields = []) {
  if (!Array.isArray(radixFields)) return null;
  const fields = /* @__PURE__ */ new Map();
  for (const field of radixFields) {
    if (!field || typeof field !== "object" || typeof field.key !== "string" || !Number.isInteger(field.base) || field.base < 2 || field.base > 36 || fields.has(field.key)) return null;
    fields.set(field.key, field.base);
  }
  let record;
  if (typeof value === "string") {
    if (jsonStringRecordCanonical(value) === null) return null;
    try {
      record = JSON.parse(value);
    } catch {
      return null;
    }
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    try {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return null;
      record = /* @__PURE__ */ Object.create(null);
      for (const key of Object.keys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor?.enumerable || !("value" in descriptor) || typeof descriptor.value !== "string") return null;
        record[key] = descriptor.value;
      }
    } catch {
      return null;
    }
  } else return null;
  for (const key of fields.keys()) if (!Object.hasOwn(record, key) || typeof record[key] !== "string") return null;
  const parsed = /* @__PURE__ */ new Map();
  for (const [key, base] of fields) {
    const digits = record[key];
    if (!digits || !/^[0-9a-z]+$/.test(digits)) return null;
    let number = 0n;
    for (const character of digits) {
      const digit = "0123456789abcdefghijklmnopqrstuvwxyz".indexOf(character);
      if (digit < 0 || digit >= base) return null;
      number = number * BigInt(base) + BigInt(digit);
    }
    parsed.set(key, number);
  }
  return JSON.stringify(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => fields.has(key) ? [key, { exact_radix_integer: parsed.get(key).toString() }] : [key, { exact_string: entry }]));
}
function jsonStringRecordWithNumericListFieldsCanonical(value, numericListFields = []) {
  if (!validNumericListFieldSchema(numericListFields)) return null;
  const fields = /* @__PURE__ */ new Map();
  for (const field of numericListFields) {
    fields.set(field.key, field);
  }
  let record;
  if (typeof value === "string") {
    if (jsonStringRecordCanonical(value) === null) return null;
    try {
      record = JSON.parse(value);
    } catch {
      return null;
    }
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    try {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return null;
      record = /* @__PURE__ */ Object.create(null);
      for (const key of Object.keys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor?.enumerable || !("value" in descriptor) || typeof descriptor.value !== "string") return null;
        record[key] = descriptor.value;
      }
    } catch {
      return null;
    }
  } else return null;
  const parsed = /* @__PURE__ */ new Map();
  for (const [key, field] of fields) {
    if (!Object.hasOwn(record, key) || typeof record[key] !== "string") return null;
    const text = record[key];
    if (text === field.empty_value) {
      parsed.set(key, []);
      continue;
    }
    const items = text.split(field.separator);
    if (!items.length) return null;
    const canonicalItems = [];
    for (const item of items) {
      if (!/^(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)$/.test(item)) return null;
      canonicalItems.push(BigInt(item.replaceAll(",", "")).toString());
    }
    parsed.set(key, canonicalItems);
  }
  return JSON.stringify(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => fields.has(key) ? [key, { exact_unsigned_integer_list: parsed.get(key) }] : [key, { exact_string: entry }]));
}
function validNumericListFieldSchema(value) {
  if (!Array.isArray(value)) return false;
  const keys = /* @__PURE__ */ new Set();
  for (const field of value) {
    if (!field || typeof field !== "object" || Array.isArray(field) || Object.keys(field).sort().join(",") !== "empty_value,key,separator" || typeof field.key !== "string" || !field.key || field.separator !== "; " || field.empty_value !== "none" || keys.has(field.key)) return false;
    keys.add(field.key);
  }
  return true;
}
function jsonStringRecordAnswerCanonical(value, numericKeys, radixFields, numericListFields) {
  if (radixFields !== void 0 && !Array.isArray(radixFields)) return null;
  if (numericListFields !== void 0 && !validNumericListFieldSchema(numericListFields)) return null;
  const declared = [numericKeys, radixFields, numericListFields].filter((value2) => Array.isArray(value2) && value2.length > 0).length;
  if (declared > 1) return null;
  if (Array.isArray(numericListFields) && numericListFields.length)
    return jsonStringRecordWithNumericListFieldsCanonical(value, numericListFields);
  return Array.isArray(radixFields) && radixFields.length ? jsonStringRecordWithRadixFieldsCanonical(value, radixFields) : jsonStringRecordWithNumericKeysCanonical(value, numericKeys);
}
function answerEquivalenceEnabled() {
  return globalThis.process?.env?.NATLANG_QA_EQUIVALENCE !== "0";
}
var UNITS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen"
];
var TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
var NUMBER_WORD = new RegExp(`\\b(?:(${TENS.slice(2).join("|")})(?:[- ](${UNITS.slice(1, 10).join("|")}))?|(${UNITS.join("|")}))\\b`, "gu");
function foldAnswerText(text) {
  return text.normalize("NFKD").replace(new RegExp("\\p{M}", "gu"), "").normalize("NFKC").toLocaleLowerCase("en-US").replace(/(?<=\d),(?=\d{3}(?!\d))/g, "").replace(NUMBER_WORD, (_, tens, unit, single) => String(single !== void 0 ? UNITS.indexOf(single) : TENS.indexOf(tens) * 10 + (unit ? UNITS.indexOf(unit) : 0)));
}
function normalizeText(value) {
  let text = String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
  if (answerEquivalenceEnabled()) {
    text = text === "none" ? "0" : foldAnswerText(text).replace(/\s*([|&,;:()[\]{}<>=])\s*/g, "$1");
  }
  const number = text.replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, "");
  if (number.length <= 512 && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(number)) {
    const exact = decimalForms(number)?.exact ?? (number.endsWith(".") ? decimalForms(`${number}0`)?.exact : void 0);
    if (exact !== void 0) return `number:${exact}`;
  }
  const date = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (date) return `date:${date[3]}-${date[1].padStart(2, "0")}-${date[2].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `date:${text}`;
  return text;
}
function normalized(value) {
  if (Array.isArray(value)) return `[${value.map(normalized).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${normalized(child)}`).join(",")}}`;
  return normalizeText(value);
}
function qaAnswerText(value) {
  const normalized2 = (answerEquivalenceEnabled() ? foldAnswerText(value) : value.normalize("NFKC").toLocaleLowerCase("en-US")).replace(/[\p{P}\p{S}]/gu, "");
  return normalized2.split(/\s+/u).filter((token) => token && !["a", "an", "the"].includes(token)).join(" ");
}
function qaStringMapCanonical(value) {
  let record = value;
  if (typeof value === "string") {
    if (jsonStringRecordCanonical(value) === null) return null;
    try {
      record = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const entries = Object.entries(record);
  if (!entries.every(([, answer]) => typeof answer === "string")) return null;
  return JSON.stringify(entries.sort(([a], [b]) => a.localeCompare(b)).map(([key, answer]) => [key, qaAnswerText(answer)]));
}
function words2(value, qa = false) {
  const text = String(Array.isArray(value) ? value.join(" ") : value ?? "");
  const tokens2 = (qa && answerEquivalenceEnabled() ? foldAnswerText(text) : text.normalize("NFKC").toLocaleLowerCase("en-US")).match(/[\p{L}\p{N}]+/gu) ?? [];
  return qa ? tokens2.filter((word) => !["a", "an", "the"].includes(word)) : tokens2;
}
function qaNumbers(value) {
  return (answerEquivalenceEnabled() ? foldAnswerText(String(value)) : String(value)).match(/[+-]?\d+(?:\.\d+)?/g)?.map((token) => decimalForms(token)?.exact ?? token).sort() ?? [];
}
function polarity(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return void 0;
  const text = normalizeText(value).replace(/[.!]$/, "");
  return text === "yes" || text === "true" ? true : text === "no" || text === "false" ? false : void 0;
}
function unquotedAnswer(actual, candidates) {
  if (typeof actual !== "string") return actual;
  const text = actual.trim();
  if (text.length < 2 || !text.startsWith('"') || !text.endsWith('"')) return actual;
  if (!candidates.some((candidate) => typeof candidate === "string") || candidates.some((candidate) => typeof candidate === "string" && candidate.trim().startsWith('"'))) return actual;
  try {
    const inner = JSON.parse(text);
    return typeof inner === "string" ? inner : actual;
  } catch {
    return actual;
  }
}
function containsQaSpan(actual, expected) {
  if (canonical2(qaNumbers(actual)) !== canonical2(qaNumbers(expected))) return false;
  const got = words2(actual, true), want = words2(expected, true);
  if (want.length < 2 || got.length > 2 * want.length) return false;
  for (let start = 0; start + want.length <= got.length; start++)
    if (want.every((word, index) => got[start + index] === word)) return true;
  return false;
}
var QA_HEDGES = /* @__PURE__ */ new Set([
  "or",
  "and",
  "nor",
  "either",
  "neither",
  "not",
  "no",
  "never",
  "maybe",
  "perhaps",
  "possibly",
  "probably",
  "unclear",
  "unknown"
]);
var QA_POSSESSOR = /^\s*(?:(?:the|a|an)\s+)?(?:(?:my|your|his|her|its|our|their)\s+|(?:[\p{L}\p{N}][\p{L}\p{N}.-]*\s+)?[\p{L}\p{N}][\p{L}\p{N}.-]*['\u2019]s\s+)(?=\S)/iu;
function qaAnswerCores(actual, expected, question) {
  if (typeof actual !== "string") return [];
  const gold = new Set(words2(expected, true));
  const cores = /* @__PURE__ */ new Set();
  const echoFree = (tokens2) => {
    const asked = question ? words2(question, true) : [];
    for (let k = tokens2.length - 1; k >= 1; k--) {
      const lead = tokens2.slice(0, k);
      if (lead.some((word) => gold.has(word))) continue;
      for (let start = 0; start + k <= asked.length; start++)
        if (lead.every((word, index) => asked[start + index] === word)) return tokens2.slice(k);
    }
    return tokens2;
  };
  const possessorFree = actual.replace(QA_POSSESSOR, "");
  const asideFree = answerEquivalenceEnabled() ? actual.replace(/\s*\([^()]*\)\s*$/u, "") : actual;
  for (const text of /* @__PURE__ */ new Set([actual, possessorFree, asideFree, asideFree.replace(QA_POSSESSOR, "")])) {
    const core = echoFree(words2(text, true));
    if (core.length) cores.add(core.join(" "));
  }
  cores.delete(words2(actual, true).join(" "));
  return [...cores].filter((core) => !core.split(" ").some((word) => QA_HEDGES.has(word) && !gold.has(word)));
}
function qaSameAnswer(actual, expected, question) {
  if (!answerEquivalenceEnabled() || typeof actual !== "string" || typeof expected !== "string") return false;
  const got = words2(actual, true), want = words2(expected, true);
  if (!got.length || !want.length) return false;
  if (got.join("") === want.join("")) return true;
  const numbers = qaNumbers(actual);
  if (!numbers.length || canonical2(numbers) !== canonical2(qaNumbers(expected))) return false;
  const [short, long] = got.length <= want.length ? [got, want] : [want, got];
  if (long.length - short.length > 2) return false;
  const gold = new Set(want);
  for (let start = 0; start + short.length <= long.length; start++) {
    if (!short.every((word, index) => long[start + index] === word)) continue;
    const extra = [...long.slice(0, start), ...long.slice(start + short.length)];
    if (!extra.every((word) => !QA_HEDGES.has(word) || gold.has(word))) return false;
    if (long === want) return true;
    const asked = new Set(question ? words2(question, true) : []);
    return extra.every((word) => asked.has(word));
  }
  return false;
}
function spanF1(actual, expected, qa = false) {
  if (qa) {
    const goldNumbers = qaNumbers(expected), gotNumbers = qaNumbers(actual);
    if (goldNumbers.length && canonical2(goldNumbers) !== canonical2(gotNumbers)) return 0;
  }
  const left = words2(actual, qa), right = words2(expected, qa);
  if (qa && [actual, expected].some((value) => ["yes", "no", "noanswer"].includes(String(value).trim().toLowerCase())) && canonical2(left) !== canonical2(right)) return 0;
  if (!left.length || !right.length) return left.length === right.length ? 1 : 0;
  const counts = /* @__PURE__ */ new Map();
  for (const word of right) counts.set(word, (counts.get(word) ?? 0) + 1);
  let shared = 0;
  for (const word of left) if ((counts.get(word) ?? 0) > 0) {
    shared++;
    counts.set(word, counts.get(word) - 1);
  }
  return 2 * shared / (left.length + right.length);
}
function agreement(actual, expected) {
  const invalid = (value) => typeof value === "number" ? !Number.isFinite(value) : !!value && typeof value === "object" && Object.values(value).some(invalid);
  if (invalid(actual) || invalid(expected)) return 0;
  const numbers = (value) => !!value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every((item) => typeof item === "number");
  if (numbers(actual) && numbers(expected)) {
    const keys = /* @__PURE__ */ new Set([...Object.keys(actual), ...Object.keys(expected)]);
    const total = [...keys].reduce((sum, key) => sum + Math.abs(actual[key] ?? 0) + Math.abs(expected[key] ?? 0), 0);
    const distance = [...keys].reduce((sum, key) => sum + Math.abs((actual[key] ?? 0) - (expected[key] ?? 0)), 0);
    return total ? 1 - distance / total : 1;
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    const length = Math.max(actual.length, expected.length);
    return length ? expected.filter((item, index) => canonical2(item) === canonical2(actual[index])).length / length : 1;
  }
  if (typeof actual === "number" && typeof expected === "number")
    return actual === expected ? 1 : Math.max(0, 1 - Math.abs(actual - expected) / Math.max(Math.abs(actual), Math.abs(expected)));
  return canonical2(actual) === canonical2(expected) ? 1 : 0;
}
var DATA_QUALITY_VERSION = 3;
var FILE_CONTENT_COMPARISON_VERSION = "json-content/3";
var FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
var front = (text) => FRONT_MATTER.exec(text)?.[0] ?? "";
var body = (text) => text.slice(front(text).length);
var probability = (value, name) => {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${name} threshold must be between 0 and 1`);
  return value;
};
function csvRows(text) {
  const rows2 = [];
  let row = [], cell3 = "", quoted = false, closed = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell3 += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else cell3 += char;
    } else if (char === ",") {
      row.push(cell3);
      cell3 = "";
      closed = false;
    } else if (char === "\n" || char === "\r" && text[index + 1] === "\n") {
      if (char === "\r") index++;
      row.push(cell3);
      rows2.push(row);
      row = [];
      cell3 = "";
      closed = false;
    } else if (char === '"' && !cell3 && !closed) quoted = true;
    else if (char === '"' || closed || char === "\r") throw new Error("malformed CSV quoting");
    else cell3 += char;
  }
  if (quoted) throw new Error("unterminated CSV quote");
  if (cell3 || row.length || closed) {
    row.push(cell3);
    rows2.push(row);
  }
  if (!rows2.length || !rows2[0].length) throw new Error("missing CSV header");
  const keys = /* @__PURE__ */ new Set();
  for (const row2 of rows2.slice(1)) {
    if (row2.length !== rows2[0].length) throw new Error("CSV row width differs from header");
    if (!row2[0]?.trim() || keys.has(row2[0])) throw new Error("empty or duplicate CSV row id");
    keys.add(row2[0]);
  }
  return rows2;
}
function countLines(text) {
  const counts = {};
  for (const line of text.split(/\r?\n/).filter((line2) => line2.trim())) {
    const match = /^(.+?):\s*(\d+)\s*$/.exec(line.trim());
    if (!match || Object.hasOwn(counts, match[1].trim()) || !Number.isSafeInteger(Number(match[2])))
      throw new Error("invalid or duplicate count line");
    counts[match[1].trim()] = Number(match[2]);
  }
  return counts;
}
var quoteText = (text) => text.normalize("NFKC").replace(/\s+/g, " ").trim();
function jsonFileCanonical(text) {
  try {
    const value = JSON.parse(text);
    const stack = [];
    const tokens2 = [...text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/g)].map((match) => match[0]);
    for (let index = 0; index < tokens2.length; index++) {
      const token = tokens2[index];
      if (token === "{") stack.push(/* @__PURE__ */ new Set());
      else if (token === "[") stack.push(null);
      else if (token === "}" || token === "]") stack.pop();
      else if (token.startsWith('"') && tokens2[index + 1] === ":") {
        const keys = stack.at(-1), key = JSON.parse(token);
        if (!keys || keys.has(key)) return null;
        keys.add(key);
      }
    }
    const valid = (part) => typeof part === "number" ? Number.isFinite(part) && (!Number.isInteger(part) || Number.isSafeInteger(part)) : part !== null && typeof part === "object" ? Object.values(part).every(valid) : true;
    return valid(value) ? canonical2(value) : null;
  } catch {
    return null;
  }
}
function fileContentEqual(path, actual, expected) {
  if (actual === void 0 || expected === void 0) return actual === expected;
  if (!/\.json$/i.test(path)) return actual === expected;
  const parsed = jsonFileCanonical(actual);
  return parsed !== null && parsed === jsonFileCanonical(expected);
}
function semanticJsonSpecValid(spec) {
  const paths = spec.json_report_paths, context = spec.rationale_context_paths, comparison = spec.comparison_spec;
  if (!Array.isArray(paths) || !paths.length || new Set(paths).size !== paths.length || paths.some((path) => typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..") || !/\.json$/i.test(path)) || !Array.isArray(context) || !context.length || new Set(context).size !== context.length || context.some((path) => typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..")) || !comparison || comparison.schema_version !== "semantic-structured-comparison/1" || !Array.isArray(comparison.unordered_paths) || !Array.isArray(comparison.ordered_paths) || !Array.isArray(comparison.prose_paths) || !comparison.prose_paths.length || typeof comparison.prose_policy !== "string" || !comparison.prose_policy.trim()) return false;
  const declared = [...comparison.unordered_paths, ...comparison.ordered_paths, ...comparison.prose_paths];
  return declared.every((path) => typeof path === "string" && path.startsWith("/") && !/~(?![01])/.test(path)) && new Set(declared).size === declared.length;
}
function hasRequiredJsonTextFields(value, pointers) {
  const read = (current, parts, index) => {
    if (index === parts.length) return typeof current === "string" && !!current.trim();
    const part = parts[index];
    if (part === "*") return Array.isArray(current) && current.length > 0 && current.every((child) => read(child, parts, index + 1));
    if (!current || typeof current !== "object" || Array.isArray(current) || !Object.hasOwn(current, part)) return false;
    return read(current[part], parts, index + 1);
  };
  return pointers.every((pointer) => read(value, pointer.slice(1).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~")), 0));
}
function semanticJsonFileComparison(actual, expected, input, spec) {
  const invalid = !semanticJsonSpecValid(spec);
  const configured = new Set(spec.json_report_paths ?? []);
  const paths = [.../* @__PURE__ */ new Set([...Object.keys(expected), ...Object.keys(actual), ...Object.keys(input)])].sort();
  const failed = [], errors = [], pending = [];
  if (invalid) errors.push("invalid_json_semantic_structured_spec");
  if (!invalid) {
    for (const path of spec.rationale_context_paths) if (typeof input[path] !== "string")
      errors.push(`missing_rationale_context:${path}`);
    for (const path of configured) if (typeof expected[path] !== "string" || typeof input[path] === "string")
      errors.push(`invalid_json_report_path:${path}`);
  }
  for (const path of paths) {
    if (configured.has(path)) {
      const gotText = actual[path], wantText = expected[path];
      if (typeof gotText !== "string" || typeof wantText !== "string" || jsonFileCanonical(gotText) === null || jsonFileCanonical(wantText) === null) {
        failed.push(path);
        continue;
      }
      let got, want;
      try {
        got = JSON.parse(gotText);
        want = JSON.parse(wantText);
      } catch {
        failed.push(path);
        continue;
      }
      const comparison = spec.comparison_spec;
      if (!hasRequiredJsonTextFields(got, comparison.prose_paths) || !hasRequiredJsonTextFields(want, comparison.prose_paths)) {
        failed.push(path);
        continue;
      }
      const strictGot = declaredStructuralCanonical(got, comparison.unordered_paths);
      const strictWant = declaredStructuralCanonical(want, comparison.unordered_paths);
      if (strictGot === null || strictWant === null) {
        failed.push(path);
        continue;
      }
      if (strictGot !== strictWant) {
        const proseGot = declaredStructuralCanonical(got, comparison.unordered_paths, comparison.prose_paths, true);
        const proseWant = declaredStructuralCanonical(want, comparison.unordered_paths, comparison.prose_paths, true);
        if (proseGot === null || proseWant === null || proseGot !== proseWant) failed.push(path);
      }
      if (!failed.includes(path)) pending.push(`unjudged_json_rationale:${path}`);
      continue;
    }
    if (!fileContentEqual(path, actual[path], expected[path])) failed.push(path);
    if (typeof expected[path] === "string" && expected[path] === input[path] && actual[path] !== expected[path])
      errors.push(`unexpected_change:${path}`);
  }
  const items = paths.length, passed = items - failed.length;
  return {
    accepted: !invalid && !errors.length && !failed.length && !pending.length,
    score: items ? passed / items : 1,
    passed,
    items,
    failed: failed.slice(0, 20),
    errors,
    pending,
    quality_version: DATA_QUALITY_VERSION,
    comparison_version: "json-semantic-structured-files/1"
  };
}
function markdownTerminalNewlineBody(text) {
  return text.endsWith("\r\n") ? text.slice(0, -2) : text.endsWith("\n") ? text.slice(0, -1) : text;
}
function markdownTerminalNewlineEqual(path, actual, expected) {
  return typeof actual === "string" && typeof expected === "string" && /\.md$/i.test(path) && markdownTerminalNewlineBody(actual) === markdownTerminalNewlineBody(expected);
}
function ordinalDistanceRecordReview(actual, expected, levels, maxDistance) {
  const invalid = (error) => ({ accepted: false, errors: [error], entries: [] });
  if (!Array.isArray(levels) || levels.length < 2 || levels.some((level) => typeof level !== "string" || !level) || new Set(levels).size !== levels.length || !Number.isSafeInteger(maxDistance) || Number(maxDistance) < 0)
    return invalid("invalid_ordinal_record_spec");
  const parseRecord = (value) => {
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {
        return null;
      }
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    return value;
  };
  const got = parseRecord(actual), want = parseRecord(expected);
  if (!got || !want) return invalid("invalid_ordinal_record_value");
  const gotKeys = Object.keys(got).sort(), wantKeys = Object.keys(want).sort();
  if (canonical2(gotKeys) !== canonical2(wantKeys)) return invalid("ordinal_record_keys_mismatch");
  const order = new Map(levels.map((label, index) => [label, index]));
  const entries = gotKeys.map((key) => {
    const actualLabel = got[key], expectedLabel = want[key];
    const actualIndex = typeof actualLabel === "string" ? order.get(actualLabel) : void 0;
    const expectedIndex = typeof expectedLabel === "string" ? order.get(expectedLabel) : void 0;
    const distance = actualIndex === void 0 || expectedIndex === void 0 ? null : Math.abs(actualIndex - expectedIndex);
    return {
      key,
      actual: actualLabel,
      expected: expectedLabel,
      ordinal_distance: distance,
      accepted: distance !== null && distance <= Number(maxDistance)
    };
  });
  const errors = entries.filter((entry) => !entry.accepted).map((entry) => entry.ordinal_distance === null ? `unknown_ordinal_label:${entry.key}` : `ordinal_distance_exceeded:${entry.key}`);
  return { accepted: errors.length === 0, errors, entries };
}
function checkFiles(actual, expected, input, spec = {}, judgments = {}) {
  assertKnownComparator("compare", spec.compare, BUILTIN_FILE_COMPARES);
  if (spec.return_path !== void 0 && (typeof spec.return_path !== "string" || !spec.return_path || spec.return_path.startsWith("/") || spec.return_path.includes("\\") || spec.return_path.split("/").some((part) => !part || part === "." || part === "..")))
    return { accepted: false, score: 0, passed: 0, items: 0, failed: [], errors: ["invalid_return_path"], pending: [], quality_version: DATA_QUALITY_VERSION };
  if (spec.compare === "json-string-record" && spec.numeric_list_fields !== void 0 && !validNumericListFieldSchema(spec.numeric_list_fields))
    return { accepted: false, score: 0, passed: 0, items: 0, failed: [], errors: ["invalid_numeric_list_field_schema"], pending: [], quality_version: DATA_QUALITY_VERSION };
  if (spec.compare === "json-semantic-structured")
    return semanticJsonFileComparison(actual, expected, input, spec);
  const compare = spec.compare ?? "exact", threshold = probability(spec.threshold ?? 0.9, "files"), span = probability(spec.span ?? 0.5, "files span");
  if (compare === "content") {
    const paths2 = [.../* @__PURE__ */ new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    const lenient = spec.terminal_newline === "lenient";
    const failed2 = paths2.filter((path) => !fileContentEqual(path, actual[path], expected[path]) && !(lenient && !/\.json$/i.test(path) && typeof actual[path] === "string" && typeof expected[path] === "string" && markdownTerminalNewlineBody(actual[path]) === markdownTerminalNewlineBody(expected[path])));
    return {
      accepted: !failed2.length,
      score: paths2.length ? (paths2.length - failed2.length) / paths2.length : 1,
      passed: paths2.length - failed2.length,
      items: paths2.length,
      failed: failed2,
      errors: [],
      pending: [],
      quality_version: DATA_QUALITY_VERSION
    };
  }
  if (compare === "markdown-terminal-newline") {
    const allow = spec.markdown_terminal_newline_paths;
    const validAllow = Array.isArray(allow) && allow.length > 0 && new Set(allow).size === allow.length && allow.every((path) => typeof path === "string" && path.length > 0 && !path.startsWith("/") && !path.includes("\\") && !path.split("/").some((part) => !part || part === "." || part === "..") && /\.md$/i.test(path));
    if (!validAllow) return { accepted: false, score: 0, passed: 0, items: 0, failed: [], errors: ["invalid_markdown_terminal_newline_allowlist"], pending: [], quality_version: DATA_QUALITY_VERSION };
    const allowed = new Set(allow);
    const paths2 = [.../* @__PURE__ */ new Set([...Object.keys(expected), ...Object.keys(actual), ...Object.keys(input)])].sort();
    const failed2 = [], errors2 = [];
    for (const path of allowed) {
      if (typeof input[path] !== "string" || typeof expected[path] !== "string")
        errors2.push(`missing_markdown_target:${path}`);
    }
    let passed2 = 0;
    for (const path of paths2) {
      const got = actual[path], want = expected[path], before = input[path];
      const ok = allowed.has(path) ? markdownTerminalNewlineEqual(path, got, want) : got === want && want === before;
      if (allowed.has(path)) {
        if (before === void 0 || want === void 0 || got === void 0 || markdownTerminalNewlineEqual(path, before, want)) errors2.push(`invalid_or_vacuous_markdown_target:${path}`);
      } else if (want !== before) errors2.push(`unexpected_expected_change:${path}`);
      if (want === void 0 || got === void 0 || before === void 0) {
        if (!(want === void 0 && got === void 0 && before === void 0)) errors2.push(`missing_or_unexpected_file:${path}`);
      }
      if (ok) passed2++;
      else failed2.push(path);
    }
    const score2 = paths2.length ? passed2 / paths2.length : 1;
    return {
      accepted: !errors2.length && !failed2.length && score2 >= threshold,
      score: score2,
      passed: passed2,
      items: paths2.length,
      failed: failed2,
      errors: errors2,
      pending: [],
      quality_version: DATA_QUALITY_VERSION
    };
  }
  const paths = [.../* @__PURE__ */ new Set([...Object.keys(expected), ...Object.keys(actual), ...Object.keys(input)])].sort().filter((path) => expected[path] !== input[path] || actual[path] !== input[path]);
  let passed = 0, items = 0, goldPositive = 0, actualPositive = 0, matchedPositive = 0;
  const failed = [], errors = [], pending = [];
  const item = (name, ok) => {
    items++;
    if (ok) passed++;
    else failed.push(name);
  };
  if (compare === "moves") {
    const covered = /* @__PURE__ */ new Set();
    for (const [source, original] of Object.entries(input)) {
      const name = source.split("/").pop();
      const destinations = Object.keys(expected).filter((path) => path.split("/").pop() === name);
      const gotPaths = Object.keys(actual).filter((path) => path.split("/").pop() === name);
      gotPaths.forEach((path) => covered.add(path));
      const destination = destinations[0];
      item(source, destinations.length === 1 && gotPaths.length === 1 && gotPaths[0] === destination && actual[destination] === original);
      if (gotPaths.length !== 1 || gotPaths.some((path) => actual[path] !== original)) errors.push(`lost_or_corrupted_file:${source}`);
    }
    for (const path of Object.keys(actual)) if (!covered.has(path)) errors.push(`unexpected_file:${path}`);
    const score2 = items ? passed / items : 1;
    return { accepted: !errors.length && score2 >= threshold, score: score2, passed, items, failed, errors, pending, quality_version: DATA_QUALITY_VERSION };
  }
  for (const path of paths) {
    const got = actual[path], want = expected[path], before = input[path];
    if (want === input[path] && got !== want || want === void 0 && got !== void 0) errors.push(`unexpected_change:${path}`);
    if (got === void 0 || want === void 0) {
      item(path, got === want);
      continue;
    }
    if (want === input[path]) {
      item(path, got === want);
      continue;
    }
    if (compare === "ordinal-distance-json-record") {
      const review = ordinalDistanceRecordReview(got, want, spec.ordinal_levels, spec.ordinal_distance_max);
      item(path, path === "decisions.json" && review.accepted);
      if (!review.accepted) errors.push(...review.errors.map((error) => `${path}:${error}`));
      continue;
    }
    if (compare === "json-string-record") {
      const parsed = jsonStringRecordAnswerCanonical(got, spec.numeric_keys, spec.radix_fields, spec.numeric_list_fields);
      const candidates = [want, ...spec.alternates?.[path] ?? []];
      item(path, parsed !== null && candidates.some((candidate) => parsed === jsonStringRecordAnswerCanonical(candidate, spec.numeric_keys, spec.radix_fields, spec.numeric_list_fields)));
      continue;
    }
    if (compare === "qa-string-map") {
      const parsed = qaStringMapCanonical(got);
      item(path, path === "answers.json" && parsed !== null && parsed === qaStringMapCanonical(want));
      continue;
    }
    const registered = recordComparator(compare);
    if (registered) {
      item(path, path === registered.answerFile && registered.equal(got, want));
      continue;
    }
    if (compare === "csv") {
      try {
        const [head, ...rows2] = csvRows(want), [gotHead, ...gotRows] = csvRows(got);
        if (canonical2(head) !== canonical2(gotHead)) throw new Error("CSV header mismatch");
        const byKey = new Map(gotRows.map((row) => [row[0], row]));
        if (!rows2.length) item(path, !gotRows.length);
        for (const row of gotRows) if (row[1]?.trim()) actualPositive++;
        for (const row of rows2) {
          const key = row[0], other = byKey.get(key);
          byKey.delete(key);
          const positive = !!row[1]?.trim();
          if (positive) goldPositive++;
          const ok = !!other && row.every((cell3, index) => {
            const theirs = other[index] ?? "";
            if (!cell3.trim() || !theirs.trim()) return !cell3.trim() && !theirs.trim();
            if (index === 0) return theirs === cell3;
            const candidates = index === 1 ? [cell3, ...spec.quote_alternates?.[key] ?? []] : [cell3];
            if (index === 1 && spec.quote_sources) return candidates.some((candidate) => quoteText(theirs) === quoteText(candidate)) || judgments[`${path}:${key}`]?.accepted === true && !judgments[`${path}:${key}`]?.needs_review;
            return candidates.some((candidate) => spanF1(theirs, candidate) >= span);
          });
          if (positive && ok) matchedPositive++;
          item(`${path}:${key}`, ok);
        }
        for (const key of byKey.keys()) item(`${path}:${key}`, false);
        if (spec.quote_sources) for (const row of gotRows) {
          if (!row[1]?.trim()) continue;
          const source = input[spec.quote_sources[row[0]] ?? ""];
          if (!source || !quoteText(body(source)).includes(quoteText(row[1]))) errors.push(`quote_not_in_source:${row[0]}`);
          const gold = rows2.find((candidate) => candidate[0] === row[0])?.[1] ?? "";
          if (![gold, ...spec.quote_alternates?.[row[0]] ?? []].some((candidate) => quoteText(candidate) === quoteText(row[1])) && (judgments[`${path}:${row[0]}`]?.accepted !== true || judgments[`${path}:${row[0]}`]?.needs_review)) {
            if (!judgments[`${path}:${row[0]}`] || judgments[`${path}:${row[0]}`]?.needs_review) pending.push(`unverified_quote:${row[0]}`);
            else errors.push(`invalid_quote:${row[0]}`);
          }
        }
      } catch (error) {
        errors.push(`${path}:${error.message}`);
        item(path, false);
      }
    } else if (compare === "counts") {
      try {
        const counts = countLines(got);
        if (spec.total !== void 0 && Object.values(counts).reduce((sum, count) => sum + count, 0) !== spec.total)
          errors.push(`wrong_total:${path}`);
        item(path, agreement(counts, countLines(want)) >= threshold);
      } catch (error) {
        errors.push(`${path}:${error.message}`);
        item(path, false);
      }
    } else if (compare === "rewrite" && typeof want === "string") {
      const validShape = got !== void 0 && front(got) === front(want) && (before === void 0 || front(got) === front(before));
      const referenceMatch = got !== void 0 && [want, ...spec.alternates?.[path] ?? []].some((candidate) => body(got).trim() === body(candidate).trim());
      if (validShape && !referenceMatch && (!judgments[path] || judgments[path]?.needs_review)) pending.push(`unverified_rewrite:${path}`);
      item(path, validShape && (referenceMatch || judgments[path]?.accepted === true && !judgments[path]?.needs_review));
    } else item(path, got === want);
  }
  const score = items ? passed / items : 1;
  const positiveRecall = goldPositive ? matchedPositive / goldPositive : 1;
  const positivePrecision = actualPositive ? matchedPositive / actualPositive : goldPositive ? 0 : 1;
  return {
    accepted: !errors.length && !pending.length && score >= threshold && (compare !== "rewrite" || score === 1) && (compare !== "csv" || positiveRecall >= threshold && positivePrecision >= threshold),
    score,
    passed,
    items,
    failed: failed.slice(0, 20),
    errors,
    pending,
    quality_version: DATA_QUALITY_VERSION,
    ...compare === "qa-string-map" ? { comparison_version: "squad-token-map/1" } : {},
    ...compare === "json-string-record" ? { comparison_version: spec.numeric_list_fields?.length ? "json-string-record-integer-list-fields/1" : spec.numeric_keys?.length ? "json-string-record-decimal-fields/1" : spec.radix_fields?.length ? "json-string-record-radix-fields/1" : "json-string-record-object/1" } : {},
    ...compare === "csv" ? { positive_recall: positiveRecall, positive_precision: positivePrecision } : {},
    ...Object.keys(judgments).length ? { judgments } : {}
  };
}
async function checkFilesWithJudge(actual, expected, input, spec = {}, judge2) {
  const first = checkFiles(actual, expected, input, spec);
  if (spec.compare === "json-semantic-structured") {
    if (first.errors.length || first.failed.length || !semanticJsonSpecValid(spec)) return first;
    const pending = [], failed = [...first.failed], judgments2 = {};
    for (const path of spec.json_report_paths) {
      let got, want;
      try {
        got = JSON.parse(actual[path]);
        want = JSON.parse(expected[path]);
      } catch {
        failed.push(path);
        continue;
      }
      if (!judge2) {
        pending.push(`unjudged_json_rationale:${path}`);
        continue;
      }
      const sourceFiles = Object.fromEntries(spec.rationale_context_paths.map((sourcePath) => [sourcePath, input[sourcePath]]));
      const verdict = await judge2({
        actual: { output_path: path, report: got, source_files: sourceFiles },
        expected: { checked_non_prose_structure: true, prose_paths: spec.comparison_spec.prose_paths },
        rubric: spec.comparison_spec.prose_policy
      });
      judgments2[path] = {
        accepted: verdict.accepted === true,
        verdict: verdict.verdict,
        ...verdict.needs_review ? { needs_review: true } : {}
      };
      if (verdict.accepted !== true || verdict.needs_review) {
        if (verdict.needs_review) pending.push(`unverified_json_rationale:${path}`);
        else failed.push(path);
      }
    }
    return {
      ...first,
      accepted: !failed.length && !pending.length,
      score: first.items ? (first.items - failed.length) / first.items : 1,
      failed: failed.slice(0, 20),
      pending,
      judgments: Object.keys(judgments2).length ? judgments2 : void 0,
      comparison_version: "json-semantic-structured-files/1"
    };
  }
  if (!["rewrite", "csv"].includes(spec.compare ?? "") || !judge2 || !spec.rubric) return first;
  const judgments = {};
  for (const path of Object.keys(expected)) {
    if (spec.compare === "csv") {
      if (!spec.quote_sources || expected[path] === input[path] || actual[path] === void 0) continue;
      let rows2, goldRows;
      try {
        rows2 = csvRows(actual[path]);
        goldRows = csvRows(expected[path]);
      } catch {
        continue;
      }
      for (const row of rows2.slice(1)) {
        if (!row[1]?.trim()) continue;
        const gold = goldRows.slice(1).find((candidate) => candidate[0] === row[0])?.[1] ?? "";
        if ([gold, ...spec.quote_alternates?.[row[0]] ?? []].some((candidate) => quoteText(candidate) === quoteText(row[1]))) continue;
        const source = input[spec.quote_sources[row[0]] ?? ""];
        if (!source || !quoteText(body(source)).includes(quoteText(row[1]))) continue;
        const sourceBody = body(source), location = quoteText(sourceBody).indexOf(quoteText(row[1]));
        const rawLocation = sourceBody.indexOf(row[1]);
        const sourceView = sourceBody.length <= 12e3 ? { full_text: sourceBody } : {
          opening: sourceBody.slice(0, 1500),
          quote_context: rawLocation >= 0 ? sourceBody.slice(Math.max(0, rawLocation - 2e3), rawLocation + row[1].length + 2e3) : quoteText(sourceBody).slice(Math.max(0, location - 2e3), location + quoteText(row[1]).length + 2e3),
          omitted_characters: Math.max(0, sourceBody.length - 1500 - row[1].length - 4e3)
        };
        judgments[`${path}:${row[0]}`] = await judge2({
          actual: { source_view: sourceView, clause: row[1] },
          expected: { annotated_clauses: [gold, ...spec.quote_alternates?.[row[0]] ?? []] },
          rubric: spec.rubric
        });
      }
      continue;
    }
    if (actual[path] === void 0 || expected[path] === input[path] || input[path] !== void 0 && front(actual[path]) !== front(input[path]) || front(actual[path]) !== front(expected[path])) continue;
    if ([expected[path], ...spec.alternates?.[path] ?? []].some((value) => body(actual[path]).trim() === body(value).trim())) continue;
    judgments[path] = await judge2({ actual: {
      original_exists: input[path] !== void 0,
      original: input[path] === void 0 ? null : body(input[path]),
      revised: body(actual[path])
    }, expected: { reference: body(expected[path]) }, rubric: spec.rubric });
  }
  return checkFiles(actual, expected, input, spec, judgments);
}
function fileReturnValue(files, input, spec) {
  if (spec.return_count === "changed") return Object.keys(files).filter((path) => spec.compare === "content" ? !fileContentEqual(path, files[path], input[path]) : files[path] !== input[path]).length;
  const report = files[spec.report ?? ""];
  if (report === void 0) throw new Error("missing report");
  if (spec.return_count === "counts") return countLines(report);
  return csvRows(report).slice(1).filter((row) => row[1]?.trim()).length;
}
function checkFileReturn(actual, files, input, spec) {
  const registered = recordComparator(spec.compare);
  if (registered) {
    const written = files[registered.answerFile];
    return written !== void 0 && registered.equal(actual, written);
  }
  if (spec.compare === "json-string-record") {
    if (spec.return_path !== void 0 && (typeof spec.return_path !== "string" || !spec.return_path || spec.return_path.startsWith("/") || spec.return_path.includes("\\") || spec.return_path.split("/").some((part) => !part || part === "." || part === ".."))) return false;
    if (spec.numeric_list_fields !== void 0 && !validNumericListFieldSchema(spec.numeric_list_fields)) return false;
    const answerPath = spec.return_path;
    const answerFiles = answerPath === void 0 ? ["answers.json", "answer.json"].filter((path) => Object.hasOwn(files, path)) : [answerPath];
    if (answerFiles.length !== 1 || !Object.hasOwn(files, answerFiles[0])) return false;
    const written = files[answerFiles[0]];
    const returned = jsonStringRecordAnswerCanonical(actual, spec.numeric_keys, spec.radix_fields, spec.numeric_list_fields);
    return written !== void 0 && returned !== null && returned === jsonStringRecordAnswerCanonical(written, spec.numeric_keys, spec.radix_fields, spec.numeric_list_fields);
  }
  if (!spec.return_count) return true;
  try {
    return canonical2(actual) === canonical2(fileReturnValue(files, input, spec));
  } catch {
    return false;
  }
}
async function checkOracle(actual, expected, oracle = "exact", judge2, context = {}) {
  const spec = typeof oracle === "string" ? { level: oracle } : oracle;
  const { level } = spec;
  if (!ORACLE_LEVELS.includes(level)) throw new RangeError(`unknown oracle level: ${level}`);
  const candidates = [expected, ..."alternates" in spec ? spec.alternates ?? [] : []];
  actual = unquotedAnswer(actual, candidates);
  if (level === "exact") return { accepted: candidates.some((candidate) => canonical2(actual) === canonical2(candidate)), level };
  if (level === "normalized" && spec.normalization === "ordinal-distance-record") {
    const review = ordinalDistanceRecordReview(actual, expected, spec.ordinal_levels, spec.ordinal_distance_max);
    return {
      accepted: review.accepted,
      level,
      verdict: JSON.stringify(review),
      comparison_version: "bounded-ordinal-record/1"
    };
  }
  if (level === "constraints") {
    const result = checkConstraints(actual, expected);
    return { accepted: result.passed, level, score: result.score, ...result.failed.length ? { verdict: result.failed.join(" ") } : {} };
  }
  if (level === "normalized" && spec.normalization === "named-tree") {
    const answer = namedTreeCanonical(actual);
    return { accepted: answer !== null && candidates.some((candidate) => namedTreeCanonical(candidate) === answer), level };
  }
  if (level === "normalized" && spec.normalization === "qa-string-map") {
    const answer = qaStringMapCanonical(actual);
    return { accepted: answer !== null && candidates.some((candidate) => qaStringMapCanonical(candidate) === answer), level };
  }
  if (level === "normalized" && spec.normalization === "json-string-record") {
    if (spec.numeric_list_fields !== void 0 && !validNumericListFieldSchema(spec.numeric_list_fields))
      return { accepted: false, level, comparison_version: "invalid-json-string-record-spec/1" };
    const answer = jsonStringRecordAnswerCanonical(actual, spec.numeric_keys, spec.radix_fields, spec.numeric_list_fields);
    return {
      accepted: answer !== null && candidates.some((candidate) => jsonStringRecordAnswerCanonical(candidate, spec.numeric_keys, spec.radix_fields, spec.numeric_list_fields) === answer),
      level,
      comparison_version: spec.numeric_list_fields?.length ? "json-string-record-integer-list-fields/1" : spec.numeric_keys?.length ? "json-string-record-decimal-fields/1" : spec.radix_fields?.length ? "json-string-record-radix-fields/1" : "json-string-record-object/1"
    };
  }
  if (level === "normalized" && spec.normalization === "semantic-structured") {
    const comparison = spec.comparison_spec;
    const allPaths = comparison ? [
      ...comparison.unordered_paths ?? [],
      ...comparison.ordered_paths ?? [],
      ...comparison.prose_paths ?? []
    ] : [];
    if (comparison?.schema_version !== "semantic-structured-comparison/1" || !Array.isArray(comparison.unordered_paths) || !Array.isArray(comparison.ordered_paths) || !Array.isArray(comparison.prose_paths) || new Set(allPaths).size !== allPaths.length || allPaths.some((path) => typeof path !== "string" || !path.startsWith("/") || /~(?![01])/.test(path)))
      return { accepted: false, level, comparison_version: "invalid-semantic-structured-spec/1" };
    const strict = declaredStructuralCanonical(actual, comparison.unordered_paths);
    const references = candidates.map((candidate) => declaredStructuralCanonical(candidate, comparison.unordered_paths));
    if (strict !== null && references.includes(strict))
      return { accepted: true, level, comparison_version: "declared-semantic-structure/1" };
    const withoutProse = declaredStructuralCanonical(actual, comparison.unordered_paths, comparison.prose_paths, true);
    const proseEquivalentStructure = withoutProse !== null && candidates.some((candidate) => declaredStructuralCanonical(candidate, comparison.unordered_paths, comparison.prose_paths, true) === withoutProse);
    if (proseEquivalentStructure || comparison.witness_review_required) {
      if (proseEquivalentStructure && judge2) {
        const verdict2 = await judge2({
          actual,
          expected: { answer: expected, context: spec.context },
          rubric: [comparison.witness_policy, comparison.prose_policy].filter(Boolean).join(" ")
        });
        return {
          accepted: verdict2.accepted === true && !verdict2.needs_review,
          level,
          verdict: verdict2.verdict,
          ...verdict2.needs_review ? { needs_review: true } : {},
          comparison_version: "declared-semantic-structure/1"
        };
      }
      return {
        accepted: false,
        level,
        needs_review: true,
        verdict: "structural alternative or prose equivalence needs independent source-grounded review",
        comparison_version: "declared-semantic-structure/1"
      };
    }
    return { accepted: false, level, comparison_version: "declared-semantic-structure/1" };
  }
  if (level === "normalized" && spec.normalization === "result-set")
    return {
      accepted: candidates.some((candidate) => resultSetEqual(actual, candidate, spec.ordered === true)),
      level,
      comparison_version: "result-set/1"
    };
  if (level === "normalized" && spec.normalization === "numeric-tolerance") {
    const options = {
      tolerance: typeof spec.tolerance === "number" ? spec.tolerance : void 0,
      abs_tolerance: typeof spec.abs_tolerance === "number" ? spec.abs_tolerance : void 0,
      percent_equivalent: spec.percent_equivalent === true
    };
    return {
      accepted: candidates.some((candidate) => numericClose(actual, candidate, options)),
      level,
      comparison_version: "numeric-tolerance/1"
    };
  }
  if (level === "normalized" && spec.normalization === "puzzle-solution")
    return { accepted: puzzleSolves(actual, expected, spec.puzzle), level, comparison_version: "puzzle-solution/1" };
  if (level === "normalized" && spec.normalization === "answer-list")
    return { accepted: candidates.some((candidate) => answerListEqual(actual, candidate)), level, comparison_version: "answer-list/1" };
  if (level === "normalized" && spec.normalization === "qa-alias-map") {
    const threshold = typeof spec.threshold === "number" ? probability(spec.threshold, "qa-alias-map") : 0.8;
    const equivalence = answerEquivalenceEnabled();
    const score = (got, gold) => {
      const f1 = spanF1(got, gold, true);
      if (!equivalence || f1 >= threshold) return f1;
      const same = polarity(got) !== void 0 && polarity(got) === polarity(gold) || containsQaSpan(got, gold) || qaSameAnswer(got, gold) || qaAnswerCores(got, gold).some((core) => spanF1(core, gold, true) >= threshold);
      return same ? 1 : f1;
    };
    const results = candidates.map((candidate) => qaAliasMapScore(actual, candidate, score, threshold));
    const best = results.find((result) => result.accepted) ?? results[0];
    return {
      accepted: best.accepted,
      level,
      comparison_version: equivalence ? "qa-alias-map/2" : "qa-alias-map/1",
      ...best.failed.length ? { verdict: `keys below threshold: ${best.failed.join(", ")}` } : {}
    };
  }
  const registered = level === "normalized" ? recordComparator(spec.normalization) : void 0;
  if (level === "normalized" && spec.normalization === "qa") {
    const same = (candidate) => typeof actual === "string" && typeof candidate === "string" && qaAnswerText(candidate).length > 0 && qaAnswerText(actual) === qaAnswerText(candidate) && canonical2(qaNumbers(actual)) === canonical2(qaNumbers(candidate));
    const samePolarity = (candidate) => polarity(actual) !== void 0 && polarity(actual) === polarity(candidate);
    return {
      accepted: candidates.some((candidate) => same(candidate) || samePolarity(candidate)),
      level,
      comparison_version: "qa-scalar-exact/2"
    };
  }
  if (registered) return { accepted: candidates.some((candidate) => registered.equal(actual, candidate)), level };
  if (level === "normalized") assertKnownComparator("normalization", spec.normalization, BUILTIN_NORMALIZATIONS);
  if (level === "normalized") return { accepted: candidates.some((candidate) => normalized(actual) === normalized(candidate) || polarity(actual) !== void 0 && polarity(actual) === polarity(candidate)), level };
  if (level === "agreement") {
    const threshold = probability("threshold" in spec ? spec.threshold ?? 0.9 : 0.9, "agreement");
    const score = Math.max(...candidates.map((candidate) => agreement(actual, candidate)));
    return { accepted: score >= threshold, level, score };
  }
  if (level === "span") {
    const threshold = "threshold" in spec ? spec.threshold ?? 0.5 : 0.5;
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new RangeError("span threshold must be between 0 and 1");
    const qa = "normalization" in spec && spec.normalization === "qa";
    const score = Math.max(...candidates.map((candidate) => spanF1(actual, candidate, qa)));
    if (qa && score < threshold) {
      if (candidates.some((candidate) => polarity(actual) !== void 0 && polarity(actual) === polarity(candidate)))
        return { accepted: true, level, score, comparison_version: "qa-polarity/1" };
      if (candidates.some((candidate) => containsQaSpan(actual, candidate)))
        return { accepted: true, level, score, comparison_version: "qa-span-containment/1" };
      const core = Math.max(0, ...candidates.flatMap((candidate) => qaAnswerCores(actual, candidate, context.question).map((text) => spanF1(text, candidate, true))));
      if (core >= threshold) return { accepted: true, level, score: core, comparison_version: "qa-span-core/1" };
      if (candidates.some((candidate) => qaSameAnswer(actual, candidate, context.question)))
        return { accepted: true, level, score, comparison_version: "qa-same-answer/1" };
    }
    if (score < threshold && !judge2 && "rubric" in spec && spec.rubric)
      return { accepted: false, level, score, needs_review: true, verdict: "answer equivalence needs independent review" };
    if (score < threshold && judge2 && "rubric" in spec && spec.rubric) {
      const verdict2 = await judge2({ actual, expected: { answer: expected, context: spec.context }, rubric: spec.rubric });
      return { accepted: verdict2.accepted === true && !verdict2.needs_review, level, score, verdict: verdict2.verdict, ...verdict2.needs_review ? { needs_review: true } : {} };
    }
    return { accepted: score >= threshold, level, score };
  }
  if (!judge2) return { accepted: false, level, verdict: "no judge supplied", needs_review: true };
  const verdict = await judge2({ actual, expected, rubric: "rubric" in spec ? spec.rubric ?? "" : "" });
  return { accepted: verdict.accepted === true && !verdict.needs_review, level, verdict: verdict.verdict, ...verdict.needs_review ? { needs_review: true } : {} };
}

// src/evaluation/report.ts
function pairedChanges(baseline, selected) {
  return baseline.results.map((before) => {
    const after = selected.results.find((result) => result.caseId === before.caseId);
    return {
      caseId: before.caseId,
      baseline: before.quality,
      selected: after?.quality ?? null,
      delta: before.quality !== null && after?.quality !== null && after?.quality !== void 0 ? after.quality - before.quality : null,
      baselineOutcome: before.outcome.kind,
      selectedOutcome: after?.outcome.kind ?? null
    };
  });
}
function evaluationSummary(batch, cases) {
  const outcomes = {}, gates = {};
  const slices = {};
  for (const result of batch.results) {
    const outcome = result.outcome.error?.outcome ?? result.outcome.kind;
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    for (const [key, passed] of Object.entries(result.gates)) {
      gates[key] ??= { passed: 0, failed: 0 };
      gates[key][passed ? "passed" : "failed"]++;
    }
    for (const slice of cases.find((testCase) => testCase.id === result.caseId)?.slices ?? []) {
      slices[slice] ??= { count: 0, quality: 0 };
      slices[slice].count++;
      if (result.quality === null) slices[slice].quality = null;
      else if (slices[slice].quality !== null) slices[slice].quality += result.quality;
    }
  }
  for (const slice of Object.values(slices)) if (slice.quality !== null) slice.quality /= slice.count;
  return {
    quality: batch.quality,
    cases: batch.results.length,
    gatesPassed: batch.gatesPassed,
    outcomes,
    gates,
    slices,
    meanLatencyMs: batch.results.length ? batch.results.reduce((sum, result) => sum + result.latencyMs, 0) / batch.results.length : null,
    modelCalls: batch.results.reduce((sum, result) => sum + result.usage.modelCalls, 0),
    coverage: [...new Set(batch.results.flatMap((result) => [...result.coverage]))].sort()
  };
}
function replicateUncertainty(batches) {
  const values = batches.map((batch) => batch.quality).filter((value) => value !== null);
  const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const variance = values.length > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1) : null;
  return {
    replicates: batches.length,
    completeReplicates: values.length,
    mean,
    standardDeviation: variance === null ? null : Math.sqrt(variance),
    standardError: variance === null ? null : Math.sqrt(variance / values.length)
  };
}

// src/adaptation/node.ts
import { readFileSync } from "node:fs";
function loadAdaptation(path) {
  return parseAdaptation(readFileSync(path, "utf8"));
}

// src/optimization/optimize.ts
import { join as join2 } from "node:path";
import { randomUUID } from "node:crypto";

// src/evaluation/feedback.ts
var EvaluationFeedbackError = class extends Error {
};
function trainingFeedback(prepared, batch, keys) {
  return batch.results.filter((result) => result.split === "train").map((result) => {
    const testCase = prepared.cases.find((testCase2) => testCase2.id === result.caseId);
    let custom;
    try {
      const value = prepared.suite.feedback?.(testCase, result);
      custom = value === void 0 ? void 0 : cloneData(value);
    } catch (error) {
      throw new EvaluationFeedbackError("evaluation feedback projection must return finite JSON: " + String(error));
    }
    return {
      caseId: result.caseId,
      quality: result.quality,
      gates: result.gates,
      feedback: result.feedback,
      outcome: result.outcome.kind,
      ...custom === void 0 ? {} : { projected: custom },
      invocations: result.traces.filter((trace) => keys.includes(String(trace.adaptation?.component))).map((trace) => ({ callId: trace.callId, component: trace.adaptation?.component, outcome: trace.outcome, detail: trace.detail }))
    };
  });
}

// src/optimization/strategies/gepa.ts
function memberOf(candidate) {
  return {
    id: candidate.id,
    quality: candidate.validation.quality ?? 0,
    scores: candidate.validation.results.map((result) => ({ caseId: result.caseId, quality: result.quality ?? 0 }))
  };
}
function frontierParents(population) {
  return frontier(population.map(memberOf));
}
function mergeCandidates(baseline, left, right) {
  const merged = {};
  for (const key of Object.keys(baseline)) {
    const a = left[key], b = right[key], base = canonical(baseline[key]);
    if (canonical(a) !== base && canonical(b) !== base && canonical(a) !== canonical(b)) return null;
    merged[key] = canonical(a) !== base ? a : b;
  }
  return merged;
}
function measures(candidate) {
  const results = candidate.validation.results;
  return {
    modelCalls: results.reduce((sum, result) => sum + result.usage.modelCalls, 0),
    latency: results.reduce((sum, result) => sum + result.latencyMs, 0) / results.length,
    cost: results.some((result) => result.usage.cost === null) ? null : results.reduce((sum, result) => sum + result.usage.cost, 0)
  };
}
function selectionEligible(candidate, policy = {}) {
  if (!candidate.validation.gatesPassed || candidate.validation.quality === null) return false;
  const use = measures(candidate);
  return (policy.maxMeanLatencyMs === void 0 || use.latency <= policy.maxMeanLatencyMs) && (policy.maxModelCalls === void 0 || use.modelCalls <= policy.maxModelCalls) && (policy.maxCost === void 0 || use.cost !== null && use.cost <= policy.maxCost);
}
function meanBetter(left, right, policy = {}) {
  const tie = policy.tieBreak && policy.tieBreak !== "baseline" ? policy.tieBreak : void 0;
  const view = (candidate) => ({ candidate, quality: candidate.validation.quality });
  return better(view(left), view(right), {
    eligible: (item) => selectionEligible(item.candidate, policy),
    measure: tie ? (item) => measures(item.candidate)[tie] : void 0
  });
}

// src/optimization/vendor/ax-gepa/gepaDependencies.ts
function getUpdateGroup(target, targets) {
  const byId = new Map(targets.map((item) => [item.key, item]));
  const out = /* @__PURE__ */ new Map();
  const visit = (id) => {
    const item = byId.get(id);
    if (!item || out.has(id)) return;
    out.set(id, item);
    for (const dep of item.dependsOn ?? []) visit(dep);
  };
  visit(target.key);
  return [...out.values()];
}

// src/optimization/policies.ts
var NL_FILES = {
  chooseParent: "improveStep/chooseParent.nl",
  chooseMove: "componentSearchStep/chooseMove.nl",
  chooseComponents: "componentSearchStep/chooseComponents.nl"
};
var loaded = /* @__PURE__ */ new Map();
function policyFunction(name) {
  let callable = loaded.get(name);
  if (!callable) loaded.set(name, callable = loadVirtualNatlang(AUTHORED_IMPROVER, NL_FILES[name]));
  return callable;
}
function checkPolicySettings(settings) {
  const known = ["chooseParent", "chooseMove", "chooseComponents"];
  for (const key of Object.keys(settings ?? {})) if (!known.includes(key))
    throw new RangeError(`search policies are ${known.join(", ")}; "${key}" is not one of them`);
  return settings ?? {};
}
var must = (ok, message) => {
  if (!ok) throw new Error(message);
};
function parentChoices(population) {
  const members = population.map(memberOf), won = wonCases(members);
  return members.map((member) => ({
    id: member.id,
    quality: member.quality,
    wonCases: won[member.id] ?? [],
    timesParent: population.filter((candidate) => candidate.parents.includes(member.id)).length
  }));
}
function verifyParent(id, population) {
  must(population.some((member) => member.id === id), `A parent is the id of a population member; choose one of: ${population.map((member) => member.id).join(", ")}.`);
  return id;
}
function crispMove(strategy, iteration, members) {
  return strategy === "gepa" && iteration % 4 === 3 && members > 1 ? "compose" : "edit";
}
function moveFacts(iteration, population, baseline) {
  return { iteration, members: population.map((member) => ({
    id: member.id,
    changedKeys: Object.keys(baseline).filter((key) => canonical(member.value[key]) !== canonical(baseline[key])).sort()
  })) };
}
function verifyMove(move, members) {
  must(move === "edit" || move === "compose", "A move is `edit` or `compose`.");
  must(move === "edit" || members > 1, "The move `compose` merges two population members; the population has one member, so the move is `edit`.");
  return move;
}
function closeUnderDependencies(keys, targets) {
  const closed = /* @__PURE__ */ new Set();
  for (const key of keys) {
    const target = targets.find((item) => item.key === key);
    if (target) for (const member of getUpdateGroup(target, targets)) closed.add(member.key);
  }
  return [...closed];
}
function verifyComponents(keys, eligible) {
  must(keys.length > 0, "Choose at least one component key.");
  const outside = keys.filter((key) => !eligible.includes(key));
  must(!outside.length, `Component keys are among the eligible ones (${eligible.join(", ")}); these are not: ${outside.join(", ")}.`);
  return [...keys];
}
function componentFactsOf(keys, parent, selector) {
  return { eligible: keys.map((key) => {
    const covering = parent.train.results.filter((result) => [...result.coverage].includes(key));
    return {
      key,
      coveredCases: covering.length,
      failingCases: covering.filter((result) => (result.quality ?? 0) < 1).length,
      proposals: selector[key]?.proposals ?? 0,
      accepts: selector[key]?.accepts ?? 0
    };
  }) };
}
function decide2(name, setting, crisp, nl2) {
  return pluggable({ crisp, nl: nl2 }, setting, { name, default: "crisp", serve: "crisp" });
}

// src/optimization/vendor/ax-gepa/gepaSelection.ts
var ComponentSelector = class {
  constructor(targets, initialState) {
    this.targets = targets;
    for (const target of targets) {
      const existing = initialState?.[target.key];
      this.states.set(target.key, {
        proposals: Math.max(0, Math.floor(existing?.proposals ?? 0)),
        accepts: Math.max(0, Math.floor(existing?.accepts ?? 0)),
        lastAcceptIter: Math.floor(existing?.lastAcceptIter ?? -1),
        stagnation: Math.max(0, Math.floor(existing?.stagnation ?? 0))
      });
    }
  }
  targets;
  states = /* @__PURE__ */ new Map();
  getState(id) {
    const state = this.states.get(id);
    return state ? { ...state } : void 0;
  }
  snapshot() {
    return Object.fromEntries(
      [...this.states.entries()].map(([id, state]) => [id, { ...state }])
    );
  }
  pick(iteration, rand) {
    if (this.targets.length === 1) return this.targets[0];
    if (rand() < 0.1) {
      return this.targets[Math.floor(rand() * this.targets.length)];
    }
    const totalProposals = Math.max(
      1,
      [...this.states.values()].reduce((sum, state) => sum + state.proposals, 0)
    );
    const weights = this.targets.map((target) => {
      const state = this.states.get(target.key);
      const acceptRate = state.proposals === 0 ? 0 : state.accepts / state.proposals;
      const proposalPressure = state.proposals / totalProposals;
      const staleBoost = state.lastAcceptIter < 0 ? Math.min(iteration + 1, 10) : Math.min(iteration - state.lastAcceptIter, 10);
      return 1.4 * (1 - acceptRate) + 0.8 * state.stagnation + 0.2 * staleBoost - 0.7 * proposalPressure;
    });
    const max = Math.max(...weights);
    const exp = weights.map((weight) => Math.exp(weight - max));
    const total = exp.reduce((sum, weight) => sum + weight, 0);
    let threshold = rand() * total;
    for (let i = 0; i < exp.length; i++) {
      threshold -= exp[i];
      if (threshold <= 0) return this.targets[i];
    }
    return this.targets[this.targets.length - 1];
  }
  recordProposal(id) {
    const state = this.states.get(id);
    if (!state) return;
    state.proposals += 1;
  }
  recordResult(id, accepted, iteration) {
    const state = this.states.get(id);
    if (!state) return;
    if (accepted) {
      state.accepts += 1;
      state.lastAcceptIter = iteration;
      state.stagnation = 0;
    } else {
      state.stagnation += 1;
    }
  }
};

// src/optimization/authored-engine.ts
async function runAuthoredSearch(context) {
  const { prepared, options, settings, state, target, descriptors, train, validation, gateway, batch, checkpoint, emit } = context;
  const targets = descriptors.map((component) => ({ key: component.key, dependsOn: settings.dependencies[component.key] ?? [] }));
  const values = new Map(state.population.map((member2) => [member2.id, member2.value]));
  const evidence = /* @__PURE__ */ new Map();
  const merged = /* @__PURE__ */ new Set();
  let plan;
  let composing = false;
  let chose = { chooseParent: "crisp", chooseComponents: "crisp", chooseMove: "crisp" };
  let selector = new ComponentSelector(targets, state.selector);
  const policies = checkPolicySettings(settings.policies);
  const random = () => {
    const step = draw(state.rng);
    state.rng = step.next;
    return step.value;
  };
  const member = () => state.population.find((item) => item.id === state.incumbent);
  const register = (value) => {
    const id = fingerprint(value);
    values.set(id, value);
    return id;
  };
  let committed = structuredClone(state);
  const pendingEvents = [];
  const event = (value) => pendingEvents.push(value);
  const services = {
    plan: async (iteration) => {
      gateway.check(options.signal);
      if (iteration !== state.iteration) throw Error("stale authored iteration");
      const covered = new Set(state.population.flatMap((candidate) => candidate.train.results.flatMap((result) => [...result.coverage])));
      const eligible = targets.filter((item) => covered.has(item.key));
      if (!eligible.length) return { stopReason: "coverage-gap", incumbent: member().value };
      const find = (id) => state.population.find((item) => item.id === id);
      if (plan?.iteration !== iteration) {
        const journaled = state.plan?.iteration === iteration ? state.plan : void 0;
        const parent0 = journaled && find(journaled.parent), partner0 = journaled && find(journaled.partner);
        if (journaled && parent0 && partner0) {
          selector.recordProposal(journaled.selected);
          plan = { iteration, parent: parent0, selected: { key: journaled.selected }, keys: journaled.keys, mini: journaled.mini, partner: partner0 };
          composing = journaled.compose;
          chose = journaled.chose;
        } else {
          const parentId = await decide2(
            "chooseParent",
            policies.chooseParent,
            async () => {
              const winners = state.strategy === "gepa" ? frontierParents(state.population) : [state.incumbent];
              return pick(winners.length ? winners : [state.incumbent], random());
            },
            async () => verifyParent(await policyFunction("chooseParent")(parentChoices(state.population)), state.population)
          )();
          const parent = find(parentId) ?? find(state.incumbent);
          const chosen = await decide2(
            "chooseComponents",
            policies.chooseComponents,
            async () => {
              let selected2 = selector.pick(iteration, random);
              if (!eligible.some((item) => item.key === selected2.key)) selected2 = eligible[Math.floor(random() * eligible.length)];
              return [selected2.key];
            },
            async () => verifyComponents(await policyFunction("chooseComponents")(componentFactsOf(eligible.map((item) => item.key), parent, selector.snapshot())), eligible.map((item) => item.key))
          )();
          const selected = { key: chosen[0] };
          const keys = closeUnderDependencies(chosen, targets);
          gateway.reserve("proposals", 1, options.signal);
          selector.recordProposal(selected.key);
          const shuffled = [...train];
          for (let index = shuffled.length - 1; index > 0; index--) {
            const picked = Math.floor(random() * (index + 1));
            [shuffled[index], shuffled[picked]] = [shuffled[picked], shuffled[index]];
          }
          const move = state.strategy === "gepa" ? await decide2(
            "chooseMove",
            policies.chooseMove,
            async () => crispMove(state.strategy, iteration, state.population.length),
            async () => verifyMove(await policyFunction("chooseMove")(moveFacts(iteration, state.population, state.baseline.value)), state.population.length)
          )() : "edit";
          composing = move === "compose";
          const partner = composing ? state.population[Math.floor(random() * state.population.length)] : parent;
          plan = { iteration, parent, selected, keys, mini: shuffled.slice(0, settings.minibatchSize).sort(), partner };
          chose = { chooseParent: policies.chooseParent ?? "crisp", chooseComponents: policies.chooseComponents ?? "crisp", chooseMove: policies.chooseMove ?? "crisp" };
          state.plan = { iteration, parent: parent.id, partner: partner.id, selected: selected.key, keys, mini: plan.mini, compose: composing, chose };
          checkpoint();
          committed = structuredClone(state);
        }
      }
      const open = plan;
      const feedback = await target.feedback(open.parent.train, open.keys);
      return {
        stopReason: "",
        parent: open.parent.value,
        parentId: open.parent.id,
        keys: open.keys,
        components: descriptors.filter((item) => open.keys.includes(item.key)),
        feedback: new EvidenceView(feedback),
        compose: composing,
        duplicateIds: state.population.map((item) => item.id)
      };
    },
    merge: () => {
      if (!plan) throw Error("experiment not opened");
      const value = mergeCandidates(state.baseline.value, plan.parent.value, plan.partner.value);
      if (value) merged.add(fingerprint(value));
      return value;
    },
    check: async (value) => {
      if (!plan) throw Error("experiment not opened");
      if (!merged.has(fingerprint(value))) {
        const problem = componentProblem(plan.parent.value, value, plan.keys);
        if (problem) return { valid: false, id: "", feedback: problem };
      }
      let candidate;
      try {
        candidate = validateCandidate(value, descriptors);
      } catch (error) {
        return { valid: false, id: "", feedback: String(error) };
      }
      const checked = await target.validate(candidate);
      return { ...checked, id: checked.valid ? register(candidate) : "" };
    },
    evaluate: async (id, split, parent = false) => {
      if (!plan) throw Error("experiment not opened");
      const value = parent ? plan.parent.value : values.get(id);
      if (!value) throw Error("unregistered candidate");
      const measured = await batch(value, split === "mini" ? plan.mini : split === "train" ? train : validation);
      const reference = fingerprint({ id: parent ? plan.parent.id : id, split, digest: measured.digest });
      evidence.set(reference, { batch: measured, id: parent ? plan.parent.id : id, split });
      return { evidence: reference, quality: measured.quality, gatesPassed: measured.gatesPassed };
    },
    finish: async (input) => {
      if (!plan) {
        if (input.stopReason !== "coverage-gap") throw Error("experiment not opened");
        state.stopReason = "coverage-gap";
        return { state: { iteration: state.iteration, incumbent: state.incumbent, done: true, stopReason: "coverage-gap" }, candidate: member().value };
      }
      const iteration = plan.iteration;
      if (input.accepted) {
        const value = values.get(input.candidate ?? ""), training = evidence.get(input.train ?? ""), validated = evidence.get(input.validation ?? "");
        if (!value || !training || !validated || training.id !== input.candidate || validated.id !== input.candidate || training.split !== "train" || validated.split !== "validation") throw Error("acceptance requires complete independently executed evidence");
        const a = await batch(plan.parent.value, plan.mini), b = await batch(value, plan.mini);
        if (!b.gatesPassed || !(b.quality > a.quality)) throw Error("acceptance violates paired improvement");
        if (state.population.some((item) => item.id === input.candidate)) throw Error("duplicate accepted candidate");
        const candidate = { id: input.candidate, value, parents: [plan.parent.id], train: training.batch, validation: validated.batch };
        state.population.push(candidate);
        const guidanceChanged = descriptors.some((component) => component.kind === "program.guidance" && canonical(candidate.value[component.key]) !== canonical(component.baseline));
        const missing = guidanceChanged ? prepared.program.components.filter((component) => component.kind === "lambda.instructions" && !validated.batch.results.some((result) => result.coverage.includes(component.key))).map((item) => item.key) : [];
        if (missing.length) event({ iteration, type: "insufficient-guidance-coverage", components: missing });
        else if (meanBetter(candidate, member(), prepared.suite.selection)) state.incumbent = candidate.id;
        if (state.population.length > settings.maxPopulation) {
          const kept = new Set(prune(state.population.map(memberOf), [state.incumbent, state.baseline.id], settings.maxPopulation).map((item) => item.id));
          state.population = state.population.filter((item) => kept.has(item.id));
        }
      }
      selector.recordResult(plan.selected.key, input.accepted, iteration);
      state.selector = selector.snapshot();
      state.iteration++;
      delete state.plan;
      const done = gateway.ledger.proposals >= gateway.limits.maxProposals;
      const type = input.error ? "invalid-proposal" : input.candidate ? input.accepted ? "accepted" : "rejected" : "duplicate-proposal";
      event({ iteration, type, candidate: input.candidate ?? null, parent: plan.parent.id, keys: plan.keys, chose, ...input.error ? { error: input.error } : {} });
      plan = void 0;
      return { state: { iteration: state.iteration, incumbent: state.incumbent, done, stopReason: done ? "completed" : "" }, candidate: member().value };
    }
  };
  const declaration = `export function plan(iteration:number):Promise<unknown>;
export function merge():unknown;
export function check(candidate:unknown):Promise<{valid:boolean;id:string;feedback?:string}>;
export function evaluate(id:string,split:'mini'|'train'|'validation',parent?:boolean):Promise<{evidence:string;quality:number;gatesPassed:boolean}>;
export function finish(decision:unknown):Promise<{state:ComponentLoopState;candidate:Candidate}>;`;
  const runtime = createNatlangRuntime({
    model: { driver: gateway.driver(options.reflection, "reflection", options.signal), maxTurns: 16, maxTokens: 32e3, turnTokens: 4096, maxFailureRepairs: settings.maxRepairs },
    services: { search: services },
    serviceDeclarations: { search: declaration },
    serviceScopes: { search: ["componentSearchStep.nl"] },
    trace: context.trace,
    network: false,
    codeEdits: "deny",
    signal: options.signal
  });
  const folder = Folder.fromFiles({ "components.json": JSON.stringify(member().value) });
  const initial = { iteration: state.iteration, incumbent: state.incumbent, done: gateway.ledger.proposals >= gateway.limits.maxProposals, stopReason: "" };
  try {
    const result = await runtime.run(() => folder.iterateOn(loadVirtualNatlang(AUTHORED_IMPROVER, "componentSearchStep.nl"), initial).withMeasure((step) => step.done ? 0 : gateway.limits.maxProposals - step.iteration).onStep(async (event2) => {
      if (event2.kind === "step" && event2.state) {
        if (event2.state.state.incumbent !== state.incumbent || canonical(JSON.parse(await event2.state.folder.readText("components.json"))) !== canonical(member().value)) throw Error("authored selected source/state mismatch");
        checkpoint();
        committed = structuredClone(state);
        for (const pending of pendingEvents.splice(0)) emit(pending);
        checkpoint();
        committed = structuredClone(state);
      }
    }).until((step) => step.done));
    state.stopReason = result.state.stopReason || "completed";
  } catch (error) {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, committed, { ledger: gateway.snapshot() });
    pendingEvents.splice(0);
    gateway.check(options.signal);
    let cause = error;
    const seen = /* @__PURE__ */ new Set();
    while (cause instanceof Error && !seen.has(cause)) {
      seen.add(cause);
      if (cause instanceof BudgetExhausted || cause instanceof EvaluationFeedbackError) throw cause;
      cause = cause.cause;
    }
    throw error;
  }
}

// src/optimization/run-store.ts
import { existsSync, mkdirSync, readFileSync as readFileSync2, writeFileSync, renameSync, unlinkSync, openSync, closeSync, fsyncSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
var RunStore = class {
  directory;
  lock;
  token = fingerprint({ pid: process.pid, time: Date.now(), nonce: Math.random() });
  constructor(directory) {
    this.directory = resolve(directory);
    mkdirSync(this.directory, { recursive: true });
    this.lock = join(this.directory, "run.lock");
    if (existsSync(this.lock)) {
      const previous = JSON.parse(readFileSync2(this.lock, "utf8"));
      try {
        process.kill(previous.pid, 0);
        throw new Error("adaptation run is locked by process " + previous.pid);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
        unlinkSync(this.lock);
      }
    }
    const fd = openSync(this.lock, "wx");
    try {
      writeFileSync(fd, canonical({ pid: process.pid, token: this.token }));
    } finally {
      closeSync(fd);
    }
  }
  has(name) {
    return existsSync(join(this.directory, name));
  }
  read(name) {
    return parseStrictJSON(readFileSync2(join(this.directory, name), "utf8"));
  }
  write(name, value) {
    this.writeText(name, canonical(value) + "\n");
  }
  writeText(name, text) {
    const target = join(this.directory, name);
    const tmp = target + "." + this.token + ".tmp";
    const fd = openSync(tmp, "w");
    try {
      writeFileSync(fd, text);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, target);
    const directory = openSync(dirname(target), "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  }
  manifest(value) {
    if (this.has("manifest.json")) {
      if (canonical(this.read("manifest.json")) !== canonical(value)) throw new Error("immutable run manifest differs");
    } else this.write("manifest.json", value);
  }
  blob(value) {
    const hash = fingerprint(value);
    const dir = join(this.directory, "blobs");
    mkdirSync(dir, { recursive: true });
    const name = "blobs/" + hash + ".json";
    if (!this.has(name)) this.write(name, value);
    return hash;
  }
  event(value) {
    const index = this.has("events.json") ? this.read("events.json") : [];
    index.push(this.blob(value));
    this.write("events.json", index);
  }
  close() {
    if (existsSync(this.lock) && this.read("run.lock").token === this.token) unlinkSync(this.lock);
  }
};

// src/optimization/checkpoint.ts
var ENGINE_VERSION = "natlang.authored-gepa/v1";
function saveCheckpoint(store, state) {
  store.write("checkpoint.json", { ...state, checkpointDigest: fingerprint(state, "natlang.checkpoint/v1") });
}
function readCheckpoint(store, suiteHash, programHash, optionsHash) {
  const { checkpointDigest, ...state } = store.read("checkpoint.json");
  if (state.schema !== "natlang.adaptation-run/v1" || state.engine !== ENGINE_VERSION) throw new Error("checkpoint belongs to a different authored engine; rebuild the run");
  if (checkpointDigest !== fingerprint(state, "natlang.checkpoint/v1")) throw new Error("optimization checkpoint integrity mismatch; restore the last intact checkpoint");
  if (state.suiteHash !== suiteHash || state.programHash !== programHash || state.optionsHash !== optionsHash) throw new Error("optimization resume fingerprint mismatch");
  return state;
}

// src/optimization/promotion.ts
function promote(prepared, state, finalized = state.selected) {
  const selected = state.population.find((candidate) => candidate.id === state.incumbent) ?? state.baseline;
  const artifact = candidateArtifact(prepared, selected.value, state.runId);
  artifact.provenance = {
    ...artifact.provenance,
    promotion: finalized ? "selected" : "incumbent",
    strategy: state.strategy,
    engine: state.engine,
    seed: state.seed,
    evidence: {
      baselineQuality: state.baseline.validation.quality,
      selectedQuality: selected.validation.quality,
      gatesPassed: selected.validation.gatesPassed,
      validationDigest: selected.validation.digest,
      lockedTestDigest: state.lockedTest?.digest ?? null,
      ledger: state.ledger,
      stopReason: state.stopReason ?? null
    }
  };
  artifact.digest = artifactDigest(artifact);
  return artifact;
}

// src/optimization/report.ts
var cell2 = (value) => String(value ?? "unknown").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
var block = (value) => {
  const text = JSON.stringify(value, null, 2);
  const width = Math.max(3, ...[...text.matchAll(/`+/g)].map((match) => match[0].length + 1));
  const fence = "`".repeat(width);
  return fence + "json\n" + text + "\n" + fence + "\n";
};
function optimizationMarkdown(report) {
  let text = "# Adaptation run " + cell2(report.runId) + "\n\nStrategy: " + report.strategy + ". Stop: " + report.stopReason + ". Executor: " + cell2(report.executor.id) + ".\n\nPromotion: " + cell2(report.promotion) + ". Locked test: " + cell2(report.holdoutStatus) + ".\n\n| Evaluation | Quality | Cases | Gates |\n| --- | ---: | ---: | --- |\n";
  for (const [label, batch] of [["Baseline validation", report.baseline], ["Selected validation", report.selectedValidation], ["Locked test", report.lockedTest]])
    text += "| " + label + " | " + cell2(batch?.quality) + " | " + cell2(batch?.results.length) + " | " + (batch ? batch.gatesPassed ? "pass" : "fail" : "not completed") + " |\n";
  text += "\nValidation selects the incumbent. Locked test results do not feed proposals or selection.\n\n## Paired validation changes\n\n| Case | Baseline | Selected | Change | Outcome |\n| --- | ---: | ---: | ---: | --- |\n";
  for (const row of pairedChanges(report.baseline, report.selectedValidation)) text += "| " + [row.caseId, row.baseline, row.selected, row.delta, row.baselineOutcome + " \u2192 " + row.selectedOutcome].map(cell2).join(" | ") + " |\n";
  text += "\n## Usage and coverage\n\nUnknown token or cost values indicate unavailable provider evidence.\n\n" + block(report.ledger) + "\nUncovered selected components: " + (report.uncovered.length ? report.uncovered.map(cell2).join(", ") : "none") + ".\n\n## Search history\n\n" + (report.historyTruncated ? `${report.historyTruncated} older events are retained in the run event log.

` : "") + block(report.history) + "\n## Original and selected instructions\n\n" + block(report.instructions);
  return text;
}

// src/optimization/export-patch.ts
import { resolve as resolve2, relative, isAbsolute, sep } from "node:path";
function exportAdaptationPatch(artifact, program, executor, root) {
  root = resolve2(root);
  const binding = bindAdaptation(artifact, program, executor);
  const view = new ProgramView(program, binding);
  for (const [path, original] of Object.entries(program.sources)) {
    if (path.startsWith("@")) continue;
    const file = resolve2(root, path);
    const location = relative(root, file);
    if (location === ".." || location.startsWith(".." + sep) || isAbsolute(location)) throw new Error("program source escapes export root: " + path);
    if (!nodeProjectFiles.isFile(file)) throw new Error("program source is missing; rebuild/revalidate: " + path);
    let actual = nodeProjectFiles.read(file);
    if (path.split("/").at(-1) === "natlang.json") {
      try {
        const manifest2 = JSON.parse(actual);
        if (manifest2.targets) for (const target of Object.values(manifest2.targets)) delete target.adaptation;
        actual = JSON.stringify(manifest2);
      } catch {
      }
    }
    if (actual !== original) throw new Error("program source changed; rebuild/revalidate before source export: " + path);
  }
  const changed = {};
  const manifest = [];
  let patch = "";
  for (const [path, original] of Object.entries(program.sources)) {
    const updated = view.source(path, original);
    if (updated === original) continue;
    changed[path] = updated;
    manifest.push({ path, original: fingerprint(original), updated: fingerprint(updated) });
    const lines = (text) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    const before = lines(original), after = lines(updated);
    const emit = (line, prefix) => prefix + line + (line.endsWith("\n") ? "" : "\n\\ No newline at end of file\n");
    patch += "--- a/" + path + "\n+++ b/" + path + "\n@@ -1," + before.length + " +1," + after.length + " @@\n" + before.map((line) => emit(line, "-")).join("") + after.map((line) => emit(line, "+")).join("");
  }
  const result = buildProject({ project: root, programId: program.id, services: program.services, emit: false, write: false, files: {
    ...nodeProjectFiles,
    read: (path) => {
      const relative2 = path.slice(root.replace(/\/$/, "").length + 1);
      return changed[relative2] ?? nodeProjectFiles.read(path);
    }
  } });
  if (!result.ok) throw new Error("exported source does not compile: " + formatDiagnostics(result.diagnostics));
  for (const path of new Set(program.components.map((component) => component.source?.path).filter(Boolean))) {
    const before = program.components.filter((component) => component.source?.path === path).sort((a, b) => a.source.start - b.source.start);
    const after = result.manifest.adaptation.components.filter((component) => component.source?.path === path).sort((a, b) => a.source.start - b.source.start);
    if (before.length !== after.length || before.some((component, index) => component.contractHash !== after[index]?.contractHash))
      throw new Error("source export changed frozen contracts: " + path);
  }
  const guidance = view.guidance();
  const selectedGuidance = artifact.components.some((component) => component.value.kind === "program.guidance");
  return { patch, manifest, ...guidance || selectedGuidance ? { guidance } : {} };
}
async function revalidateAdaptation(old, prepared, driver, mapping = {}, options = {}) {
  old = validateAdaptation(old);
  const candidate = {};
  const selected = prepared.program.components.filter((component) => prepared.components.includes(component.key));
  const mapped = /* @__PURE__ */ new Set();
  for (const component of selected) candidate[component.key] = component.baseline;
  for (const entry of old.components) {
    const key = mapping[entry.key] ?? entry.key;
    const component = selected.find((component2) => component2.key === key);
    if (mapped.has(key)) throw new Error("revalidation component mappings must be one-to-one: " + key);
    mapped.add(key);
    if (!component || component.contractHash !== entry.contractHash) throw new Error("revalidation needs compatible explicit component mapping: " + entry.key);
    candidate[key] = entry.value;
  }
  validateCandidate(candidate, selected);
  exportAdaptationPatch(candidateArtifact(prepared, candidate), prepared.program, prepared.suite.executorIdentity, prepared.suite.program.root);
  const gateway = new UsageGateway(prepared.suite.budget);
  const baseline = await evaluate(prepared, { split: "validation", driver, gateway, ...options });
  const batch = await evaluate(prepared, { split: "validation", candidate, driver, gateway, ...options });
  const changedGuidance = selected.some((component) => component.kind === "program.guidance" && fingerprint(candidate[component.key]) !== component.baselineHash);
  const coverage = new Set(batch.results.flatMap((result) => [...result.coverage]));
  if (changedGuidance && prepared.program.components.some((component) => component.kind === "lambda.instructions" && !coverage.has(component.key)))
    throw new Error("revalidation failed whole-program guidance coverage; exercise every authored lambda");
  if (!selectionEligible({ id: "revalidation", value: candidate, parents: [], train: batch, validation: batch }, prepared.suite.selection) || batch.quality === null || baseline.quality !== null && batch.quality < baseline.quality)
    throw new Error("revalidation failed required regression gates or paired baseline quality");
  const artifact = candidateArtifact(prepared, candidate, "revalidate-" + old.digest.slice(0, 12));
  artifact.provenance = { ...artifact.provenance, promotion: "revalidated", evidence: {
    previous: old.digest,
    baseline: baseline.digest,
    validation: batch.digest,
    quality: batch.quality,
    ledger: gateway.snapshot(),
    pairedChanges: pairedChanges(baseline, batch)
  } };
  artifact.digest = artifactDigest(artifact);
  return artifact;
}

// src/optimization/optimize.ts
function nativeTarget(prepared, options) {
  const components = prepared.program.components.filter((component) => prepared.components.includes(component.key));
  return {
    components: () => components,
    validate: async (candidate) => {
      try {
        validateCandidate(candidate, components);
        exportAdaptationPatch(candidateArtifact(prepared, candidate), prepared.program, prepared.suite.executorIdentity, prepared.suite.program.root);
        return { valid: true };
      } catch (error) {
        return { valid: false, feedback: String(error) };
      }
    },
    evaluate: (candidate, caseIds, context) => evaluate(prepared, {
      driver: options.executor,
      judge: options.judge,
      candidate,
      caseIds,
      signal: context.signal,
      gateway: context.gateway,
      runId: context.runId,
      seed: context.seed
    }),
    feedback: async (batch, keys) => trainingFeedback(prepared, batch, keys)
  };
}
async function optimize(prepared, options) {
  return search(prepared, options, false);
}
async function resumeOptimization(prepared, directory, options) {
  return search(prepared, { ...options, out: directory }, true);
}
async function search(prepared, options, resume) {
  const strategy = options.strategy ?? "gepa", seed = options.seed ?? 0;
  const limits = options.budget ?? prepared.suite.budget;
  validateBudget(limits);
  const settings = {
    strategy,
    seed,
    limits,
    authored: fingerprint(AUTHORED_IMPROVER),
    opening: fingerprint({ prompt: SYSTEM_PROMPT, tools: "native-default", contextTokens: 16384 }),
    minibatchSize: options.minibatchSize ?? 4,
    maxPopulation: options.maxPopulation ?? 16,
    maxHistory: options.maxHistory ?? 1e3,
    maxRepairs: options.maxRepairs ?? 1,
    policies: checkPolicySettings(options.policies),
    dependencies: options.dependencies ?? {},
    finalTest: options.finalTest ?? true,
    reflectionIdentity: options.reflectionIdentity ?? null,
    judgeIdentity: options.judgeIdentity ?? null,
    selection: prepared.suite.selection ?? null,
    holdoutReservation: options.holdoutReservation ?? {}
  };
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(settings.minibatchSize) || settings.minibatchSize < 1 || !Number.isSafeInteger(settings.maxPopulation) || settings.maxPopulation < 2 || !Number.isSafeInteger(settings.maxHistory) || settings.maxHistory < 1 || !Number.isSafeInteger(settings.maxRepairs) || settings.maxRepairs < 0) throw new Error("invalid search settings");
  const optionsHash = fingerprint(settings);
  const store = new RunStore(options.out ?? join2(prepared.suite.program.root, ".natlang/adaptation/runs", options.runId ?? randomUUID()));
  let state;
  const target = options.target ?? nativeTarget(prepared, options);
  const descriptors = target.components();
  const train = prepared.cases.filter((testCase) => testCase.split === "train").map((testCase) => testCase.id).sort();
  const validation = prepared.cases.filter((testCase) => testCase.split === "validation").map((testCase) => testCase.id).sort();
  const test = prepared.cases.filter((testCase) => testCase.split === "test").map((testCase) => testCase.id).sort();
  if (!train.length || !validation.length) {
    store.close();
    throw new Error("optimization requires independent train and validation cases");
  }
  let gateway;
  let attachedGateway;
  try {
    if (canonical(descriptors.map((component) => component.key).sort()) !== canonical([...prepared.components].sort())) throw new Error("optimization target must retain the prepared component inventory");
    for (const [key, dependencies] of Object.entries(settings.dependencies)) {
      if (!prepared.components.includes(key) || dependencies.some((dependency) => !prepared.components.includes(dependency))) throw new Error("unknown update dependency: " + key);
    }
    if (resume && store.has("checkpoint.json")) state = readCheckpoint(store, prepared.suiteHash, prepared.program.buildHash, optionsHash);
    if (state && !state.selected) delete state.stopReason;
    if (!resume && store.has("checkpoint.json")) throw new Error("run already exists; use resumeOptimization");
    store.manifest({
      schema: "natlang.adaptation-run/v1",
      engine: ENGINE_VERSION,
      suiteHash: prepared.suiteHash,
      programHash: prepared.program.buildHash,
      settings,
      components: descriptors.map((component) => component.key),
      splits: { train, validation, test },
      executor: prepared.suite.executorIdentity
    });
    gateway = new UsageGateway(limits, resume && store.has("ledger.json") ? store.read("ledger.json") : state?.ledger);
    if (settings.finalTest && !state?.selected) gateway.protect({ modelCalls: test.length, ...settings.holdoutReservation });
    attachedGateway = gateway;
    gateway.onUpdate = (ledger) => store.write("ledger.json", ledger);
    const batch = async (candidate, ids) => {
      options.signal?.throwIfAborted();
      const key = fingerprint({
        candidate,
        ids,
        seed,
        suite: prepared.suiteHash,
        program: prepared.program.buildHash,
        executor: prepared.suite.executorIdentity,
        policy: prepared.suite.policy ?? null,
        trace: "complete"
      });
      const cacheFile = "cache-" + key + ".json";
      if (store.has(cacheFile)) {
        const cached = store.read(cacheFile);
        if (cached.digest !== summarize(cached.results).digest) throw new Error("evaluation cache integrity mismatch: " + key);
        store.event({ type: "cache-hit", key });
        return cached;
      }
      store.event({ type: "evaluation-started", key, ids });
      const holdoutReserve = state?.selected || !settings.finalTest ? 0 : test.length;
      if (gateway.ledger.rollouts + ids.length + holdoutReserve > limits.maxRollouts) throw new BudgetExhausted("rollouts (holdout reserved)");
      const result = await target.evaluate(candidate, ids, {
        runId: state?.runId ?? options.runId ?? store.directory,
        evaluationId: key,
        seed,
        signal: options.signal,
        gateway
      });
      if (result.results.length !== ids.length || new Set(result.results.map((result2) => result2.caseId)).size !== ids.length || ids.some((id) => !result.results.some((result2) => result2.caseId === id)) || result.results.some((result2) => result2.status !== "scored" || result2.quality === null || !Number.isFinite(result2.quality) || result2.quality < 0 || result2.quality > 1))
        throw new Error("evaluator returned invalid/incomplete results");
      const normalized2 = summarize(result.results);
      store.write(cacheFile, normalized2);
      store.blob(normalized2);
      store.event({ type: "evaluation-completed", key });
      return normalized2;
    };
    if (!state) {
      const baselineValue = validateCandidate(Object.fromEntries(descriptors.map((component) => [component.key, component.baseline])), descriptors);
      const baseline = {
        id: fingerprint(baselineValue),
        value: baselineValue,
        parents: [],
        train: await batch(baselineValue, train),
        validation: await batch(baselineValue, validation)
      };
      state = {
        schema: "natlang.adaptation-run/v1",
        engine: ENGINE_VERSION,
        runId: options.runId ?? store.directory.split("/").at(-1),
        suiteHash: prepared.suiteHash,
        programHash: prepared.program.buildHash,
        optionsHash,
        strategy,
        seed,
        rng: seed >>> 0 || 2654435769,
        iteration: 0,
        population: [baseline],
        baseline,
        incumbent: baseline.id,
        selector: {},
        history: [],
        ledger: gateway.snapshot(),
        selected: false
      };
      saveCheckpoint(store, state);
    }
    const checkpoint = () => {
      state.ledger = gateway.snapshot();
      saveCheckpoint(store, state);
    };
    const emit = (event) => {
      state.history.push(event);
      if (state.history.length > settings.maxHistory) {
        const removed = state.history.length - settings.maxHistory;
        state.history.splice(0, removed);
        state.historyTruncated = (state.historyTruncated ?? 0) + removed;
      }
      store.event(event);
      options.progress?.(event);
    };
    if (!state.selected) {
      try {
        await runAuthoredSearch({ prepared, options, settings, state, target, descriptors, train, validation, gateway, batch, checkpoint, emit, trace: (value) => store.event({ type: "improver-invocation", trace: store.blob(JSON.parse(JSON.stringify(value))) }) });
        state.stopReason ??= "completed";
      } catch (error) {
        if (options.signal?.aborted || error instanceof BudgetExhausted) {
          const committed = readCheckpoint(store, prepared.suiteHash, prepared.program.buildHash, optionsHash);
          Object.assign(state, committed);
        }
        if (options.signal?.aborted) state.stopReason = "cancelled";
        else if (error instanceof BudgetExhausted) state.stopReason = "budget-exhausted";
        else {
          state.stopReason = "infrastructure-error";
          checkpoint();
          throw error;
        }
      }
      checkpoint();
      if (state.stopReason !== "cancelled") {
        state.selected = true;
        checkpoint();
      }
    }
    if (state.selected) gateway.protect({});
    if (state.selected && settings.finalTest && test.length && !state.lockedTest) {
      try {
        state.lockedTest = await batch(state.population.find((candidate) => candidate.id === state.incumbent).value, test);
        checkpoint();
      } catch (error) {
        if (!(error instanceof BudgetExhausted) && !options.signal?.aborted) throw error;
        emit({ type: "holdout-incomplete", reason: String(error) });
        checkpoint();
      }
    }
    const selected = state.population.find((candidate) => candidate.id === state.incumbent);
    const uncovered = descriptors.filter((component) => !state.population.some((candidate) => candidate.train.results.some((result) => result.coverage.includes(component.key)))).map((component) => component.key);
    if (uncovered.length && state.stopReason === "completed") {
      state.stopReason = "coverage-gap";
      checkpoint();
    }
    const holdoutComplete = !settings.finalTest || !test.length || !!state.lockedTest;
    const holdoutPassed = state.lockedTest?.gatesPassed ?? true;
    const finalized = state.selected && holdoutComplete && holdoutPassed;
    const artifact = promote(prepared, state, finalized);
    const report = {
      runId: state.runId,
      strategy,
      stopReason: state.stopReason,
      improvement: selected.validation.quality - state.baseline.validation.quality,
      baseline: state.baseline.validation,
      selectedValidation: selected.validation,
      lockedTest: state.lockedTest ?? null,
      pairedChanges: pairedChanges(state.baseline.validation, selected.validation),
      summaries: {
        baseline: evaluationSummary(state.baseline.validation, prepared.cases),
        validation: evaluationSummary(selected.validation, prepared.cases),
        lockedTest: state.lockedTest ? evaluationSummary(state.lockedTest, prepared.cases) : null
      },
      promptLengths: Object.fromEntries(Object.entries(selected.value).map(([key, value]) => [key, value.kind === "program.guidance" ? value.text.length : value.template.segments.join("").length])),
      uncovered,
      ledger: state.ledger,
      history: state.history,
      historyTruncated: state.historyTruncated ?? 0,
      executor: prepared.suite.executorIdentity,
      reflection: settings.reflectionIdentity,
      judge: settings.judgeIdentity,
      randomness: { searchSeed: seed, caseSeeds: "case ID and replicate", modelSeeding: "Requested; provider support is caller declared." },
      instructions: { baseline: state.baseline.value, selected: selected.value },
      compatibility: "validated",
      promotion: artifact.provenance.promotion,
      holdoutComplete,
      holdoutStatus: !settings.finalTest ? "disabled" : !test.length ? "not-configured" : state.lockedTest ? holdoutPassed ? "passed" : "failed" : "incomplete"
    };
    if (selectionEligible(selected, prepared.suite.selection) && holdoutPassed) store.write(finalized ? "selected.json" : "incumbent.json", artifact);
    store.write("report.json", report);
    store.writeText("report.md", optimizationMarkdown(report));
    if (!selectionEligible(selected, prepared.suite.selection)) throw new Error("evaluation regression: no candidate passes required validation gates and selection constraints");
    if (!holdoutPassed) throw new Error("evaluation regression: frozen finalist failed locked test gates; no artifact was promoted");
    return { artifact, report, state, directory: store.directory };
  } catch (error) {
    store.write("failure-report.json", {
      status: error instanceof Error && error.message.startsWith("evaluation regression:") ? "regression" : "infrastructure-or-input-error",
      error: String(error),
      committedIteration: state?.iteration ?? null,
      incumbent: state?.incumbent ?? null,
      ledger: attachedGateway?.snapshot() ?? null
    });
    throw error;
  } finally {
    if (attachedGateway) attachedGateway.onUpdate = void 0;
    store.close();
  }
}
export {
  ADAPTATION_SCHEMA,
  ANSWER_COMPARISON_VERSION,
  AUDIT_MINIMUM,
  AdaptationError,
  BudgetExhausted,
  CALLS_VERSION,
  CALL_MINIMUM,
  CallCapture,
  CallStore,
  CompilationCache,
  Context,
  ContextError,
  CrispTier,
  DATA_QUALITY_VERSION,
  DEFAULT_SETTINGS,
  Deopt,
  EvaluationInfrastructureError,
  FILE_CONTENT_COMPARISON_VERSION,
  FileHandle,
  FixtureObservationStore,
  Folder,
  FolderHandle,
  FolderIteration,
  FolderSnapshot,
  ImplementationTier,
  Iteration,
  IterationDivergedError,
  IterationLimitError,
  IterationStepError,
  MemoryIterationStatistics,
  MemoryVerdictCache,
  ModelTier,
  ModuleUnavailableError,
  NatlangCallError,
  NatlangContextError,
  NatlangPlatformUnavailableError,
  NatlangRecursionError,
  NatlangRuntime,
  NatlangTask,
  NeuraleseTier,
  NzFileError,
  ORACLE_LEVELS,
  RECENT,
  ROOT_NODE,
  RealmEnvironment,
  RefinementCallError,
  RefinementChecker,
  RefinementError,
  ReplayDivergence,
  ReplayServices,
  SelectedEventQueue,
  SlotContextStore,
  SpecializedTier,
  TRACES_DECLARATIONS,
  TierEngine,
  TierLedger,
  UsageGateway,
  VALUE_CLASSES,
  WEIGHTS_SCHEMA,
  WeightBinding,
  WeightBindingError,
  WeightManifestError,
  __natlang,
  accessor,
  admit,
  agreement,
  answerEquivalenceEnabled,
  applicationContextRecords,
  applyDecision,
  approachHash,
  approaches,
  artifactDigest,
  assembleCases,
  assume,
  authoredTextGuidance,
  behaviorLabel,
  betterFinding,
  bindAdaptation,
  bindingSemanticHash,
  builtin,
  builtinDefinition,
  builtinNames,
  builtinRecords,
  callFailureReason,
  callableTree,
  candidateConditions,
  candidatePredicates,
  canonical,
  canonicalValue,
  caseFor,
  caseHashes,
  caseServices,
  caseSources,
  checkFileReturn,
  checkFiles,
  checkFilesWithJudge,
  checkOracle,
  compareBehaviors,
  compileGuard,
  compileScopeTree,
  compileVirtualProject,
  componentKey,
  constructorRealm,
  containsQaSpan,
  contextInterface,
  countLines,
  createNatlangRuntime,
  createResolvedModelSession,
  crispDecline,
  crispPolicy,
  csvRows,
  currentFrame,
  decide,
  decisionJudge,
  declaredStructuralCanonical,
  decodeNz,
  defaultProgressJudge,
  defineEvaluationSuite,
  defineNatlang,
  definitionFor,
  definitionKey,
  detectFindings,
  emptyEvidence,
  encodeNz,
  evaluate,
  evaluationSummary,
  exampleOf,
  excluded,
  executorIdentityForChoice,
  exportAdaptationPatch,
  exportSpecializationCorpus,
  failureKind,
  fileContentEqual,
  fileReturnValue,
  fileTraceSink,
  fingerprint,
  foldAnswerText,
  foldEvent,
  foldSelectedEvents,
  groupsOf,
  guidanceForCall,
  handoffNote,
  hostCaptures,
  hybridTracingPlatform,
  importedNativeArtifacts,
  induceRules,
  inputFeatures,
  inputLeaves,
  inspectComponents,
  interfaceHash,
  invokeAt,
  invokeDefinition,
  isDeopt,
  isModelEvidence,
  isModelOutcomeFailure,
  isNatlangCallable,
  iterateOn,
  jsonFileCanonical,
  jsonStringRecordCanonical,
  jsonStringRecordWithNumericKeysCanonical,
  jsonStringRecordWithNumericListFieldsCanonical,
  jsonStringRecordWithRadixFieldsCanonical,
  judge,
  keepCases,
  labeler,
  ladderOf,
  live,
  loadAdaptation,
  loadCallables,
  loadCases,
  loadEvaluationSuite,
  loadModelConfiguration,
  loadNatlang,
  loadNz,
  loadNzSync,
  loadVirtualCallables,
  loadVirtualNatlang2 as loadVirtualNatlang,
  localModelPrerequisites,
  machineStoreRoot,
  manifestDigest,
  mapSelectedEvents,
  markdownTerminalNewlineBody,
  markdownTerminalNewlineEqual,
  measure,
  measureGuard,
  modelTurnsSoFar,
  moveTier,
  namedCallable,
  namedTreeCanonical,
  nativeProgramGuidance,
  newTierEvidence,
  nl,
  nodePlatform,
  nodeSourceFiles,
  normalizeProgram,
  nzExports,
  observedNativeTracingPlatform,
  openMachineStore,
  optimize,
  ordinalDistanceRecordReview,
  ownedTracingPlatform,
  pairedChanges,
  parseAdaptation,
  parseManifest,
  parseRefinementSettings,
  pluggable,
  pluggableMode,
  preflightEvaluation,
  prepareEvaluationSuite,
  programGuidance,
  programGuidanceIdentity,
  programGuidanceProgram,
  projectEntry,
  promotionPolicy,
  qaAnswerCores,
  qaSameAnswer,
  qaStringMapCanonical,
  realmPlatform,
  rebind,
  recordedArguments,
  recordedBehavior,
  recordingServices,
  refine,
  refinements,
  renderEvidence,
  renderFunction,
  renderGroup,
  renderHistory,
  renderReport,
  replay,
  replayCaseOn,
  replicateUncertainty,
  rerunAgent,
  resolveFrame,
  resumeOptimization,
  revalidateAdaptation,
  reviewPromotions,
  ruleOf,
  runFolderBash,
  runFolderPython,
  runJob,
  runJobs,
  runTiered,
  sameData,
  sanitizeDecision,
  save,
  saveAccepted,
  saveNz,
  sealManifest,
  selectedSemanticPlatform,
  sessionDriver,
  setTierState,
  signatureOf,
  snapshot,
  softFunction,
  softFunctionOf,
  spanF1,
  specializerOutput,
  splitOf,
  stackIdentity,
  study,
  subtreeEffects,
  summarize,
  summaryOfTier,
  tokens,
  tracesService,
  untrusted,
  validateAdaptation,
  validateCandidate,
  validateCases,
  validateManifest,
  validateMetrics,
  verdictFor,
  verifyCases,
  wrapDriver
};
