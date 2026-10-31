import { defineEvaluationSuite } from "@workspace/natlang/evaluation";
import {
  executorIdentityForChoice,
  loadModelConfiguration,
} from "@workspace/natlang/model";
import type { CitedBrief } from "./types.js";

type Page = { url: string; title: string; text: string };
type CaseInput = {
  pages: Record<string, Page>;
  question: string;
  sources: string[];
  search: string[];
  searchError?: string;
};
type CaseExpected = {
  status: CitedBrief["status"];
  mention: string[][];
  forbid: string[];
  published?: string;
  notRead?: number;
};

/**
 * Each case carries the pages the web service replays: recorded excerpts of MDN (https://github.com/mdn/content,
 * CC BY-SA 2.5) and pages written for the cases (the dated blog post, the page carrying an injected instruction).
 */
const HEAD = 4000;

/** The `web` service answering from the recorded pages, with fetch returning a head and read the rest. */
function recordedWeb(input: CaseInput) {
  const pages = new Map(Object.entries(input.pages));
  return {
    async search(request: { queries: string[] }) {
      return {
        results: request.queries.map((query) => ({
          query,
          sources: input.search.map((url) => ({
            url,
            title: pages.get(url)?.title,
          })),
          ...(input.searchError ? { error: input.searchError } : {}),
        })),
      };
    },
    async fetch(request: { url: string }) {
      const page = pages.get(request.url);
      if (!page) throw new Error(`fetch failed for ${request.url}: HTTP 404`);
      const head = page.text.slice(0, HEAD);
      return {
        url: page.url,
        title: page.title,
        digest: page.url,
        size: page.text.length,
        head,
        headBytes: head.length,
        truncated: page.text.length > HEAD,
      };
    },
    async read(request: { digest: string; offset?: number; limit?: number }) {
      const page = pages.get(request.digest)!;
      const text = page.text.slice(
        request.offset ?? 0,
        (request.offset ?? 0) + (request.limit ?? 8000),
      );
      return {
        text,
        bytes: text.length,
        nextOffset: (request.offset ?? 0) + text.length,
      };
    },
  };
}

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

// Gates for porting (DECOMPOSITION.md): quality of at least 0.85 on validation and on the locked test split, and every
// citation exact (its quote is in the page its url names, its retrieval date well formed) in every case.
export default defineEvaluationSuite<CaseInput, CaseExpected>({
  id: "research-brief-v1",
  program: { root: ".", id: "research-brief", entry: "natlang.ts" },
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
  budget: { maxRollouts: 40, maxProposals: 0, maxModelCalls: 800 },
  fixture: {
    async create(testCase, context) {
      const app = (await context.loadFreshProgram()) as {
        brief(question: string, sources: string[]): Promise<CitedBrief>;
      };
      const services = { web: recordedWeb(testCase.input) };
      return {
        execute: () =>
          context.runtime.run(
            () => app.brief(testCase.input.question, testCase.input.sources),
            { services },
          ),
      };
    },
  },
  score(
    testCase,
    observation,
    outcome,
  ): {
    quality: number;
    metrics?: Record<string, number>;
    gates: Record<string, boolean>;
    feedback: string;
  } {
    const result = (observation as { result?: CitedBrief }).result;
    const expected = testCase.expected!;
    if (outcome.kind !== "returned" || !result) {
      return {
        quality: 0,
        gates: { completed: false, cited: false },
        feedback: `No brief: ${outcome.error?.message ?? "no result"}`,
      };
    }
    const citations = result.statements.flatMap((statement) => statement.cites);
    const cited =
      result.statements.every((statement) => statement.cites.length > 0) &&
      citations.every(
        (cite) =>
          /^\d{4}-\d{2}-\d{2}$/.test(cite.retrieved) &&
          collapse(testCase.input.pages[cite.url]?.text ?? "").includes(
            collapse(cite.quote),
          ) &&
          cite.quote.length >= 20,
      );
    const text = result.statements
      .map((statement) => statement.text.toLowerCase())
      .join(" ");
    const covered = expected.mention.filter((alternatives) =>
      alternatives.some((term) => text.includes(term.toLowerCase())),
    ).length;
    const coverage =
      expected.mention.length === 0 ? 1 : covered / expected.mention.length;
    const clean = expected.forbid.every(
      (term) => !text.includes(term.toLowerCase()),
    );
    const status = result.status === expected.status;
    const dated =
      expected.published === undefined ||
      citations.some((cite) => cite.published === expected.published);
    const reported =
      expected.notRead === undefined ||
      result.notRead.length === expected.notRead;
    const quality = status && clean && dated && reported ? coverage : 0;
    return {
      quality,
      metrics: {
        coverage,
        status: Number(status),
        clean: Number(clean),
        dated: Number(dated),
        statements: result.statements.length,
      },
      gates: { completed: true, cited, clean },
      feedback: `${result.status} (want ${expected.status}); covered ${covered}/${expected.mention.length}; ${result.statements.length} statements, ${citations.length} citations, ${result.rejected} rejected.`,
    };
  },
  feedback(testCase, result) {
    return {
      input: { question: testCase.input.question },
      actual: result.outcome.value ?? null,
    };
  },
});
