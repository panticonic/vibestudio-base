/**
 * The specifiers a natlang evaluation suite (`suite.ts` beside its program) imports. They are type-only
 * in the workspace, and the type-check reads them from the vendored declarations of natlang's evaluation
 * bundle; `pnpm natlang:eval` resolves the same specifiers to that staged bundle's code when it runs the suite.
 * This file keeps the surface suites rely on checked against the vendored declarations.
 */
import type { defineEvaluationSuite, EvaluationSuite } from "@workspace/natlang/evaluation";
import type {
  createResolvedModelSession,
  executorIdentityForChoice,
  loadModelConfiguration,
} from "@workspace/natlang/model";

export type SuiteSurface = {
  defineEvaluationSuite: typeof defineEvaluationSuite;
  suite: EvaluationSuite;
  executorIdentityForChoice: typeof executorIdentityForChoice;
  loadModelConfiguration: typeof loadModelConfiguration;
  createResolvedModelSession: typeof createResolvedModelSession;
};
