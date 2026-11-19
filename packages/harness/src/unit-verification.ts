import {
  executeUnitVerification,
  type VerifyToolInput,
  type VerifyToolDetails,
} from "./tools/verify.js";
import type { JsonRepresentation } from "@panticonic/pi-chord";
export type { VerifyToolInput, VerifyToolDetails } from "./tools/verify.js";
import { testRunnerRpcMethods } from "@workspace/test-runtime";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import {
  testExecutionResultV1Schema,
  type TestExecutionResultV1,
  type WorkspaceTestArtifactV1,
} from "@vibestudio/service-schemas/build";
import type { WorkspaceRuntime } from "@workspace/runtime/hosted";
import type { RpcCaller } from "@vibestudio/rpc";

export interface SandboxTestExecutionPorts {
  rpc: Pick<RpcCaller, "call">;
  openPanel: WorkspaceRuntime["openPanel"];
  contextId: string;
  operationPrefix: string;
}

/** Run the existing immutable test artifact in its complete browser or workerd runtime, with real Testbench evidence. */
export async function executeSandboxTest(
  ports: SandboxTestExecutionPorts,
  artifact: WorkspaceTestArtifactV1,
  testName: string | undefined,
  signal?: AbortSignal,
): Promise<TestExecutionResultV1> {
  const testsPanel = await ports.openPanel("about/testbench", {
    operationId: `verify-testbench:${ports.operationPrefix}:${crypto.randomUUID()}`,
    contextId: ports.contextId,
    ref: `ctx:${ports.contextId}`,
    signal,
  });
  let runtimeEntityId: string | undefined;
  const runInTestbench = async (): Promise<TestExecutionResultV1> => {
    const testbenchCall = testsPanel.call as Record<
      string,
      (request: unknown) => Promise<unknown>
    >;
    const request = {
      protocol: "workspace-test-execution-request.v1" as const,
      artifactKey: artifact.artifactKey,
      executionDigest: artifact.execution.executionDigest,
      ...(testName ? { testName } : {}),
      limits: { timeoutMs: 10_000, memoryMb: 128 },
    };
    const identity = {
      target: artifact.target,
      suite: artifact.suite,
      artifactKey: artifact.artifactKey,
      runtime: artifact.runtime,
      selectedFiles: artifact.selectedFiles,
    };
    await testbenchCall["tests.record"]!({
      phase: "running",
      ...identity,
    });
    try {
      let raw: unknown;
      if (artifact.runtime === "browser") {
        const targetPanel = await ports.openPanel(artifact.target, {
          parentId: testsPanel.id,
          operationId: `verify-test:${ports.operationPrefix}:${crypto.randomUUID()}`,
          contextId: ports.contextId,
          artifact: {
            buildKey: artifact.execution.buildKey,
            executionDigest: artifact.execution.executionDigest,
          },
          signal,
        });
        runtimeEntityId =
          (await targetPanel.observe()).runtimeEntityId ?? targetPanel.id;
        const call = targetPanel.call as Record<
          string,
          (request: unknown) => Promise<unknown>
        >;
        raw = await call["tests.run"]!(request);
      } else {
        const worker = await ports.rpc.call(
          "main",
          mainRpcMethods["runtime.createEntity"],
          [
            {
              kind: "worker",
              execution: {
                surface: "code",
                source: artifact.target,
                artifact: {
                  buildKey: artifact.execution.buildKey,
                  executionDigest: artifact.execution.executionDigest,
                },
              },
              key: `test-${crypto.randomUUID()}`,
              contextId: ports.contextId,
            },
          ],
          { signal },
        );
        runtimeEntityId = worker.id;
        raw = await ports.rpc.call(
          worker.id,
          testRunnerRpcMethods.run,
          [request],
          {
            signal,
          },
        );
      }
      const result = testExecutionResultV1Schema.parse(raw);
      if (
        result.artifactKey !== artifact.artifactKey ||
        result.executionDigest !== artifact.execution.executionDigest ||
        result.runtime !== artifact.runtime
      ) {
        throw new Error(
          "Sandbox test executor returned a mismatched execution identity",
        );
      }
      await testbenchCall["tests.record"]!({
        phase: "done",
        ...identity,
        runtimeEntityId,
        result,
      });
      return result;
    } catch (error) {
      await testbenchCall["tests.record"]!({
        phase: "error",
        ...identity,
        ...(runtimeEntityId ? { runtimeEntityId } : {}),
        error: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
      throw error;
    }
  };
  const failures: unknown[] = [];
  let result: TestExecutionResultV1 | undefined;
  try {
    result = await runInTestbench();
  } catch (error) {
    failures.push(error);
  }
  if (artifact.runtime === "workerd" && runtimeEntityId) {
    try {
      await ports.rpc.call("main", mainRpcMethods["runtime.retireEntity"], [
        { id: runtimeEntityId },
      ]);
    } catch (error) {
      failures.push(error);
    }
  }
  // Coordinator cleanup owns browser children, including a child whose boot failed.
  try {
    await testsPanel.archive();
  } catch (error) {
    failures.push(error);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(
      failures,
      "Sandbox test execution and cleanup failed",
    );
  return result!;
}

/** Typed workflow entry point. Uses the same operation and receipt producer as the verify tool. */
export async function verifyUnit(
  ports: SandboxTestExecutionPorts,
  input: VerifyToolInput,
  signal?: AbortSignal,
): Promise<JsonRepresentation<VerifyToolDetails>> {
  const result = await executeUnitVerification(
    ports.rpc,
    () => ports.contextId,
    (artifact, testName, executionSignal) =>
      executeSandboxTest(ports, artifact, testName, executionSignal),
    input,
    signal,
  );
  if (result.details === undefined)
    throw new Error("Unit verification produced no typed evidence");
  return result.details;
}
