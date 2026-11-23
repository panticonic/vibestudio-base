import {
  compileProject,
  formatDiagnostics
} from "./chunk-chunk-V5SNWGZ5.js";
import {
  FUNCTION_TOOLS_PROMPT,
  NL_DEPTH_LIMIT_NOTICE,
  TOOLS_PROMPT,
  cloneData,
  directoryReducerPrompt,
  fingerprint,
  immutable,
  parseStrictJSON
} from "./chunk-chunk-7RHMLU3S.js";

// src/evaluation/suite.ts
import { readFileSync as readFileSync2, mkdirSync as mkdirSync2 } from "node:fs";
import { resolve as resolve2, dirname as dirname2, join as join2 } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

// src/compiler/node-project.ts
import ts from "typescript";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
var nodeProjectFiles = {
  isFile: (path) => existsSync(path) && statSync(path).isFile(),
  isDirectory: (path) => existsSync(path) && statSync(path).isDirectory(),
  list: (dir) => readdirSync(dir),
  read: (path) => readFileSync(path, "utf8"),
  readBytes: (path) => new Uint8Array(readFileSync(path)),
  write: (path, text) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  },
  compiler: ts.sys
};
var NODE_TYPE_ROOTS = [dirname(dirname(createRequire(import.meta.url).resolve("@types/node/package.json")))];
function buildProject(options) {
  return compileProject({
    runtimeTypeRoots: NODE_TYPE_ROOTS,
    ...options,
    project: resolve(options.project),
    files: options.files ?? nodeProjectFiles,
    ...options.outDir ? { outDir: resolve(options.outDir) } : {}
  });
}

// src/evaluation/project-files.ts
import { join } from "node:path";
var conventionalTest = (path) => {
  const parts = path.split(/[\\/]/);
  return parts.includes("__tests__") || /\.(?:test|spec)\./.test(parts.at(-1) ?? "");
};
var evaluationProjectFiles = {
  ...nodeProjectFiles,
  list: (directory) => nodeProjectFiles.list(directory).filter((name) => name !== "__tests__" && (nodeProjectFiles.isDirectory(join(directory, name)) || !conventionalTest(name))),
  compiler: {
    ...nodeProjectFiles.compiler,
    readDirectory: (...args) => nodeProjectFiles.compiler.readDirectory(...args).filter((path) => !conventionalTest(path))
  }
};

