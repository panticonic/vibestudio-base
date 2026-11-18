import { describe, expect, it, vi } from "vitest";
import { parseSha256 } from "@vibestudio/shared/execution/identity";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import type {
  WorkspaceTestArtifactV1,
  TestExecutionResultV1,
} from "@vibestudio/service-schemas/build";
import type { SandboxTestExecutionPorts } from "./unit-verification.js";
import { executeSandboxTest, verifyUnit } from "./unit-verification.js";

function artifact(runtime: "browser" | "workerd"): WorkspaceTestArtifactV1 {
  return {
    protocol: "workspace-test-artifact.v1",
    artifactKey: "b".repeat(64),
    target: runtime === "browser" ? "panels/owned" : "workers/owned",
    suite: "unit",
    runtime,
    selectedFiles: ["index.test.ts"],
    execution: {
      version: 1,
      sourceState: {
        kind: "workspace",
        workspaceId: "workspace:owned",
        effectiveVersion: parseSha256("a".repeat(64)),
        state: { kind: "event", eventId: "event:owned" },
        contentRoots: [
          {
            repoPath: runtime === "browser" ? "panels/owned" : "workers/owned",
            stateHash: `state:${"a".repeat(64)}`,
          },
        ],
        sourceClosureDigest: parseSha256("d".repeat(64)),
      },
      recipeDigest: parseSha256("e".repeat(64)),
      buildKey: parseSha256("f".repeat(64)),
      artifactDigest: parseSha256("b".repeat(64)),
      executionDigest: parseSha256("c".repeat(64)),
    },
  };
}
function setup(runtime: "browser" | "workerd" = "workerd") {
  const selected = artifact(runtime);
  const result: TestExecutionResultV1 = {
    protocol: "workspace-test-execution-result.v1",
    artifactKey: selected.artifactKey,
    executionDigest: selected.execution.executionDigest,
    runtime,
    status: "passed",
    passed: 1,
    failed: 0,
    skipped: 0,
    durationMs: 1,
    files: [{ file: "index.test.ts", status: "pass" }],
  };
  const run = vi.fn(async () => result);
  const retire = vi.fn(async () => undefined);
  const record = vi.fn(async (_value: unknown) => undefined);
  const archive = vi.fn(async () => undefined);
  const calls = vi.fn(
    async (
      _target: string,
      method: string,
      _args: unknown[],
      _options?: unknown,
    ) => {
      if (method === "build.resolveTestSuite")
        return {
          protocol: "workspace-test-plan.v1",
          target: selected.target,
          suite: selected.suite,
          runtime: selected.runtime,
          stateHash: `state:${"a".repeat(64)}`,
        };
      if (method === "build.getTestArtifact") return selected;
      if (method === "runtime.createEntity")
        return {
          id: "worker:owned",
          kind: "worker",
          source: {
            repoPath: "workers/owned",
            effectiveVersion: parseSha256("a".repeat(64)),
          },
          contextId: "ctx-owned",
          targetId: "worker:owned",
        };
      if (method === "runtime.retireEntity") return retire();
      if (method === "tests.run") return run();
      throw new Error(`Unexpected original RPC method ${method}`);
    },
  );
  const rpc = schemaRpcMock({
    call: async <T>(
      target: string,
      method: string,
      args: unknown[],
      options?: unknown,
    ) => (await calls(target, method, args, options)) as T,
  });
  const observe = vi.fn(async () => ({
    runtimeEntityId: "panel-runtime:owned",
  }));
  const openPanel = vi.fn(async (source: string, _options?: unknown) =>
    source === "about/testbench"
      ? { id: "coordinator", call: { "tests.record": record }, archive }
      : { id: "browser-child", call: { "tests.run": run }, observe },
  );
  const ports: SandboxTestExecutionPorts = {
    rpc,
    openPanel: openPanel as unknown as SandboxTestExecutionPorts["openPanel"],
    contextId: "ctx-owned",
    operationPrefix: "owner-channel",
  };
  return {
    selected,
    result,
    run,
    retire,
    record,
    archive,
    calls,
    observe,
    openPanel,
    ports,
  };
}

