import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { defineEvaluationSuite } from "@workspace/natlang/evaluation";
import { executorIdentityForChoice, loadModelConfiguration } from "@workspace/natlang/model";
import type { Cause, FailedCall, Located, Recovery } from "./types.js";

/** One suite, two functions: each case names the function it exercises. */
type CaseInput =
  | { function: "locateDoc"; question: string }
  | { function: "recoverFromFailure"; failure: FailedCall };
/** locateDoc: the files or catalog entries that answer (none: nothing does). recoverFromFailure: the cause. */
type CaseExpected = { sources: string[] } | { cause: Cause };

type CatalogEntry = { id: string; surface: string; qualifiedName: string; title: string; description: string };
type Observation = {
  result?: Located | Recovery;
  grounded: boolean;
  verifiedPassages: Array<{ source: string; text: string }>;
};
type Metric = { quality: number; gates: Record<string, boolean>; metrics?: Record<string, number>; feedback: string };

const SKIP = new Set(["node_modules", "dist", ".git", ".natlang"]);

function markdownFiles(root: string, directory: string): string[] {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith("vendor") || SKIP.has(entry.name)) return [];
    const relative = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return markdownFiles(root, relative);
    return entry.isFile() && entry.name.endsWith(".md") ? [relative] : [];
  });
}

/** `fs.grep` and `fs.readText` over the workspace's Markdown files, with the service's result shapes. */
function workspaceFs(root: string, passages: Map<string, string>) {
  const files = markdownFiles(root, "");
  const allowed = new Set(files);
  return {
    async grep(pattern: string, options: { path?: string; caseInsensitive?: boolean; maxMatches?: number } = {}) {
      const expression = new RegExp(pattern, options.caseInsensitive ? "i" : "");
      const prefix = (options.path ?? "").replace(/^\/+|\/+$/g, "");
      const limit = options.maxMatches ?? 200;
      const matches = files
        .filter((file) => !prefix || file === prefix || file.startsWith(`${prefix}/`))
        .flatMap((file) =>
          readFileSync(path.join(root, file), "utf8")
            .split("\n")
            .flatMap((line, index) => (expression.test(line) ? [{ file, lineNumber: index + 1, line, before: [], after: [] }] : [])),
        );
      return { matches: matches.slice(0, limit), matchCount: Math.min(matches.length, limit), truncated: matches.length > limit };
    },
    async readText(file: string, options: { maxBytes?: number } = {}) {
      if (!allowed.has(file)) throw new Error("Read a workspace Markdown file named by fs.grep.");
      const text = readFileSync(path.join(root, file), "utf8");
      const limit = options.maxBytes ?? 50 * 1024;
      const shown = text.slice(0, limit);
      if ((passages.get(file)?.length ?? -1) < shown.length) passages.set(file, shown);
      return { text: shown, truncated: text.length > limit };
    },
  };
}

/** `docs.search` (keyword overlap, as the catalog index ranks) and `docs.describe` over the recorded entries. */
function recordedDocs(catalog: readonly CatalogEntry[], passages: Map<string, string>) {
  return {
    async search(query: string, options: { limit?: number } = {}) {
      const words = query.toLowerCase().match(/[a-z0-9_.]{3,}/g) ?? [];
      const results = catalog.map((entry) => {
        const text = `${entry.qualifiedName} ${entry.description}`.toLowerCase();
        return { entry, score: words.filter((word) => text.includes(word)).length };
      })
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, options.limit ?? 20)
        .map(({ entry }) => ({ id: entry.id, surface: entry.surface, qualifiedName: entry.qualifiedName, title: entry.title, description: entry.description }));
      for (const entry of results) passages.set(`docs:${entry.id}`, entry.description);
      return results;
    },
    async describe(id: string) {
      const entry = catalog.find((candidate) => candidate.id === id) ?? null;
      if (entry) passages.set(`docs:${entry.id}`, entry.description);
      return entry ? structuredClone(entry) : null;
    },
  };
}

/** A workspace with no documents: recoverFromFailure's cases measure the cause alone. */
const noDocuments = {
  fs: {
    async grep() {
      return { matches: [], matchCount: 0, truncated: false };
    },
    async readText(file: string): Promise<never> {
      throw new Error(`ENOENT: ${file}`);
    },
  },
  docs: {
    async search() {
      return [];
    },
    async describe() {
      return null;
    },
  },
};

