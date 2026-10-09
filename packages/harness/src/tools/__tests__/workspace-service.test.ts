import { executeTool } from "../../testing/native-tool.js";
import { describe, expect, it, vi } from "vitest";
import { Value } from "typebox/value";
import YAML from "yaml";
import { createWorkspaceServiceTool } from "../workspace-service.js";
import { StubVcs } from "./stub-vcs.js";
import type {
  WorkspaceServiceBinding,
  WorkspaceServiceExport,
} from "@vibestudio/workspace-contracts/types";

const authority = { contextId: "context:test", commandId: "command:workspace-service" };
const initial = `systemEpoch: 1
singletonObjects:
  - source: workers/testkit-driver
    className: TestkitDriverDO
    key: workspace-testkit-driver
services:
  - source: workers/testkit-driver
    name: testkit-driver
routes: []
`;
const testkitPackage = JSON.stringify({ vibestudio: { services: [{
  name: "testkit-driver", action: "run workspace tests",
  presentation: { domain: "automation", verb: "act" },
  authority: { principals: ["host", "code"] },
  durableObject: { className: "TestkitDriverDO" },
}] } }, null, 2) + "\n";
const retainedExport = {
  name: "other-todo-service",
  action: "report todo metrics",
  presentation: { domain: "automation", verb: "see" },
  authority: { principals: ["code"] },
  worker: { routePath: "/metrics" },
};
const todoPackage = JSON.stringify({
  name: "todo-store",
  description: "Provider unit metadata must survive service authoring.",
  vibestudio: { icon: "🗂️", services: [retainedExport] },
}, null, 2) + "\n";
const files = {
  "meta/vibestudio.yml": initial,
  "workers/testkit-driver/package.json": testkitPackage,
  "workers/todo-store/package.json": todoPackage,
  "workers/probe/package.json": JSON.stringify({ name: "probe", vibestudio: { services: [] } }, null, 2) + "\n",
};
const todoService = (binding: WorkspaceServiceBinding): WorkspaceServiceExport => ({
  name: "todo-store",
  title: "Todo store",
  action: "read and update todos",
  description: "Keep shared todos for this workspace.",
  notability: "everyday" as const,
  presentation: { domain: "automation" as const, verb: "manage" as const },
  protocols: ["example.todos.v1"],
  authority: { principals: ["user", "code"], binding },
  durableObject: { className: "TodoStore" },
});

