import { executeTool } from "../testing/native-tool.js";
import { describe, expect, it, vi } from "vitest";
import type { RpcWireCaller } from "@vibestudio/rpc/internal";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { parseUnitAuthorityManifest } from "@vibestudio/shared/authorityManifest";
import { portableExports } from "@vibestudio/service-schemas/runtime/runtimeSurface.portable";
import {
  createDocsSearchTool,
  renderEntry,
  type CatalogEntry,
} from "./docs.js";

describe("docs_search", () => {
  it("caps oversized result requests instead of turning discovery into a tool error", async () => {
    const calls: Array<{ method: string; args: unknown[]; options?: unknown }> = [];
    const wireCall = vi.fn<RpcWireCaller["call"]>(
      async (_target: string, method: string, args: unknown[], options?: unknown) => {
        calls.push({ method, args, ...(options === undefined ? {} : { options }) });
        return [];
      },
    );
    const tool = createDocsSearchTool(schemaRpcMock({ call: wireCall }));

    await executeTool(
      tool,
      { query: "runtime", limit: 200 },
      { callId: "call-1" },
    );

    expect(calls).toEqual([
      {
        method: "docs.search",
        args: ["runtime", { surface: undefined, limit: 100 }],
        options: { signal: undefined },
      },
    ]);
  });

  it("forwards cancellation to catalog discovery", async () => {
    const observed: Array<AbortSignal | undefined> = [];
    const wireCall = vi.fn<RpcWireCaller["call"]>(
      async (
        _target: string,
        _method: string,
        _args: unknown[],
        options?: { signal?: AbortSignal },
      ) => {
        observed.push(options?.signal);
        return [];
      },
    );
    const tool = createDocsSearchTool(schemaRpcMock({ call: wireCall }));
    const controller = new AbortController();

    await executeTool(
      tool,
      { query: "runtime" },
      { callId: "call-signal", signal: controller.signal },
    );

    expect(observed).toEqual([controller.signal]);
  });
});

