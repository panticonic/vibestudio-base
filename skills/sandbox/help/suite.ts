import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

/** The workspace this suite runs in: the template's own documents are the corpus locateDoc searches. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
/** Real entries of the host capability catalog (blobstore, fs, docs, serverLog, credentials, build, missions). */
const CATALOG = JSON.parse(readFileSync(new URL("./catalog.json", import.meta.url), "utf8")) as CatalogEntry[];
const SKIP = new Set(["node_modules", "dist", ".git", ".natlang"]);

function markdownFiles(directory: string): string[] {
  return readdirSync(path.join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith("vendor") || SKIP.has(entry.name)) return [];
    const relative = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return markdownFiles(relative);
    return entry.isFile() && entry.name.endsWith(".md") ? [relative] : [];
  });
}

/** `fs.grep` and `fs.readText` over the workspace's Markdown files, with the service's result shapes. */
function workspaceFs() {
  const files = markdownFiles("");
  return {
    async grep(pattern: string, options: { path?: string; caseInsensitive?: boolean; maxMatches?: number } = {}) {
      const expression = new RegExp(pattern, options.caseInsensitive ? "i" : "");
      const prefix = (options.path ?? "").replace(/^\/+|\/+$/g, "");
      const limit = options.maxMatches ?? 200;
      const matches = files
        .filter((file) => !prefix || file === prefix || file.startsWith(`${prefix}/`))
        .flatMap((file) =>
          readFileSync(path.join(ROOT, file), "utf8")
            .split("\n")
            .flatMap((line, index) => (expression.test(line) ? [{ file, lineNumber: index + 1, line, before: [], after: [] }] : [])),
        );
      return { matches: matches.slice(0, limit), matchCount: Math.min(matches.length, limit), truncated: matches.length > limit };
    },
    async readText(file: string, options: { maxBytes?: number } = {}) {
      const text = readFileSync(path.join(ROOT, file), "utf8");
      const limit = options.maxBytes ?? 50 * 1024;
      return { text: text.slice(0, limit), truncated: text.length > limit };
    },
  };
}

/** `docs.search` (keyword overlap, as the catalog index ranks) and `docs.describe` over the recorded entries. */
function recordedDocs() {
  return {
    async search(query: string, options: { limit?: number } = {}) {
      const words = query.toLowerCase().match(/[a-z0-9_.]{3,}/g) ?? [];
      return CATALOG.map((entry) => {
        const text = `${entry.qualifiedName} ${entry.description}`.toLowerCase();
        return { entry, score: words.filter((word) => text.includes(word)).length };
      })
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, options.limit ?? 20)
        .map(({ entry }) => ({ id: entry.id, surface: entry.surface, qualifiedName: entry.qualifiedName, title: entry.title, description: entry.description }));
    },
    async describe(id: string) {
      return CATALOG.find((entry) => entry.id === id) ?? null;
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
        docHelp: {
          locateDoc(question: string): Promise<Located>;
          recoverFromFailure(failure: FailedCall): Promise<Recovery>;
        };
      };
      const input = testCase.input;
      if (input.function === "locateDoc") {
        const services = { fs: workspaceFs(), docs: recordedDocs() };
        return { execute: () => context.runtime.run(() => app.docHelp.locateDoc(input.question), { services }) };
      }
      return {
        execute: () =>
          context.runtime.run(() => app.docHelp.recoverFromFailure(input.failure), { services: noDocuments }),
      };
    },
  },
  score(testCase, observation, outcome) {
    const result = (observation as { result?: Located | Recovery }).result;
    if (outcome.kind !== "returned" || !result) {
      return { quality: 0, gates: { completed: false }, feedback: `No result: ${outcome.error?.message ?? "none"}` };
    }
    const expected = testCase.expected!;
    if ("cause" in expected) {
      const cause = (result as Recovery).cause;
      const exact = cause === expected.cause;
      return {
        quality: exact ? 1 : 0,
        gates: { completed: true },
        feedback: exact ? "Correct." : `Expected ${expected.cause}; got ${cause} (${(result as Recovery).by}).`,
      };
    }
    const found = (result as Located).found;
    const answers = found.filter((entry) => entry.fit === "answers").map((entry) => entry.source);
    // An answering section from an expected source; for a question the documents do not answer, no answering section.
    const exact =
      expected.sources.length === 0 ? answers.length === 0 : answers.some((source) => expected.sources.includes(source));
    return {
      quality: exact ? 1 : 0,
      metrics: { answers: answers.length, related: found.length - answers.length, tried: (result as Located).tried.length },
      gates: { completed: true },
      feedback: exact
        ? "Correct."
        : `Expected an answer from ${expected.sources.join(", ") || "nowhere"}; answers came from ${answers.join(", ") || "nowhere"}.`,
    };
  },
  feedback(testCase, result) {
    return { input: testCase.input.function, actual: result.outcome.value ?? null };
  },
});
