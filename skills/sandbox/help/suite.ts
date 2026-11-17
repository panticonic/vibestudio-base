import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { defineEvaluationSuite } from "@workspace/natlang/evaluation";
import {
  executorIdentityForChoice,
  loadModelConfiguration,
} from "@workspace/natlang/model";
import type { Cause, FailedCall, Located, Recovery } from "./types.js";

/** One suite, two functions: each case names the function it exercises. */
type CaseInput =
  | { function: "locateDoc"; question: string }
  | { function: "recoverFromFailure"; failure: FailedCall };
/** locateDoc: the files or catalog entries that answer (none: nothing does). recoverFromFailure: the cause. */
type CaseExpected = { sources: string[] } | { cause: Cause };

type CatalogEntry = {
  id: string;
  surface: string;
  qualifiedName: string;
  title: string;
  description: string;
};
type Observation = {
  result?: Located | Recovery;
  grounded: boolean;
  verifiedPassages: Array<{ source: string; text: string }>;
};
type Metric = {
  quality: number;
  gates: Record<string, boolean>;
  metrics?: Record<string, number>;
  feedback: string;
};

const SKIP = new Set([
  "node_modules",
  "dist",
  ".git",
  ".natlang",
  "test-results",
  "eval-results",
  "evaluation-results",
]);

function markdownFiles(root: string, directory: string): string[] {
  return readdirSync(path.join(root, directory), {
    withFileTypes: true,
  }).flatMap((entry) => {
    if (
      entry.name.startsWith(".") ||
      entry.name.startsWith("vendor") ||
      SKIP.has(entry.name) ||
      entry.name === "DECOMPOSITION.md"
    )
      return [];
    const relative = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return markdownFiles(root, relative);
    return entry.isFile() && entry.name.endsWith(".md") ? [relative] : [];
  });
}