// src/evaluation/suite.ts
function defineEvaluationSuite(suite) {
  return suite;
}
function validateCases(cases) {
  if (!Array.isArray(cases) || !cases.length) throw new Error("evaluation suite needs cases");
  const ids = /* @__PURE__ */ new Set(), groups = /* @__PURE__ */ new Map();
  for (const testCase of cases) {
    if (!testCase.id || !testCase.group || !["train", "validation", "test"].includes(testCase.split)) throw new Error("case needs id, group, and explicit split");
    if (ids.has(testCase.id)) throw new Error("duplicate case ID: " + testCase.id);
    ids.add(testCase.id);
    if (groups.has(testCase.group) && groups.get(testCase.group) !== testCase.split) throw new Error("group leakage: " + testCase.group);
    groups.set(testCase.group, testCase.split);
  }
  return immutable(cloneData(cases));
}
function validateBudget(budget) {
  for (const [key, value] of Object.entries(budget)) {
    if (key === "pricing" || key === "requestBounds") {
      const names = key === "pricing" ? ["inputPerMillion", "outputPerMillion"] : ["maxInputTokens", "maxOutputTokens"];
      if (!value || typeof value !== "object" || names.some((name) => !Number.isFinite(value[name]) || value[name] < 0) || Object.keys(value).some((name) => !names.includes(name))) throw new Error("invalid budget: " + key);
      if (key === "requestBounds" && Object.values(value).some((count) => !Number.isSafeInteger(count))) throw new Error("request bounds must be integers");
    } else if (!Number.isFinite(value) || value < 0) throw new Error("invalid budget: " + key);
  }
  for (const key of ["maxRollouts", "maxProposals", "maxModelCalls"]) if (!Number.isSafeInteger(budget[key])) throw new Error("budget needs integer " + key);
  if (budget.maxCost !== void 0 && (!budget.pricing || !budget.requestBounds)) throw new Error("hard monetary caps require configured pricing and bounded requests");
}
async function prepareEvaluationSuite(suite, moduleURL) {
  validateBudget(suite.budget);
  if (suite.selection) {
    if (suite.selection.tieBreak !== void 0 && !["baseline", "modelCalls", "latency", "cost"].includes(suite.selection.tieBreak)) throw new Error("invalid selection tie-break");
    for (const [key, value] of Object.entries(suite.selection)) if (key !== "tieBreak" && (!["maxMeanLatencyMs", "maxModelCalls", "maxCost"].includes(key) || !Number.isFinite(value) || Number(value) < 0)) throw new Error("invalid selection constraint: " + key);
  }
  if (suite.systemPrompt && fingerprint(suite.systemPrompt, "natlang.system-prompt/v1") !== suite.policy?.systemPromptHash)
    throw new Error("declare the evaluated application systemPromptHash in suite policy");
  if (!suite.executorIdentity?.id) throw new Error("declare executorIdentity for reproducible artifact binding");
  const modulePath = fileURLToPath(moduleURL);
  const root = resolve2(dirname2(modulePath), suite.program.root);
  const cases = validateCases(typeof suite.cases === "string" ? readFileSync2(resolve2(root, suite.cases), "utf8").split(/\r?\n/).filter((line) => line.trim()).map((line) => parseStrictJSON(line)) : suite.cases);
  const outDir = join2(root, ".natlang", "adaptation", "build");
  mkdirSync2(outDir, { recursive: true });
  const result = buildProject({
    project: root,
    files: evaluationProjectFiles,
    programId: suite.program.id,
    guidance: suite.program.guidance,
    services: suite.services,
    outDir,
    write: true,
    writeDeclarations: false,
    runtimeModule: {
      specifiers: ["@natlang/node"],
      url: new URL("../index.js", import.meta.url).href,
      types: fileURLToPath(new URL("../index.d.ts", import.meta.url))
    }
  });
  if (!result.ok) throw new Error(formatDiagnostics(result.diagnostics));
  const program = result.manifest.adaptation;
  const selected = typeof suite.components === "string" ? program.components.filter((component) => suite.components === "joint" || (suite.components === "lambda-only" ? component.kind === "lambda.instructions" : component.kind === "program.guidance")).map((component) => component.key) : [...suite.components];
  if (!selected.length || new Set(selected).size !== selected.length || selected.some((key) => !program.components.some((component) => component.key === key)))
    throw new Error("selection contains unknown, duplicate, or nonpersistent components; only named .nl, compiler-authored inline sites, and program guidance are persistent; generated/delegate and unregistered callables are excluded");
  const entry = resolve2(outDir, suite.program.entry.replace(/\.m?ts$/, ".js"));
  const suiteHash = fingerprint({
    id: suite.id,
    module: readFileSync2(modulePath, "utf8"),
    program: program.buildHash,
    protocol: program.protocol,
    prompt: {
      interpreter: TOOLS_PROMPT,
      functions: FUNCTION_TOOLS_PROMPT,
      depth: NL_DEPTH_LIMIT_NOTICE,
      folder: directoryReducerPrompt(),
      guidance: suite.program.guidance ?? ""
    },
    cases,
    selected,
    identity: suite.executorIdentity,
    policy: suite.policy ?? { codeEdits: "deny", settings: {} },
    fixture: suite.fixture.create.toString(),
    score: suite.score.toString(),
    feedback: suite.feedback?.toString() ?? null,
    gates: suite.requiredGates ?? [],
    selection: suite.selection ?? null,
    services: suite.services ?? null,
    systemPrompt: suite.systemPrompt ?? null
  });
  return { suite, moduleURL, cases, program, programRoot: root, suiteHash, components: selected.sort(), compiledEntry: pathToFileURL(entry).href };
}
async function loadEvaluationSuite(path) {
  const sourcePath = resolve2(path);
  let moduleURL = pathToFileURL(sourcePath).href;
  if (/\.m?ts$/.test(sourcePath)) {
    const root = dirname2(sourcePath), outDir = join2(root, ".natlang/adaptation/suite");
    const result = buildProject({
      project: root,
      files: evaluationProjectFiles,
      outDir,
      write: true,
      writeDeclarations: false,
      runtimeModule: {
        specifiers: ["@natlang/node"],
        url: new URL("../index.js", import.meta.url).href,
        types: fileURLToPath(new URL("../index.d.ts", import.meta.url))
      }
    });
    if (!result.ok) throw new Error(formatDiagnostics(result.diagnostics));
    moduleURL = pathToFileURL(join2(outDir, sourcePath.slice(root.length + 1).replace(/\.m?ts$/, ".js"))).href;
  }
  const imported = await import(moduleURL);
  const suite = imported.default;
  return prepareEvaluationSuite({ ...suite, program: { ...suite.program, root: resolve2(dirname2(sourcePath), suite.program.root) } }, moduleURL);
}

export {
  nodeProjectFiles,
  buildProject,
  defineEvaluationSuite,
  validateCases,
  validateBudget,
  prepareEvaluationSuite,
  loadEvaluationSuite
};