describe("workspace_service tool", () => {
  it("accepts provider package exports and requires the complete strict shape", () => {
    const tool = createWorkspaceServiceTool(new StubVcs({ files }), authority, {
      validateConfig: vi.fn(async () => {}),
    });
    expect(Value.Check(tool.parameters, {
      operation: "upsert", source: "workers/todo-store", singletonKey: "main",
      service: todoService("consent"),
    })).toBe(true);
    expect(Value.Check(tool.parameters, {
      operation: "upsert", source: "workers/todo-store", service: { name: "todo-store" },
    })).toBe(false);
    expect(Value.Check(tool.parameters, {
      operation: "remove", source: "workers/todo-store", name: "todo-store",
    })).toBe(true);
  });

  it.each(["consent", "declared", { declaredFor: ["panels/todos"] }] as const)(
    "atomically writes selection, provider export, and optional singleton for binding %j",
    async (binding) => {
      const vcs = new StubVcs({ files });
      const validateConfig = vi.fn(async (candidate: { manifest: string; serviceManifests: Record<string, string> }) => {
        expect(YAML.parse(candidate.manifest).services).toHaveLength(2);
        expect(JSON.parse(candidate.serviceManifests["workers/todo-store"]!).vibestudio.services).toHaveLength(2);
      });
      const tool = createWorkspaceServiceTool(vcs, authority, { validateConfig });
      const result = await executeTool(tool, {
        operation: "upsert", source: "workers/todo-store", singletonKey: "main",
        service: todoService(typeof binding === "object" ? { declaredFor: [...binding.declaredFor] } : binding),
      }, { callId: "invocation:service" });
      const config = YAML.parse(vcs.read("meta/vibestudio.yml")!);
      expect(config.services).toEqual([
        { source: "workers/testkit-driver", name: "testkit-driver" },
        { source: "workers/todo-store", name: "todo-store" },
      ]);
      const provider = JSON.parse(vcs.read("workers/todo-store/package.json")!);
      expect(provider.description).toBe("Provider unit metadata must survive service authoring.");
      expect(provider.vibestudio.icon).toBe("🗂️");
      expect(provider.vibestudio.services).toEqual([
        retainedExport,
        todoService(typeof binding === "object" ? { declaredFor: [...binding.declaredFor] } : binding),
      ]);
      expect(config.singletonObjects).toContainEqual({
        source: "workers/todo-store", className: "TodoStore", key: "main",
      });
      expect(vcs.lastEditInput?.changes).toHaveLength(2);
      expect(validateConfig).toHaveBeenCalledOnce();
      expect(result.details).toMatchObject({ changed: true, serviceName: "todo-store", docsId: "workspace:todo-store" });
    },
  );

  it("validates repeated upserts without authoring an unchanged semantic edit", async () => {
    const vcs = new StubVcs({ files });
    const edit = vi.spyOn(vcs, "edit");
    const validateConfig = vi.fn(async () => {});
    const tool = createWorkspaceServiceTool(vcs, authority, { validateConfig });
    const command = {
      operation: "upsert" as const,
      source: "workers/probe",
      service: {
        name: "probe-value", title: "Probe value", action: "read the probe value",
        description: "Report a small value.", notability: "everyday" as const,
        presentation: { domain: "automation" as const, verb: "see" as const },
        protocols: ["example.probe.v1"], authority: { principals: ["user", "code"] as ("user" | "code")[] },
        worker: { routePath: "/probe" },
      },
    };
    await executeTool(tool, command, { callId: "invocation:create" });
    const manifest = vcs.read("meta/vibestudio.yml");
    const provider = vcs.read("workers/probe/package.json");
    const head = await vcs.status({ contextId: authority.contextId });
    const repeated = await executeTool(tool, command, { callId: "invocation:repeat" });
    expect(repeated.details).toMatchObject({ changed: false, serviceName: "probe-value", docsId: "workspace:probe-value", diff: "" });
    expect(repeated.details).not.toHaveProperty("vcsResult");
    expect(validateConfig).toHaveBeenCalledTimes(2);
    expect(edit).toHaveBeenCalledOnce();
    expect(vcs.read("meta/vibestudio.yml")).toBe(manifest);
    expect(vcs.read("workers/probe/package.json")).toBe(provider);
    expect(await vcs.status({ contextId: authority.contextId })).toEqual(head);
  });

  it("does not create a working state when complete-candidate validation fails", async () => {
    const vcs = new StubVcs({ files });
    const tool = createWorkspaceServiceTool(vcs, authority, {
      validateConfig: vi.fn(async () => { throw new Error("candidate is invalid"); }),
    });
    await expect(executeTool(tool, {
      operation: "upsert", source: "workers/todo-store", singletonKey: "main",
      service: todoService("consent"),
    }, { callId: "invocation:invalid" })).rejects.toThrow("candidate is invalid");
    expect(vcs.read("meta/vibestudio.yml")).toBe(initial);
    expect(vcs.read("workers/todo-store/package.json")).toBe(todoPackage);
    expect(vcs.lastEditInput).toBeUndefined();
  });

  it("leaves both source documents untouched when the atomic VCS edit fails", async () => {
    const vcs = new StubVcs({ files });
    vi.spyOn(vcs, "edit").mockRejectedValue(new Error("atomic edit rejected"));
    const tool = createWorkspaceServiceTool(vcs, authority, { validateConfig: vi.fn(async () => {}) });
    await expect(executeTool(tool, {
      operation: "upsert", source: "workers/todo-store", singletonKey: "main",
      service: todoService("consent"),
    }, { callId: "invocation:edit-failure" })).rejects.toThrow("atomic edit rejected");
    expect(vcs.read("meta/vibestudio.yml")).toBe(initial);
    expect(vcs.read("workers/todo-store/package.json")).toBe(todoPackage);
  });
});