describe("renderEntry (readable docs_open text)", () => {
  it("renders canonical Git positional overloads as separate callable signatures", () => {
    const method = portableExports["git"]!.methodCatalog!["upstreamStatus"]!;
    const text = renderEntry({
      id: "runtime:workerRuntime.git.upstreamStatus",
      surface: "runtime",
      qualifiedName: "git.upstreamStatus",
      title: "Git",
      ...method,
    });
    expect(text).toContain("git.upstreamStatus() →");
    expect(text).toContain("git.upstreamStatus(string[]) →");
    expect(text).toContain("git.upstreamStatus(string[], {");
    expect(text).toContain("One or more workspace-relative repos");
    expect(text).not.toContain("git.upstreamStatus([] | ");
  });
  it("reports a declared capability and directs argument-dependent resource discovery to preflight", () => {
    const text = renderEntry({
      id: "service:permissions.list",
      surface: "service",
      qualifiedName: "permissions.list",
      title: "Permissions",
      access: { capability: "permissions.read", sensitivity: "read" },
      argsSchema: { type: "array", items: [] },
    });
    expect(text).toContain("Declared capability: permissions.read");
    expect(text).toContain('service: "permissions", method: "list"');
    expect(text).toContain("resource keys can depend on arguments");
    expect(text).not.toContain("Declared capability: service:permissions.list");
  });
  it("renders a readable signature instead of a raw JSON-schema dump", () => {
    const entry: CatalogEntry = {
      id: "service:blobstore.getText",
      surface: "service",
      qualifiedName: "blobstore.getText",
      title: "blobstore.getText",
      description: "Full UTF-8 text of a blob, or null if absent.",
      access: { sensitivity: "read", callers: ["panel", "do"] },
      argsSchema: {
        type: "array",
        minItems: 1,
        maxItems: 1,
        items: [{ type: "string", pattern: "^[0-9a-f]{64}$" }],
      },
      returnsSchema: { type: "string", nullable: true },
      examples: [{ args: ["e3b0c4"] }],
    };
    const text = renderEntry(entry);

    expect(text).toContain(
      "blobstore.getText(string /^[0-9a-f]{64}$/) → string | null",
    );
    expect(text).toContain("Full UTF-8 text of a blob");
    expect(text).toContain("Sensitivity: read");
    expect(text).toContain('blobstore.getText("e3b0c4")'); // readable example call
    // the raw JSON-schema dump is gone
    expect(text).not.toContain("Args schema:");
    expect(text).not.toContain('"type": "array"');
  });

  it("renders nested numeric validation bounds from the reviewed workspace contract", () => {
    const text = renderEntry({
      id: "workspace:missions.overview", surface: "workspace",
      qualifiedName: "missions.overview", title: "missions.overview",
      argumentNames: ["options"], argsSchema: { type: "array", minItems: 1,
        items: [{ type: "object", properties: {
          limit: { type: "integer", minimum: 1, maximum: 50 },
          fraction: { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 1 },
          step: { type: "number", minimum: 0, exclusiveMinimum: true, multipleOf: 2 },
        } }],
      },
    });
    expect(text).toContain("limit?: integer (>= 1, <= 50)");
    expect(text).toContain("fraction?: number (> 0, < 1)");
    expect(text).toContain("step?: number (> 0, multiple of 2)");
  });

  it("names parameters in the signature, breakdown, and rpc example when the catalog carries argumentNames", () => {
    const entry: CatalogEntry = {
      id: "service:docs.search",
      surface: "service",
      qualifiedName: "docs.search",
      title: "docs.search",
      argumentNames: ["query", "options"],
      argsSchema: {
        type: "array",
        minItems: 1,
        maxItems: 2,
        items: [
          { type: "string", description: "Keyword query." },
          { type: "object", properties: { limit: { type: "integer" } } },
        ],
      },
    };

    const text = renderEntry(entry);

    expect(text).toContain(
      "docs.search(query: string, options?: { limit?: integer })",
    );
    expect(text).toContain("query: string — Keyword query.");
    expect(text).toContain(
      'await rpc.call("main", mainRpcMethods["docs.search"], ["query", { ... }])',
    );
    expect(text).not.toContain("arg0");
  });

  it("renders object args with field types, optional markers, and field docs", () => {
    const entry: CatalogEntry = {
      id: "service:feeds.add",
      surface: "service",
      qualifiedName: "feeds.add",
      title: "feeds.add",
      argsSchema: {
        type: "array",
        items: [
          {
            type: "object",
            properties: {
              feedId: { type: "string", description: "the feed id" },
              limit: { type: "integer" },
            },
            required: ["feedId"],
          },
        ],
      },
    };
    const text = renderEntry(entry);
    expect(text).toContain("feeds.add({ feedId: string; limit?: integer })");
    expect(text).toContain(".feedId: string — the feed id");
  });

  it("shows the descriptor-based rpc.call form for service methods", () => {
    const entry: CatalogEntry = {
      id: "service:workers.listSources",
      surface: "service",
      qualifiedName: "workers.listSources",
      title: "workers.listSources",
      argsSchema: {
        type: "array",
        minItems: 0,
        maxItems: 0,
        items: [],
      },
    };
    const text = renderEntry(entry);

    expect(text).toContain('import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc"');
    expect(text).toContain('await rpc.call("main", mainRpcMethods["workers.listSources"], [])');
    expect(text).not.toContain('rpc.call("main", "workers.listSources"');
    expect(text).toContain("services.<name>");
    expect(text).toContain("not necessarily an importable named export");
    expect(text).toContain("even when a runtime binding shares the name");
    expect(text).toContain(
      "authority, and session-admission checks still apply",
    );
    expect(text).not.toContain("always reachable");
  });

  it("warns eval callers when a service method requires durable code identity", () => {
    const entry: CatalogEntry = {
      id: "service:development.start",
      surface: "service",
      qualifiedName: "development.start",
      title: "development.start",
      access: {
        sensitivity: "write",
        principals: ["code"],
        sessionAdmission: "codeOnly",
      },
      argsSchema: {
        type: "array",
        items: [{ type: "object" }, { type: "object" }],
      },
    };

    const text = renderEntry(entry);
    expect(text).toContain("Caller identity: durable code only");
    expect(text).toContain("cannot be called from eval/session code");
    expect(text).toContain("cannot manufacture a durable identity");
  });

  it("shows the public runtime import form for projected namespace methods", () => {
    const entry: CatalogEntry = {
      id: "runtime:workerRuntime.webhooks.createSubscription",
      surface: "runtime",
      qualifiedName: "webhooks.createSubscription",
      title: "webhooks.createSubscription",
      argsSchema: {
        type: "array",
        items: [{ type: "object", properties: { target: { type: "object" } } }],
      },
    };

    const text = renderEntry(entry);
    expect(text).toContain('import { webhooks } from "@workspace/runtime"');
    expect(text).toContain("await webhooks.createSubscription(...)");
    expect(text).not.toContain("rpc.call");
  });

  it("puts live protocol resolution and installed authority on workspace service roots", () => {
    const entry: CatalogEntry = {
      id: "workspace:notes",
      surface: "workspace",
      qualifiedName: "notes",
      title: "Notes",
      members: ["get"],
      access: {
        protocols: ["example.notes.v1"],
        capability: "workspace-service:notes",
        source: "workers/notes",
        target: {
          kind: "durable-object",
          className: "NotesDO",
          defaultObjectKey: "notes",
        },
      },
    };

    const text = renderEntry(entry);
    expect(text).toContain("Protocol: example.notes.v1");
    expect(text).toContain('"workspace-service:notes"');
    expect(text).toContain('tier "gated"');
    expect(text).toContain('RPC tier "open" is a separate receiver policy');
    expect(text).toContain('workers.resolveService("example.notes.v1")');
    expect(text).toContain('import { workers, rpc } from "@workspace/runtime"');
    expect(text).toContain(
      'runtime.workers.resolveService("example.notes.v1")',
    );
    expect(text.match(/service\.kind !== "durable-object"/gu)).toHaveLength(3);
    expect(text).toContain("Resolve and call it directly through the runtime");
  });

  it("distinguishes declared service wiring from eval authority", () => {
    const entry: CatalogEntry = {
      id: "workspace:gad.workspace",
      surface: "workspace",
      qualifiedName: "gad.workspace",
      title: "Workspace source",
      members: ["vcsStatus"],
      access: {
        protocols: ["vibestudio.gad.workspace.v1"],
        binding: "declared",
        declarationCapability: "workspace-service:gad.workspace",
        source: "workers/workspace-source",
        target: {
          kind: "durable-object",
          className: "GadWorkspaceDO",
          defaultObjectKey: "workspace",
        },
      },
    };

    const text = renderEntry(entry);
    const snippet = text.match(/```json\n([\s\S]+?)\n```/)?.[1];
    expect(snippet).toBeDefined();
    const authority = JSON.parse(snippet!).vibestudio.authority;
    expect(parseUnitAuthorityManifest(authority)).toMatchObject({
      requests: [
        {
          capability: "workspace-service:gad.workspace",
          resource: { kind: "prefix", prefix: "" },
          tier: "gated",
          evidence: "bounded-dynamic",
        },
      ],
      serviceRequests: [
        { protocol: "vibestudio.gad.workspace.v1", availability: "required" },
      ],
    });
    expect(text).toContain(
      "Import the receiver's method descriptor from its contract module",
    );
    expect(text).toContain("Installed panel code uses its own code identity");
    expect(text).toContain("Installed-unit declaration");
    expect(text).toContain('"workspace-service:gad.workspace"');
    expect(text).toContain("not a runtime permission");
    expect(text).toContain("must not be added to eval authority requests");
    expect(text).not.toContain("Installed-unit authority");
  });

  it("requires an explicit object key when workspace docs describe a DO factory", () => {
    const entry: CatalogEntry = {
      id: "workspace:channel.publish",
      surface: "workspace",
      qualifiedName: "channel.publish",
      parent: "workspace:channel",
      title: "channel.publish",
      signature: "publish(): Promise<void>",
      access: {
        protocols: ["vibestudio.channel.v1"],
        target: {
          kind: "durable-object",
          className: "PubSubChannel",
          defaultObjectKey: null,
        },
      },
    };

    const text = renderEntry(entry);

    expect(text).toContain("const objectKey = /* exact provider object key");
    expect(text).toContain(
      'workers.resolveService("vibestudio.channel.v1", objectKey)',
    );
    expect(text).not.toContain(
      'workers.resolveService("vibestudio.channel.v1");',
    );
  });

  it.each([false, true])(
    "keeps named-consumer binding identity explicit on service and method docs (%s)",
    (method) => {
      const text = renderEntry({
        id: method ? "workspace:notes.get" : "workspace:notes",
        surface: "workspace",
        qualifiedName: method ? "notes.get" : "notes",
        title: "Notes",
        ...(method
          ? { parent: "workspace:notes", signature: "get(): string[]" }
          : { members: ["get"] }),
        access: {
          protocols: ["example.notes.v1"],
          declarationCapability: "workspace-service:notes",
          binding: "declared-for",
          declaredFor: ["panels/notes"],
          source: "workers/notes",
          target: {
            kind: "durable-object",
            className: "NotesDO",
            defaultObjectKey: "notes",
          },
        },
      });
      expect(text).toContain('Binding: declared-for ["panels/notes"]');
      expect(text).toContain("does not adopt a consumer's identity");
      expect(text).toContain("Verify the minimal call from a named consumer");
      expect(text).toContain("Other callers still require consent");
      expect(text).not.toContain("Eval-side service resolution");
      expect(text).not.toContain("Installed-unit authority:");
      expect(text).toContain(
        'runtime.workers.resolveService("example.notes.v1")',
      );
      if (method)
        expect(text).toContain("rpc.call(service.targetId, methodDescriptor");
    },
  );
});