describe("shared complete-runtime test execution", () => {
  it("uses the original scoped RPC and exact workerd artifact, records evidence and retires without the execution signal", async () => {
    const test = setup(),
      signal = new AbortController().signal;
    expect(
      await executeSandboxTest(
        test.ports,
        test.selected,
        "one example",
        signal,
      ),
    ).toEqual(test.result);
    expect(test.openPanel).toHaveBeenCalledWith(
      "about/testbench",
      expect.objectContaining({
        contextId: "ctx-owned",
        ref: "ctx:ctx-owned",
        signal,
      }),
    );
    expect(test.calls).toHaveBeenCalledWith(
      "main",
      "runtime.createEntity",
      [
        expect.objectContaining({
          contextId: "ctx-owned",
          execution: {
            surface: "code",
            source: "workers/owned",
            artifact: {
              buildKey: test.selected.execution.buildKey,
              executionDigest: test.selected.execution.executionDigest,
            },
          },
        }),
      ],
      { signal },
    );
    expect(test.calls).toHaveBeenCalledWith(
      "worker:owned",
      "tests.run",
      [
        expect.objectContaining({
          artifactKey: test.selected.artifactKey,
          executionDigest: test.selected.execution.executionDigest,
          testName: "one example",
        }),
      ],
      { signal },
    );
    expect(test.calls).toHaveBeenCalledWith(
      "main",
      "runtime.retireEntity",
      [{ id: "worker:owned" }],
      undefined,
    );
    expect(
      test.record.mock.calls.map(
        ([value]) => (value as { phase: string }).phase,
      ),
    ).toEqual(["running", "done"]);
    expect(test.archive).toHaveBeenCalledOnce();
  });
  it("returns the canonical verification report and receipt through the typed non-tool entry point", async () => {
    const test = setup();
    const details = await verifyUnit(test.ports, {
      operation: "test",
      target: test.selected.target,
      suite: "unit",
    });
    expect(details).toMatchObject({
      operation: "test",
      status: "passed",
      report: { total: 1, failed: 0, runtime: "workerd" },
      receipt: {
        protocol: "unit-verification-receipt.v1",
        contextId: "ctx-owned",
        ref: "ctx:ctx-owned",
        suite: "unit",
        runtime: "workerd",
        artifactKey: test.selected.artifactKey,
        executionDigest: test.selected.execution.executionDigest,
        stateHash: `state:${"a".repeat(64)}`,
      },
    });
    expect(test.calls).toHaveBeenCalledWith(
      "main",
      "build.resolveTestSuite",
      [test.selected.target, "ctx:ctx-owned", "unit"],
      { signal: undefined },
    );
    expect(test.retire).toHaveBeenCalledOnce();
    expect(test.archive).toHaveBeenCalledOnce();
  });
  it("opens a real browser child under Testbench with its sealed artifact and preserves coordinator ownership", async () => {
    const test = setup("browser"),
      signal = new AbortController().signal;
    await executeSandboxTest(test.ports, test.selected, undefined, signal);
    expect(test.openPanel).toHaveBeenCalledWith(
      "panels/owned",
      expect.objectContaining({
        parentId: "coordinator",
        contextId: "ctx-owned",
        artifact: {
          buildKey: test.selected.execution.buildKey,
          executionDigest: test.selected.execution.executionDigest,
        },
        signal,
      }),
    );
    expect(test.observe).toHaveBeenCalledOnce();
    expect(test.calls).not.toHaveBeenCalled();
    expect(test.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: "done",
        runtimeEntityId: "panel-runtime:owned",
        result: test.result,
      }),
    );
    expect(test.archive).toHaveBeenCalledOnce();
  });
  for (const field of ["artifactKey", "executionDigest", "runtime"] as const)
    it(`rejects a schema-valid mismatched ${field} before recording success`, async () => {
      const test = setup();
      test.run.mockResolvedValueOnce({
        ...test.result,
        [field]: field === "runtime" ? "browser" : "9".repeat(64),
      });
      await expect(
        executeSandboxTest(test.ports, test.selected, undefined),
      ).rejects.toThrow("mismatched execution identity");
      expect(
        test.record.mock.calls.map(
          ([value]) => (value as { phase: string }).phase,
        ),
      ).toEqual(["running", "error"]);
      expect(test.retire).toHaveBeenCalledOnce();
      expect(test.archive).toHaveBeenCalledOnce();
    });
  it("preserves original execution cancellation while still retiring the worker and archiving its coordinator", async () => {
    const test = setup(),
      controller = new AbortController(),
      failure = new Error("owner cancelled");
    test.run.mockImplementationOnce(async () => {
      controller.abort(failure);
      throw failure;
    });
    await expect(
      executeSandboxTest(
        test.ports,
        test.selected,
        undefined,
        controller.signal,
      ),
    ).rejects.toBe(failure);
    expect(test.retire).toHaveBeenCalledOnce();
    expect(test.archive).toHaveBeenCalledOnce();
    expect(
      test.calls.mock.calls.find(
        ([, method]) => method === "runtime.retireEntity",
      )?.[3],
    ).toBeUndefined();
  });
  it("retains the execution and both cleanup failures instead of masking the original cause", async () => {
    const test = setup(),
      execution = new Error("test failed"),
      retirement = new Error("retire failed"),
      archive = new Error("archive failed");
    test.run.mockRejectedValueOnce(execution);
    test.retire.mockRejectedValueOnce(retirement);
    test.archive.mockRejectedValueOnce(archive);
    const error = await executeSandboxTest(
      test.ports,
      test.selected,
      undefined,
    ).catch((value) => value);
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors).toEqual([execution, retirement, archive]);
    expect(test.retire).toHaveBeenCalledOnce();
    expect(test.archive).toHaveBeenCalledOnce();
  });
  it("archives the coordinator after a browser child boot failure", async () => {
    const test = setup("browser"),
      failure = new Error("child boot failed");
    test.openPanel.mockImplementationOnce(async () => ({
      id: "coordinator",
      call: { "tests.record": test.record },
      archive: test.archive,
    }));
    test.openPanel.mockRejectedValueOnce(failure);
    await expect(
      executeSandboxTest(test.ports, test.selected, undefined),
    ).rejects.toBe(failure);
    expect(test.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "error", error: failure.message }),
    );
    expect(test.archive).toHaveBeenCalledOnce();
  });
});
