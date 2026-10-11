import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { executeTool } from "../../testing/native-tool.js";
import { describe, expect, it, vi } from "vitest";
import type { UnitBuildReportWire } from "@vibestudio/service-schemas/build";
import { createVerifyTool } from "../verify.js";

const fixtureExecution = {
  version: 1 as const,
  sourceState: {
    kind: "workspace" as const,
    workspaceId: "workspace:verify",
    effectiveVersion: "a".repeat(64),
    state: { kind: "event" as const, eventId: "event:verify" },
    contentRoots: [{ repoPath: "packages/parser", stateHash: `state:${"a".repeat(64)}` }],
    sourceClosureDigest: "d".repeat(64),
  },
  recipeDigest: "e".repeat(64),
  buildKey: "f".repeat(64),
  artifactDigest: "b".repeat(64),
  executionDigest: "c".repeat(64),
};

function rpcResult<T>(value: T) {
  const calls = vi.fn();
  return {
    calls,
    callMain: async <R>(
      _target: string, method: string,
      args: unknown[],
      options?: import("@vibestudio/rpc").RpcCallOptions,
    ) => {
      calls(method, args, options?.signal);
      return value as unknown as R;
    },
  };
}

describe("context-exact verify tool", () => {
  it("builds the current semantic context and reports success", async () => {
    const { callMain, calls } = rpcResult({
      stateHash: `state:${"b".repeat(64)}`,
      repoPath: "packages/parser",
      unitName: "@workspace/parser",
      kind: "package",
      status: "ok" as const,
      diagnostics: [],
      builds: [
        {
          target: "library:worker" as const,
          buildKey: "a".repeat(64),
          diagnosticIndexes: [],
        },
      ],
    });
    const controller = new AbortController();
    const tool = createVerifyTool(schemaRpcMock({ call: callMain }), () => "context-7");

    const result = await executeTool(
      tool,
      { operation: "build", target: "packages/parser" },
      { callId: "call-build", signal: controller.signal },
    );

    expect(calls).toHaveBeenCalledWith(
      "build.getBuildReport",
      ["packages/parser", "ctx:context-7"],
      controller.signal,
    );
    expect(result.isError).toBe(false);
    expect(result.details).toMatchObject({
      operation: "build",
      status: "ok",
      receipt: {
        protocol: "unit-verification-receipt.v1",
        operation: "build",
        stateHash: `state:${"b".repeat(64)}`,
        target: "packages/parser",
        contextId: "context-7",
        ref: "ctx:context-7",
        reportRequest: {
          method: "build.getBuildReport",
          args: ["packages/parser", "ctx:context-7"],
        },
        reportDigest: expect.stringMatching(/^[0-9a-f]{64}$/u),
        unit: {
          repoPath: "packages/parser",
          unitName: "@workspace/parser",
          kind: "package",
        },
        status: "ok",
        builds: [{ target: "library:worker", buildKey: "a".repeat(64) }],
        diagnostics: { total: 0, retained: 0, truncated: 0 },
      },
      provenance: {
        ref: "ctx:context-7",
        scope: "context-candidate",
        publication: "unchanged",
        liveRuntime: "unchanged",
      },
    });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining(
        "protected main and every live runtime remain unchanged",
      ),
    });
  });

  it("publishes an immediate running update before waiting for verification", async () => {
    let release!: (value: UnitBuildReportWire) => void;
    const pending = new Promise<UnitBuildReportWire>((resolve) => {
      release = resolve;
    });
    const callMain = async <T>(): Promise<T> => (await pending) as T;
    const updates: unknown[] = [];
    const output: Array<string | Uint8Array> = [];
    const execution = executeTool(
      createVerifyTool(schemaRpcMock({ call: callMain }), () => "context-7"),
      { operation: "build", target: "packages/example" },
      {
        callId: "call-progress",
        onDetails: (update) => {
          updates.push(update);
        },
        onOutput: (chunk) => {
          output.push(chunk);
        },
      },
    );

    expect(output).toEqual(["Building packages/example…"]);
    expect(updates).toEqual([
      { operation: "build", target: "packages/example", status: "running" },
    ]);

    release({
      stateHash: `state:${"b".repeat(64)}`,
      repoPath: "packages/example",
      kind: "package",
      status: "ok",
      diagnostics: [],
      builds: [],
    });
    await expect(execution).resolves.toMatchObject({ isError: false });
  });

  it("returns source build diagnostics as a completed failed-check report", async () => {
    const { callMain } = rpcResult({
      stateHash: `state:${"b".repeat(64)}`,
      repoPath: "panels/editor",
      kind: "panel",
      status: "failed" as const,
      diagnostics: [
        {
          source: "tsc" as const,
          severity: "error" as const,
          file: "panels/editor/index.tsx",
          line: 4,
          column: 9,
          message: "Cannot find name 'missing'",
        },
      ],
      builds: [{ target: "runtime" as const, diagnosticIndexes: [0] }],
    });
    const result = await executeTool(
      createVerifyTool(schemaRpcMock({ call: callMain }), () => "context-7"),
      {
        operation: "build",
        target: "panels/editor",
      },
      { callId: "call-build" },
    );

    expect(result.isError).toBe(false);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("1 diagnostic"),
    });
    expect((result.content[0] as { text: string }).text).toContain(
      "Cannot find name",
    );
    const modelEvidence = JSON.parse(
      (result.content[0] as { text: string }).text.split("\n").at(-1)!,
    );
    expect(modelEvidence.diagnostics).toEqual(
      (result.details as { report: UnitBuildReportWire }).report.diagnostics,
    );
    expect(modelEvidence.receipt).toEqual(
      (result.details as { receipt: unknown }).receipt,
    );
    expect((result.content[0] as { text: string }).text).toContain(
      "Inspect these diagnostics, repair the source or dependency, then rerun verify once",
    );
    expect(result.details).toMatchObject({
      operation: "build",
      report: { diagnostics: [{ source: "tsc", severity: "error" }] },
    });
    expect(result.details).not.toHaveProperty("failureKind");
    expect(result.details).not.toHaveProperty("failure");
    expect(JSON.stringify(result)).not.toContain("[object Object]");
  });

  it.each([
    {
      name: "infrastructure-only",
      diagnostics: [
        {
          source: "infrastructure" as const,
          severity: "error" as const,
          file: "panels/editor/package.json",
          line: 0,
          column: 0,
          message: "Declared runtime dependency is unavailable",
        },
      ],
    },
    {
      name: "mixed source and infrastructure",
      diagnostics: [
        {
          source: "tsc" as const,
          severity: "error" as const,
          file: "panels/editor/index.tsx",
          line: 4,
          column: 9,
          message: "Cannot find name 'missing'",
        },
        {
          source: "infrastructure" as const,
          severity: "error" as const,
          file: "panels/editor/package.json",
          line: 0,
          column: 0,
          message: "Declared runtime dependency is unavailable",
        },
      ],
    },
  ])("classifies $name build reports as infrastructure failures", async ({ diagnostics }) => {
    const { callMain } = rpcResult({
      stateHash: `state:${"b".repeat(64)}`,
      repoPath: "panels/editor",
      kind: "panel",
      status: "failed" as const,
      diagnostics,
      builds: [
        {
          target: "runtime" as const,
          diagnosticIndexes: diagnostics.map((_, index) => index),
        },
      ],
    });

    const result = await executeTool(
      createVerifyTool(schemaRpcMock({ call: callMain }), () => "context-7"),
      {
        operation: "build",
        target: "panels/editor",
      },
      { callId: "call-build" },
    );

    expect(result.isError).toBe(true);
    expect(result.details).not.toHaveProperty("failureKind");
    expect(result.details).toMatchObject({
      status: "failed",
      failure: {
        protocol: "agent-tool-failure.v1",
        code: "build_verification_failed",
        kind: "infrastructure",
        retry: { policy: "reobserve" },
        recovery: { action: "reobserve" },
      },
    });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("Build verification for panels/editor encountered an infrastructure failure.");
    expect(text).toContain("Declared runtime dependency is unavailable");
    expect(text).toContain(
      "Do not repair user source based on this report",
    );
    expect(text).not.toContain("repair the source or dependency");
  });

  it("keeps a failed build report without error diagnostics as an integrity failure", async () => {
    const { callMain } = rpcResult({
      stateHash: `state:${"b".repeat(64)}`,
      repoPath: "panels/editor",
      kind: "panel",
      status: "failed" as const,
      diagnostics: [],
      builds: [],
    });
    const result = await executeTool(
      createVerifyTool(schemaRpcMock({ call: callMain }), () => "context-7"),
      { operation: "build", target: "panels/editor" },
      { callId: "call-build" },
    );

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({
      status: "failed",
      report: { status: "failed", diagnostics: [] },
      receipt: { status: "failed" },
      failure: {
        protocol: "agent-tool-failure.v1",
        code: "build_report_inconsistent",
        kind: "integrity",
        retry: { policy: "none" },
        recovery: { action: "stop" },
      },
    });
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain(
      "failed but contains no error diagnostics",
    );
    expect(text).toContain(
      "stop. The failed status has no error diagnostic",
    );
    expect(text).toContain("inspect the build report producer");
    expect(text).not.toContain("repair the source or dependency");
  });

  it("passes host-derived structured repairs through the diagnostic bounds untouched", async () => {
    const repair = {
      code: "missing-authority-request",
      file: "panels/editor/package.json",
      field: "vibestudio.authority.requests",
      request: {
        capability: "workspace-service:notes",
        resource: { kind: "exact", key: "do:workers/notes:NotesDO:main" },
        tier: "gated",
        evidence: "exact",
      },
      docsId: "workspace:notes",
    };
    const { callMain } = rpcResult({
      stateHash: `state:${"b".repeat(64)}`,
      repoPath: "panels/editor",
      kind: "panel",
      status: "failed" as const,
      diagnostics: [
        {
          source: "authority" as const,
          severity: "error" as const,
          file: "panels/editor/index.tsx",
          line: 4,
          column: 9,
          message:
            "Calling notes.delete requires 'workspace-service:notes' at gated tier",
          repair,
        } as never,
      ],
      builds: [{ target: "runtime" as const, diagnosticIndexes: [0] }],
    });
    const result = await executeTool(
      createVerifyTool(schemaRpcMock({ call: callMain }), () => "context-7"),
      {
        operation: "build",
        target: "panels/editor",
      },
      { callId: "call-build" },
    );

    const report = (
      result.details as { report: { diagnostics: Array<{ repair?: unknown }> } }
    ).report;
    expect(report.diagnostics[0]!.repair).toEqual(repair);
    const modelEvidence = JSON.parse(
      (result.content[0] as { text: string }).text.split("\n").at(-1)!,
    );
    expect(modelEvidence.diagnostics[0].repair).toEqual(repair);
  });

  it("classifies a skipped content target as a correctable request", async () => {
    const { callMain } = rpcResult({
      stateHash: `state:${"b".repeat(64)}`,
      repoPath: "packages/docs",
      kind: "content",
      status: "skipped" as const,
      diagnostics: [],
      builds: [],
    });

    const result = await executeTool(
      createVerifyTool(schemaRpcMock({ call: callMain }), () => "context-7"),
      {
        operation: "build",
        target: "packages/docs",
      },
      { callId: "call-build" },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Build skipped for packages/docs"),
    });
    expect(result.details).toMatchObject({
      status: "skipped",
      failure: {
        code: "build_target_not_buildable",
        kind: "domain",
        retry: { policy: "correct-input" },
        recovery: { action: "correct-request" },
      },
    });
  });

  it("bounds the one canonical diagnostic array and remaps target references", async () => {
    const diagnostics = Array.from({ length: 45 }, (_, index) => ({
      source: "tsc" as const,
      severity: "error" as const,
      file: `panels/editor/file-${index}.ts`,
      line: index + 1,
      column: 1,
      message: index === 0 ? "x".repeat(3_000) : `failure ${index}`,
    }));
    const { callMain } = rpcResult({
      stateHash: `state:${"b".repeat(64)}`,
      repoPath: "panels/editor",
      kind: "panel",
      status: "failed" as const,
      diagnostics,
      builds: [
        { target: "runtime" as const, diagnosticIndexes: [0, 39, 40, 44] },
      ],
    });

    const result = await executeTool(
      createVerifyTool(schemaRpcMock({ call: callMain }), () => "context-7"),
      {
        operation: "build",
        target: "panels/editor",
      },
      { callId: "call-build" },
    );

    expect(result.details).toMatchObject({
      truncatedDiagnostics: 5,
      truncatedDiagnosticText: 1_000,
      receipt: {
        diagnostics: { total: 45, retained: 40, truncated: 5 },
      },
      report: {
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringMatching(/\[truncated\]$/u),
          }),
        ]),
        builds: [{ target: "runtime", diagnosticIndexes: [0, 39] }],
      },
    });
    expect(
      (result.details as { report: UnitBuildReportWire }).report.diagnostics,
    ).toHaveLength(40);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("45 diagnostics; 40 retained"),
    });
  });

  it("reports compiler refusal without manufacturing an execution, then executes repaired source", async () => {
    const plan = {
      protocol: "workspace-test-plan.v1",
      target: "packages/parser",
      suite: "unit",
      runtime: "browser",
      stateHash: `state:${"a".repeat(64)}`,
    };
    const refusal = Object.assign(new Error("Missing document export"), {
      errorData: {
        code: "TestCompilationFailed",
        target: plan.target,
        suite: plan.suite,
        runtime: plan.runtime,
        stateHash: plan.stateHash,
        diagnostics: [
          {
            source: "esbuild",
            severity: "error",
            file: "parser.test.ts",
            line: 1,
            column: 9,
            message: "No matching export document",
          },
        ],
      },
    });
    let repaired = false;
    const executor = vi.fn(async () => ({
      protocol: "workspace-test-execution-result.v1" as const,
      artifactKey: "b".repeat(64),
      executionDigest: "c".repeat(64),
      runtime: "browser" as const,
      status: "passed" as const,
      passed: 1,
      failed: 0,
      skipped: 0,
      durationMs: 1,
      files: [],
    }));
    const tool = createVerifyTool(
      schemaRpcMock({ call: async <T>(_target: string, method: string) => {
        if (method === "build.resolveTestSuite") return plan as T;
        if (!repaired) throw refusal;
        return {
          protocol: "workspace-test-artifact.v1",
          target: plan.target,
          suite: plan.suite,
          runtime: plan.runtime,
          selectedFiles: ["parser.test.ts"],
          artifactKey: "b".repeat(64),
          execution: fixtureExecution,
        } as T;
      } }),
      () => "context-7",
      executor,
    );
    const failed = await executeTool(
      tool,
      { operation: "test", target: plan.target },
      { callId: "compile" },
    );
    expect(failed.isError).toBe(false);
    expect(executor).not.toHaveBeenCalled();
    expect(failed.details).toMatchObject({
      status: "compilation-failed",
      report: refusal.errorData,
      receipt: { stateHash: plan.stateHash, status: "compilation-failed" },
    });
    expect(failed.details).not.toHaveProperty("failureKind");
    expect(failed.details).not.toHaveProperty("failure");
    expect(failed.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining(
        "Inspect the compiler diagnostics, repair the source, then rerun verify.",
      ),
    });
    const evidence = failed.details as { report: object; receipt: object };
    for (const key of [
      "artifactKey",
      "executionDigest",
      "passed",
      "failed",
      "total",
    ]) {
      expect(evidence.report).not.toHaveProperty(key);
      expect(evidence.receipt).not.toHaveProperty(key);
    }
    repaired = true;
    expect(
      (
        await executeTool(
          tool,
          { operation: "test", target: plan.target },
          { callId: "repaired" },
        )
      ).isError,
    ).toBe(false);
    expect(executor).toHaveBeenCalledOnce();
  });

  it.each(["untyped", "infrastructure", "mixed", "empty", "wrong-state"])(
    "propagates %s failures without classifying them as compiler refusal",
    async (kind) => {
      const plan = {
        target: "packages/parser",
        suite: "unit",
        runtime: "browser",
        protocol: "workspace-test-plan.v1",
        stateHash: `state:${"a".repeat(64)}`,
      };
      const source = {
        source: "esbuild",
        severity: "error",
        file: "parser.test.ts",
        line: 1,
        column: 1,
        message: "bad export",
      };
      const infra = {
        ...source,
        source: "infrastructure",
        message: "Storage unavailable",
      };
      const error = Object.assign(new Error("original failure"), {
        errorData:
          kind === "untyped"
            ? undefined
            : {
                code: "TestCompilationFailed",
                ...plan,
                stateHash:
                  kind === "wrong-state" ? "state:other" : plan.stateHash,
                diagnostics:
                  kind === "empty"
                    ? []
                    : kind === "mixed"
                      ? [source, infra]
                      : kind === "infrastructure"
                        ? [infra]
                        : [source],
              },
      });
      const executor = vi.fn();
      const tool = createVerifyTool(
        schemaRpcMock({ call: async <T>(_target: string, method: string) => {
          if (method === "build.resolveTestSuite") return plan as T;
          throw error;
        } }),
        () => "context-7",
        executor,
      );
      await expect(
        executeTool(
          tool,
          { operation: "test", target: plan.target },
          { callId: kind },
        ),
      ).rejects.toBe(error);
      expect(executor).not.toHaveBeenCalled();
    },
  );

  it("runs one focused browser selection without reaching the native extension", async () => {
    const calls = vi.fn();
    const callMain = async <T>(_target: string, method: string, args: unknown[]) => {
      calls(method, args);
      if (method === "build.resolveTestSuite") {
        return {
          protocol: "workspace-test-plan.v1",
          target: "packages/parser",
          suite: "unit",
          runtime: "browser",
          stateHash: `state:${"a".repeat(64)}`,
        } as T;
      }
      return {
        protocol: "workspace-test-artifact.v1",
        artifactKey: "b".repeat(64),
        target: "packages/parser",
        suite: "unit",
        runtime: "browser",
        selectedFiles: ["parser.test.ts"],
        execution: fixtureExecution,
      } as T;
    };
    const executeSandboxTest = vi.fn(async () => ({
      protocol: "workspace-test-execution-result.v1" as const,
      artifactKey: "b".repeat(64),
      executionDigest: "c".repeat(64),
      runtime: "browser" as const,
      status: "passed" as const,
      passed: 1,
      failed: 0,
      skipped: 0,
      durationMs: 2,
      files: [{ file: "parser.test.ts", status: "pass" as const }],
    }));
    const result = await executeTool(
      createVerifyTool(schemaRpcMock({ call: callMain }), () => "context-7", executeSandboxTest),
      {
        operation: "test",
        target: "packages/parser",
        file: "parser.test.ts",
        testName: "parses empty input",
      },
      { callId: "call-test" },
    );

    expect(calls).toHaveBeenCalledWith("build.resolveTestSuite", [
      "packages/parser",
      "ctx:context-7",
      undefined,
    ]);
    expect(calls).toHaveBeenCalledWith("build.getTestArtifact", [
      "packages/parser",
      "ctx:context-7",
      { suite: "unit", file: "parser.test.ts" },
    ]);
    expect(
      calls.mock.calls.some(([method]) => method === "extensions.invoke"),
    ).toBe(false);
    expect(executeSandboxTest).toHaveBeenCalledOnce();
    expect(result.isError).toBe(false);
    expect(result.details).toMatchObject({
      operation: "test",
      status: "passed",
    });
    const modelEvidence = JSON.parse(
      (result.content[0] as { text: string }).text.split("\n").at(-1)!,
    );
    expect(modelEvidence).toEqual({
      report: (result.details as { report: unknown }).report,
      receipt: (result.details as { receipt: unknown }).receipt,
    });
  });

  it.each(["failed", "cancelled", "infrastructure-error"] as const)(
    "preserves %s execution even when partial counts contain passed tests",
    async (status) => {
      const callMain = async <T>(_target: string, method: string) =>
        (method === "build.resolveTestSuite"
          ? {
              protocol: "workspace-test-plan.v1",
              target: "packages/parser",
              suite: "unit",
              runtime: "workerd",
              stateHash: `state:${"a".repeat(64)}`,
            }
          : {
              protocol: "workspace-test-artifact.v1",
              artifactKey: "b".repeat(64),
              target: "packages/parser",
              suite: "unit",
              runtime: "workerd",
              selectedFiles: ["parser.test.ts"],
              execution: fixtureExecution,
            }) as T;
      const result = await executeTool(
        createVerifyTool(
          schemaRpcMock({ call: callMain }),
          () => "context-7",
          async () => ({
            protocol: "workspace-test-execution-result.v1",
            artifactKey: "b".repeat(64),
            executionDigest: "c".repeat(64),
            runtime: "workerd",
            status,
            passed: 1,
            failed: status === "failed" ? 1 : 0,
            skipped: 0,
            durationMs: 1,
            files:
              status === "failed"
                ? [
                    {
                      file: "parser.test.ts",
                      status: "fail",
                      errors: ["expected 1 to equal 2"],
                    },
                  ]
                : [{ file: "parser.test.ts", status: "pass" }],
          }),
        ),
        { operation: "test", target: "packages/parser" },
        { callId: "call-test" },
      );
      expect(result.isError).toBe(status !== "failed");
      expect(result.details).toMatchObject({
        status,
        report: { status },
        receipt: { status },
      });
      if (status === "failed") {
        expect(result.details).not.toHaveProperty("failureKind");
        expect(result.details).not.toHaveProperty("failure");
        expect(result.content[0]).toMatchObject({
          type: "text",
          text: expect.stringContaining(
            "Inspect these failures, repair the source or tests, then rerun verify once.",
          ),
        });
      } else {
        expect(result.details).not.toHaveProperty("failureKind");
        expect(result.details).toMatchObject({
          failure: {
            kind: status === "cancelled" ? "cancelled" : "infrastructure",
          },
        });
      }
    },
  );

  it("does not present zero discovered tests as successful verification", async () => {
    const callMain = async <T>(_target: string, method: string) =>
      (method === "build.resolveTestSuite"
        ? {
            protocol: "workspace-test-plan.v1",
            target: "packages/parser",
            suite: "unit",
            runtime: "workerd",
            stateHash: `state:${"a".repeat(64)}`,
          }
        : {
            protocol: "workspace-test-artifact.v1",
            artifactKey: "b".repeat(64),
            target: "packages/parser",
            suite: "unit",
            runtime: "workerd",
            selectedFiles: ["parser.test.ts"],
            execution: fixtureExecution,
          }) as T;
    const result = await executeTool(
      createVerifyTool(
        schemaRpcMock({ call: callMain }),
        () => "context-7",
        async () => ({
          protocol: "workspace-test-execution-result.v1",
          artifactKey: "b".repeat(64),
          executionDigest: "c".repeat(64),
          runtime: "workerd",
          status: "no-tests",
          passed: 0,
          failed: 0,
          skipped: 0,
          durationMs: 1,
          files: [],
        }),
      ),
      { operation: "test", target: "packages/parser" },
      { callId: "call-test" },
    );

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({
      operation: "test",
      status: "no-tests",
      failure: {
        code: "no_tests_discovered",
        kind: "domain",
        retry: { policy: "correct-input" },
        recovery: { action: "correct-request" },
      },
    });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("verification did not pass"),
    });
  });
});