/** `fs.grep` and `fs.readText` over the workspace's Markdown files, with the service's result shapes. */
function workspaceFs(root: string, passages: Map<string, string[]>) {
  const files = markdownFiles(root, "");
  const allowed = new Set(files);
  const reads = new Map<string, Array<[number, number]>>();
  return {
    async grep(
      pattern: string,
      options: {
        path?: string;
        caseInsensitive?: boolean;
        maxMatches?: number;
      } = {},
    ) {
      const expression = new RegExp(
        pattern,
        options.caseInsensitive ? "i" : "",
      );
      const prefix = (options.path ?? "").replace(/^\/+|\/+$/g, "");
      const limit = options.maxMatches ?? 200;
      const matches = files
        .filter(
          (file) => !prefix || file === prefix || file.startsWith(`${prefix}/`),
        )
        .flatMap((file) =>
          readFileSync(path.join(root, file), "utf8")
            .split("\n")
            .flatMap((line, index) =>
              expression.test(line)
                ? [{ file, lineNumber: index + 1, line, before: [], after: [] }]
                : [],
            ),
        );
      return {
        matches: matches.slice(0, limit),
        matchCount: Math.min(matches.length, limit),
        truncated: matches.length > limit,
      };
    },
    async readdir(
      directory: string,
      options: { recursive?: boolean; withFileTypes?: boolean } = {},
    ) {
      const prefix =
        directory === "." ? "" : directory.replace(/^\/+|\/+$/g, "");
      const selected = files.filter(
        (file) => !prefix || file.startsWith(`${prefix}/`),
      );
      const entries = new Map<string, boolean>();
      for (const file of selected) {
        const relative = prefix ? file.slice(prefix.length + 1) : file;
        const parts = relative.split("/");
        if (options.recursive) entries.set(file, true);
        else entries.set(parts[0]!, parts.length === 1);
      }
      return [...entries].map(([name, file]) =>
        options.withFileTypes
          ? { name, _isFile: file, _isDirectory: !file, _isSymbolicLink: false }
          : name,
      );
    },
    async readText(
      file: string,
      options: { offset?: number; limit?: number; maxBytes?: number } = {},
    ) {
      if (!allowed.has(file))
        throw new Error("Read a workspace Markdown file named by fs.grep.");
      const text = readFileSync(path.join(root, file), "utf8");
      const lines = text.split("\n");
      const offset = options.offset ?? 1;
      const maxLines = options.limit ?? 2000;
      const maxBytes = options.maxBytes ?? 50 * 1024;
      const selected: string[] = [];
      let bytes = 0;
      let truncatedBy: "lines" | "bytes" | undefined;
      for (const line of lines.slice(offset - 1)) {
        if (selected.length >= maxLines) {
          truncatedBy = "lines";
          break;
        }
        const nextBytes =
          Buffer.byteLength(line, "utf8") + (selected.length ? 1 : 0);
        if (bytes + nextBytes > maxBytes) {
          truncatedBy = "bytes";
          break;
        }
        selected.push(line);
        bytes += nextBytes;
      }
      const shown = selected.join("\n");
      const start =
        offset > lines.length
          ? text.length
          : lines
              .slice(0, offset - 1)
              .reduce((sum, line) => sum + line.length + 1, 0);
      const end = start + shown.length;
      const ranges = [
        ...(reads.get(file) ?? []),
        [start, end] as [number, number],
      ].sort((a, b) => a[0] - b[0]);
      const merged: Array<[number, number]> = [];
      for (const range of ranges) {
        const previous = merged[merged.length - 1];
        if (previous && range[0] <= previous[1] + 1)
          previous[1] = Math.max(previous[1], range[1]);
        else merged.push([...range]);
      }
      reads.set(file, merged);
      passages.set(
        file,
        merged.map(([from, to]) => text.slice(from, to)),
      );
      const endLine = offset + selected.length - 1;
      const truncated = endLine < lines.length;
      return {
        text: shown,
        contentHash: createHash("sha256").update(text).digest("hex"),
        totalLines: lines.length,
        totalBytes: Buffer.byteLength(text, "utf8"),
        maxLines,
        maxBytes,
        startLine: offset,
        endLine,
        start,
        end,
        truncated,
        ...(truncatedBy ? { truncatedBy } : {}),
        ...(truncated ? { nextOffset: Math.max(offset + 1, endLine + 1) } : {}),
        firstLineExceedsLimit: selected.length === 0 && truncatedBy === "bytes",
      };
    },
  };
}

