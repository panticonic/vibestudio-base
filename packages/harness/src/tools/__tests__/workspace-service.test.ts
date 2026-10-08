import { executeTool } from "../../testing/native-tool.js";
import { describe, expect, it, vi } from "vitest";
import { Value } from "typebox/value";
import YAML from "yaml";
import { createWorkspaceServiceTool } from "../workspace-service.js";
import { StubVcs } from "./stub-vcs.js";

const authority = {
  contextId: "context:test",
  commandId: "command:workspace-service",
};
const initial = `systemEpoch: 1
singletonObjects:
  - source: workers/testkit-driver
    className: TestkitDriverDO
    key: workspace-testkit-driver
services:
  - source: workers/testkit-driver
    name: testkit-driver
    title: Test runner
    action: run workspace tests
    description: Run tests.
    protocols: [vibestudio.testkit-driver.v1]
    authority:
      principals: [host, code]
    durableObject:
      className: TestkitDriverDO
routes: []
`;

describe("workspace_service tool", () => {
  it("makes every upsert declaration field required in the public tool schema", () => {
    const tool = createWorkspaceServiceTool(
      new StubVcs({ files: { "meta/vibestudio.yml": initial } }),
      authority,
      { validateConfig: vi.fn(async () => {}) },
    );

    expect(
      Value.Check(tool.parameters, {
        operation: "upsert",
        source: "workers/todo-store",
        name: "todo-store",
        title: "Todo store",
        action: "read todos",
        description: "Read todos.",
        presentation: { domain: "automation", verb: "act" },
        protocols: ["example.todos.v1"],
        principals: ["code"],
        binding: "consent",
        transport: { kind: "durable-object", className: "TodoStore" },
      }),
    ).toBe(false);
    expect(
      Value.Check(tool.parameters, {
        operation: "remove",
        name: "todo-store",
      }),
    ).toBe(true);
  });

  it.each(["consent", "declared", { declaredFor: ["panels/todos"] }] as const)(
    "preserves explicit binding %j in one validated semantic edit",
    async (binding) => {
      const vcs = new StubVcs({ files: { "meta/vibestudio.yml": initial } });
      const validateConfig = vi.fn(async (content: string) => {
        expect(YAML.parse(content).services).toHaveLength(2);
      });
      const tool = createWorkspaceServiceTool(vcs, authority, {
        validateConfig,
      });

      const result = await executeTool(
        tool,
        {
          operation: "upsert",
          source: "workers/todo-store",
          name: "todo-store",
          title: "Todo store",
          action: "read and update todos",
          description: "Keep shared todos for this workspace.",
          notability: "everyday",
          presentation: { domain: "automation", verb: "manage" },
          protocols: ["example.todos.v1"],
          principals: ["user", "code"],
          binding:
            typeof binding === "object"
              ? { declaredFor: [...binding.declaredFor] }
              : binding,
          transport: {
            kind: "durable-object",
            className: "TodoStore",
            objectKey: "main",
          },
        },
        { callId: "invocation:service" },
      );

      const config = YAML.parse(vcs.read("meta/vibestudio.yml")!);
      expect(config.services).toEqual([
        expect.objectContaining({
          name: "testkit-driver",
          protocols: ["vibestudio.testkit-driver.v1"],
          durableObject: { className: "TestkitDriverDO" },
        }),
        expect.objectContaining({
          name: "todo-store",
          notability: "everyday",
          protocols: ["example.todos.v1"],
          authority: { principals: ["user", "code"], binding },
          durableObject: { className: "TodoStore" },
        }),
      ]);
      expect(config.singletonObjects).toContainEqual({
        source: "workers/todo-store",
        className: "TodoStore",
        key: "main",
      });
      expect(validateConfig).toHaveBeenCalledOnce();
      expect(result.details).toMatchObject({
        changed: true,
        serviceName: "todo-store",
        docsId: "workspace:todo-store",
      });
    },
  );

  it("validates repeated upserts without authoring an unchanged semantic edit", async () => {
    const vcs = new StubVcs({ files: { "meta/vibestudio.yml": initial } });
    const edit = vi.spyOn(vcs, "edit");
    const validateConfig = vi.fn(async () => {});
    const tool = createWorkspaceServiceTool(vcs, authority, { validateConfig });
    const command = {
      operation: "upsert" as const,
      source: "workers/probe",
      name: "probe-value",
      title: "Probe value",
      action: "read the probe value",
      description: "Report a small value.",
      notability: "everyday" as const,
      presentation: { domain: "automation" as const, verb: "see" as const },
      protocols: ["example.probe.v1"],
      principals: ["user" as const, "code" as const],
      binding: "declared" as const,
      transport: { kind: "worker" as const, routePath: "/probe" },
    };
    await executeTool(tool, command, { callId: "invocation:create" });
    const content = vcs.read("meta/vibestudio.yml");
    const head = await vcs.status({ contextId: authority.contextId });
    const repeated = await executeTool(tool, command, {
      callId: "invocation:repeat",
    });
    expect(repeated.details).toMatchObject({
      changed: false,
      serviceName: "probe-value",
      docsId: "workspace:probe-value",
      diff: "",
    });
    expect(repeated.details).not.toHaveProperty("vcsResult");
    expect(validateConfig).toHaveBeenCalledTimes(2);
    expect(edit).toHaveBeenCalledOnce();
    expect(vcs.read("meta/vibestudio.yml")).toBe(content);
    expect(await vcs.status({ contextId: authority.contextId })).toEqual(head);
  });

  it("does not create a working state when complete-config validation fails", async () => {
    const vcs = new StubVcs({ files: { "meta/vibestudio.yml": initial } });
    const tool = createWorkspaceServiceTool(vcs, authority, {
      validateConfig: vi.fn(async () => {
        throw new Error("candidate is invalid");
      }),
    });

    await expect(
      executeTool(
        tool,
        {
          operation: "upsert",
          source: "workers/todo-store",
          name: "todo-store",
          title: "Todo store",
          action: "read todos",
          description: "Read todos.",
          notability: "everyday",
          presentation: { domain: "automation", verb: "see" },
          protocols: ["example.todos.v1"],
          principals: ["code"],
          binding: "consent",
          transport: {
            kind: "durable-object",
            className: "TodoStore",
            objectKey: "main",
          },
        },
        { callId: "invocation:invalid" },
      ),
    ).rejects.toThrow("candidate is invalid");
    expect(vcs.read("meta/vibestudio.yml")).toBe(initial);
    expect(vcs.lastEditInput).toBeUndefined();
  });
});
