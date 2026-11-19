import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import { verifyUnit } from "@workspace/harness/unit-verification";
import { contextId, openPanel, rpc } from "@workspace/runtime";
import type {
  SuiteReviewExecution,
  SuiteReviewPlan,
  SuiteReviewRequest,
} from "../native-suite-review/types.js";

export function bindSuiteReview(
  input: Omit<SuiteReviewRequest, "operationId">,
) {
  if (!contextId) throw new Error("Suite verification needs a caller context");
  const assignedContext = contextId;
  const request: SuiteReviewRequest = {
    ...input,
    operationId: crypto.randomUUID(),
  };
  const { operationId, target, suite, file, testName, mode } = request;
  const ref = `ctx:${assignedContext}`;
  let observed: SuiteReviewPlan | undefined;
  let attempted = false;

  async function resolve(): Promise<SuiteReviewPlan> {
    const plan = await rpc.call(
      "main",
      mainRpcMethods["build.resolveTestSuite"],
      [target, ref, suite],
    );
    if (plan.target !== target || plan.suite !== suite)
      throw new Error(
        "The resolved test plan is outside the assigned target or suite",
      );
    return {
      target,
      suite,
      runtime: plan.runtime,
      stateHash: plan.stateHash,
      contextId: assignedContext,
    };
  }

  return {
    request,
    services: {
      testSuitePlanRead: {
        async resolve(id: string): Promise<SuiteReviewPlan> {
          if (id !== operationId)
            throw new Error("Resolve only the assigned test suite");
          const plan = await resolve();
          observed = structuredClone(plan);
          return plan;
        },
      },
      testSuiteVerificationRun: {
        async run(
          id: string,
          stateHash: string,
        ): Promise<SuiteReviewExecution> {
          const plan = observed;
          if (
            mode !== "verify" ||
            id !== operationId ||
            !plan ||
            plan.stateHash !== stateHash ||
            attempted
          )
            throw new Error(
              "Verify only the current, caller-assigned test plan once",
            );
          attempted = true;
          const before = await resolve();
          if (
            before.stateHash !== stateHash ||
            before.runtime !== plan.runtime
          ) {
            return {
              status: "state-changed",
              current: false,
              reportDigest: null,
              executionDigest: null,
              artifactKey: null,
              passed: null,
              failed: null,
              diagnostics: [],
            };
          }
          const result = await verifyUnit(
            {
              rpc,
              openPanel,
              contextId: assignedContext,
              operationPrefix: "natlang-suite-review",
            },
            {
              operation: "test",
              target,
              suite,
              ...(file ? { file } : {}),
              ...(testName ? { testName } : {}),
            },
          );
          if (
            result.operation !== "test" ||
            !("receipt" in result) ||
            result.receipt.contextId !== assignedContext ||
            result.receipt.target !== target ||
            result.receipt.suite !== suite ||
            result.receipt.ref !== ref
          )
            throw new Error(
              "Verification returned a receipt for another assignment",
            );
          const after = await resolve();
          const details = result.report;
          const diagnostics =
            "diagnostics" in details
              ? details.diagnostics.map(({ message }) => message)
              : details.details.flatMap(({ errors }) => errors ?? []);
          return {
            status: result.status,
            current:
              result.receipt.stateHash === stateHash &&
              result.receipt.runtime === plan.runtime &&
              after.stateHash === stateHash &&
              after.runtime === plan.runtime,
            reportDigest: result.receipt.reportDigest,
            executionDigest: result.receipt.executionDigest ?? null,
            artifactKey: result.receipt.artifactKey ?? null,
            passed: "passed" in details ? details.passed : null,
            failed: "failed" in details ? details.failed : null,
            diagnostics: diagnostics.slice(0, 8),
          };
        },
      },
    },
  };
}