/** `docs.search` (keyword overlap, as the catalog index ranks) and `docs.describe` over the recorded entries. */
function recordedDocs(
  catalog: readonly CatalogEntry[],
  passages: Map<string, string[]>,
) {
  return {
    async search(query: string, options: { limit?: number } = {}) {
      const lower = query.toLowerCase();
      const words = [
        ...new Set(
          [
            ...(lower.match(/[a-z0-9]+(?:[.:/_-][a-z0-9]+)+/g) ?? []),
            ...lower.split(/[^a-z0-9]+/),
          ].filter((term) => term.length > 1),
        ),
      ];
      const results = catalog
        .map((entry) => {
          const name = `${entry.qualifiedName} ${entry.title}`.toLowerCase();
          const body = entry.description.toLowerCase();
          return {
            entry,
            score: words.reduce(
              (sum, word) =>
                sum +
                (name.includes(word) ? 3 : 0) +
                (body.includes(word) ? 1 : 0),
              0,
            ),
          };
        })
        .filter((hit) => hit.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.entry.qualifiedName.localeCompare(b.entry.qualifiedName),
        )
        .slice(0, Math.min(Math.max(options.limit ?? 20, 1), 100))
        .map(({ entry }) => ({
          id: entry.id,
          surface: entry.surface,
          qualifiedName: entry.qualifiedName,
          title: entry.title,
          description: entry.description,
        }));
      for (const entry of results)
        passages.set(`docs:${entry.id}`, [entry.description]);
      return results;
    },
    async describe(id: string) {
      const entry = catalog.find((candidate) => candidate.id === id) ?? null;
      if (entry) passages.set(`docs:${entry.id}`, [entry.description]);
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
  executorIdentity: executorIdentityForChoice(
    loadModelConfiguration("default").choice,
  ),
  policy: {
    codeEdits: "deny",
    settings: { maxTurns: 6, turnTokens: 512, contextTokens: 8192 },
  },
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
        const catalog = JSON.parse(
          readFileSync(path.join(context.programRoot, "catalog.json"), "utf8"),
        ) as CatalogEntry[];
        const passages = new Map<string, string[]>();
        const services = {
          fs: workspaceFs(root, passages),
          docs: recordedDocs(catalog, passages),
        };
        return {
          execute: () =>
            context.runtime.run(() => app.docHelp(input.question), {
              services,
            }),
          observe(result): Observation {
            const located = result as Located | undefined;
            const found = located?.found ?? [];
            const verifiedPassages = found.flatMap((entry) => {
              const source = entry.quote.trim()
                ? passages
                    .get(entry.source)
                    ?.find((text) => text.includes(entry.quote))
                : undefined;
              const offset =
                source !== undefined ? source.indexOf(entry.quote) : -1;
              return offset < 0
                ? []
                : [
                    {
                      source: entry.source,
                      text: source!.slice(offset, offset + entry.quote.length),
                    },
                  ];
            });
            return {
              ...(located === undefined ? {} : { result: located }),
              grounded:
                located !== undefined &&
                verifiedPassages.length === found.length,
              verifiedPassages,
            };
          },
        };
      }
      return {
        execute: () =>
          context.runtime.run(
            () => app.docHelp.recoverFromFailure(input.failure),
            { services: noDocuments },
          ),
        observe(result): Observation {
          const recovery = result as Recovery | undefined;
          return {
            ...(recovery === undefined ? {} : { result: recovery }),
            grounded:
              recovery !== undefined && (recovery.docs ?? []).length === 0,
            verifiedPassages: [],
          };
        },
      };
    },
  },
  score(testCase, observation, outcome): Metric {
    const observed = observation as Observation;
    const result = observed.result;
    if (outcome.kind !== "returned" || !result) {
      return {
        quality: 0,
        gates: { completed: false },
        feedback: `No result: ${outcome.error?.message ?? "none"}`,
      };
    }
    const expected = testCase.expected!;
    if ("cause" in expected) {
      const cause = (result as Recovery).cause;
      const exact = cause === expected.cause;
      return {
        quality: exact && observed.grounded === true ? 1 : 0,
        gates: { completed: true, grounded: observed.grounded === true },
        feedback:
          observed.grounded !== true
            ? "Recovery returned documentation that this fixture did not supply."
            : exact
              ? "Correct."
              : `Expected ${expected.cause}; got ${cause} (${(result as Recovery).by}).`,
      };
    }
    const found = (result as Located).found;
    const answers = found
      .filter((entry) => entry.fit === "answers")
      .map((entry) => entry.source);
    // Every answer must come from an expected source; unrelated sources cannot piggyback on one correct hit.
    const exact =
      expected.sources.length === 0
        ? answers.length === 0
        : answers.length > 0 &&
          answers.every((source) => expected.sources.includes(source));
    return {
      quality: exact && observed.grounded === true ? 1 : 0,
      metrics: {
        answers: answers.length,
        related: found.length - answers.length,
        tried: (result as Located).tried.length,
      },
      gates: {
        completed: true,
        grounded: observed.grounded === true,
        expectedSources: exact,
      },
      feedback:
        observed.grounded !== true
          ? "A returned quote is absent from the Markdown or catalog evidence the fixture supplied."
          : exact
            ? "Correct."
            : `Expected an answer from ${expected.sources.join(", ") || "nowhere"}; answers came from ${answers.join(", ") || "nowhere"}.`,
    };
  },
  feedback(testCase, result) {
    return {
      input: testCase.input.function,
      actual: result.outcome.value ?? null,
    };
  },
});