// Gates for porting (DECOMPOSITION.md): at least 0.85 on validation and on the locked test split, per function.
export default defineEvaluationSuite<CaseInput, CaseExpected>({
  id: "doc-help-v1",
  program: { root: ".", id: "doc-help", entry: "natlang.ts" },
  components: "lambda-only",
  cases: "./cases.jsonl",
  models: { executor: "default" },
  executorIdentity: executorIdentityForChoice(loadModelConfiguration("default").choice),
  policy: { codeEdits: "deny", settings: { maxTurns: 6, turnTokens: 512, contextTokens: 8192 } },
  budget: { maxRollouts: 80, maxProposals: 0, maxModelCalls: 1200 },
  fixture: {
    async create(testCase, context) {
      const app = (await context.loadFreshProgram()) as {
        docHelp: ((question: string) => Promise<Located>) & {
          recoverFromFailure(failure: FailedCall): Promise<Recovery>;
        };
      };
      const input = testCase.input;
      if (input.function === "locateDoc") {
        // Evaluation modules are emitted elsewhere; assets belong to the source program snapshot.
        const root = path.resolve(context.programRoot, "../../..");
        const catalog = JSON.parse(readFileSync(path.join(context.programRoot, "catalog.json"), "utf8")) as CatalogEntry[];
        const passages = new Map<string, string>();
        const services = { fs: workspaceFs(root, passages), docs: recordedDocs(catalog, passages) };
        return {
          execute: () => context.runtime.run(() => app.docHelp(input.question), { services }),
          observe(result): Observation {
            const located = result as Located | undefined;
            const found = located?.found ?? [];
            const verifiedPassages = found.flatMap((entry) => {
              const source = passages.get(entry.source);
              const offset = source !== undefined && entry.quote.trim() ? source.indexOf(entry.quote) : -1;
              return offset < 0 ? [] : [{ source: entry.source, text: source!.slice(offset, offset + entry.quote.length) }];
            });
            return { ...(located === undefined ? {} : { result: located }), grounded: located !== undefined && verifiedPassages.length === found.length, verifiedPassages };
          },
        };
      }
      return {
        execute: () =>
          context.runtime.run(() => app.docHelp.recoverFromFailure(input.failure), { services: noDocuments }),
        observe(result): Observation {
          const recovery = result as Recovery | undefined;
          return { ...(recovery === undefined ? {} : { result: recovery }), grounded: recovery !== undefined && (recovery.docs ?? []).length === 0, verifiedPassages: [] };
        },
      };
    },
  },
  score(testCase, observation, outcome): Metric {
    const observed = observation as Observation;
    const result = observed.result;
    if (outcome.kind !== "returned" || !result) {
      return { quality: 0, gates: { completed: false }, feedback: `No result: ${outcome.error?.message ?? "none"}` };
    }
    const expected = testCase.expected!;
    if ("cause" in expected) {
      const cause = (result as Recovery).cause;
      const exact = cause === expected.cause;
      return {
        quality: exact && observed.grounded === true ? 1 : 0,
        gates: { completed: true, grounded: observed.grounded === true },
        feedback: observed.grounded !== true ? "Recovery returned documentation that this fixture did not supply." : exact ? "Correct." : `Expected ${expected.cause}; got ${cause} (${(result as Recovery).by}).`,
      };
    }
    const found = (result as Located).found;
    const answers = found.filter((entry) => entry.fit === "answers").map((entry) => entry.source);
    // Every answer must come from an expected source; unrelated sources cannot piggyback on one correct hit.
    const exact =
      expected.sources.length === 0 ? answers.length === 0 : answers.length > 0 && answers.every((source) => expected.sources.includes(source));
    return {
      quality: exact && observed.grounded === true ? 1 : 0,
      metrics: { answers: answers.length, related: found.length - answers.length, tried: (result as Located).tried.length },
      gates: { completed: true, grounded: observed.grounded === true, expectedSources: exact },
      feedback: observed.grounded !== true ? "A returned quote is absent from the Markdown or catalog evidence the fixture supplied." : exact
        ? "Correct."
        : `Expected an answer from ${expected.sources.join(", ") || "nowhere"}; answers came from ${answers.join(", ") || "nowhere"}.`,
    };
  },
  feedback(testCase, result) {
    return { input: testCase.input.function, actual: result.outcome.value ?? null };
  },
});
