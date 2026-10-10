import { z } from "zod";
import { createRpcMethods } from "@vibestudio/shared/rpcMethods";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";

const testRpcMethods = createRpcMethods("test", { "probe.read": { website: { kind: "closed", reason: "Test receiver" } as const, args: z.tuple([]), returns: z.string() }, read: { website: { kind: "closed", reason: "Test receiver" } as const, args: z.tuple([z.string()]), returns: z.string() } }, "");

// Envelope-native /rpc: the mock receives an RpcEnvelope and must reply with a
// response envelope echoing the requestId (else the connectionless client never
// settles). parseReq reconstructs the legacy recorded {type,targetId,method,args}
// shape; respond wraps a result into a response envelope.
function parseReq(init?: RequestInit) {
  const envelope = JSON.parse(String(init?.body ?? "{}")) as {
    from?: string;
    target?: string;
    message?: {
      type?: string;
      requestId?: string;
      method?: string;
      args?: unknown[];
      event?: string;
      payload?: unknown;
    };
  };
  const msg = envelope.message ?? {};
  return {
    type: msg.type === "event" ? "emit" : "call",
    targetId: envelope.target ?? "",
    method: msg.method ?? msg.event ?? "",
    args: msg.args ?? (msg.payload !== undefined ? [msg.payload] : []),
  } as { type: string; targetId: string; method: string; args: unknown[] };
}
function respond(init: RequestInit | undefined, result: unknown) {
  const envelope = JSON.parse(String(init?.body ?? "{}")) as {
    from?: string;
    target?: string;
    message?: { requestId?: string };
  };
  return new Response(
    JSON.stringify({
      from: envelope.target,
      target: envelope.from,
      delivery: { caller: { callerId: "main", callerKind: "server" } },
      provenance: [],
      message: {
        type: "response",
        requestId: envelope.message?.requestId,
        result,
      },
    }),
  );
}

function respondToWorkspacePresentation(
  init: RequestInit | undefined,
  request: ReturnType<typeof parseReq>,
): Response | null {
  if (
    request.method === "workers.resolveService" &&
    request.args[0] === "workspace.presentation"
  ) {
    return respond(init, durableObjectServiceFixture("main"));
  }
  if (request.method === "titlesForSlots") {
    return respond(
      init,
      Object.fromEntries(
        (request.args[0] as string[]).map((slotId) => [
          slotId,
          slotId === "panel:tree/slot-a" || slotId === "panel:tree/parent-slot"
            ? "Panel A"
            : slotId,
        ]),
      ),
    );
  }
  if (
    [
      "bindSlot",
      "indexPanel",
      "updatePanelTitle",
      "incrementAccess",
      "rebuildIndex",
      "removeSlots",
    ].includes(request.method)
  ) {
    return respond(init, undefined);
  }
  return null;
}

function workspaceDetailFor(panelId: string, source = "panels/a") {
  const entityKey = panelId.replace(/^panel:tree\//, "");
  const entityId = `panel:nav-${entityKey}-current-entity`;
  return {
    revision: 1,
    slot: {
      slot_id: panelId,
      parent_slot_id: null,
      current_entity_id: entityId,
      current_entity_title: "Panel A",
      current_entry_key: "entry-1",
      sort_key: 0,
      owner_user_id: null,
      created_at: 1,
      closed_at: null,
    },
    currentHistory: {
      slot_id: panelId,
      cursor: 0,
      entry_key: "entry-1",
      entity_id: entityId,
      source,
      context_id: "ctx",
      state_args: "{}",
      recorded_at: 1,
    },
    entity: {
      id: entityId,
      authoritySessionId: "authority-panel-fixture",
      kind: "panel",
      source: { repoPath: source, effectiveVersion: "ev-a" },
      contextId: "ctx",
      key: entityKey,
      createdAt: 1,
      status: "active",
      cleanupComplete: false,
      activeBuildKey: "build-a",
    },
  };
}

function runtimeEntityFixture(spec: unknown) {
  const input = spec as {
    kind?: "panel" | "app" | "worker" | "do" | "session";
    execution?: { source?: string };
    source?: string;
    contextId?: string;
    key?: string;
  };
  const source = input.execution?.source ?? input.source ?? "panels/new";
  const id = `panel:nav-${input.key ?? "created"}`;
  return {
    id,
    kind: input.kind ?? "panel",
    source: { repoPath: source, effectiveVersion: "ev-created" },
    buildKey: "b".repeat(64),
    contextId: input.contextId ?? "ctx-created",
    targetId: id,
    created: true,
  };
}

function readyRuntimeSlot(panelId: string) {
  const entityKey = panelId.replace(/^panel:tree\//, "");
  const runtimeEntityId = `panel:nav-${entityKey}-current-entity`;
  return {
    version: { epoch: "test", counter: 1 },
    attempt: {
      epoch: "test",
      attemptId: `attempt:${runtimeEntityId}`,
      slotId: panelId,
      runtimeEntityId,
      phase: "ready" as const,
      revision: 1,
      reporter: "renderer" as const,
      updatedAt: 1,
    },
    route: {
      reachable: true,
      connectionId: `route:${panelId}`,
      holderLabel: "Headless",
      platform: "headless",
      supportsCdp: true,
      view: { url: "http://panel.test/", loading: false },
    },
  };
}

function assignedRuntimeSlot(panelId: string, runtimeEntityId: string) {
  return {
    status: "assigned",
    lease: null,
    attempt: {
      epoch: "test",
      attemptId: `attempt:${runtimeEntityId}`,
      slotId: panelId,
      runtimeEntityId,
      phase: "ready" as const,
      revision: 1,
      reporter: "renderer" as const,
      updatedAt: 1,
    },
  };
}

describe("worker panelTree handles", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("exports panel-shared pure runtime helpers from the worker entrypoint", async () => {
    const runtimeModule = await import("./index.js");

    expect(runtimeModule.Rpc).toBeDefined();
    expect(runtimeModule.z.object).toBeTypeOf("function");
    expect(runtimeModule.defineContract).toBeTypeOf("function");
    expect(runtimeModule.buildPanelLink("panels/editor")).toBe(
      "vibestudio://panel?v=1&source=panels%2Feditor",
    );
    expect(runtimeModule.parseContextId("ctx_project")).toEqual({
      instanceId: "project",
    });
    expect(runtimeModule.isValidContextId("ctx_project")).toBe(true);
    expect(runtimeModule.getInstanceId("ctx_project")).toBe("project");
    expect(runtimeModule.normalizePath("path\\to/mixed\\slashes")).toBe(
      "path/to/mixed/slashes",
    );
    expect(runtimeModule.getFileName("path/to/file.txt")).toBe("file.txt");
    expect(runtimeModule.resolvePath("/root", "child")).toBe("/root/child");
  });

  it("uses the exact source-qualified sealed worker identity for outbound RPC", async () => {
    let runtimeHeader: string | null = null;
    let envelopeFrom: string | undefined;
    globalThis.fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        runtimeHeader = new Headers(init?.headers).get(
          "x-vibestudio-runtime-id",
        );
        envelopeFrom = JSON.parse(String(init?.body ?? "{}"))?.from;
        const response = respond(init, "ok");
        const reply = await response.json();
        return new Response(
          JSON.stringify({ ...reply, destination: { kind: "workspace", workspaceId: "workspace:test" } }),
        );
      },
    ) as typeof fetch;

    const { createWorkerRuntime } = await import("./index.js");
    const runtime = createWorkerRuntime({
      WORKER_ID: "probe",
      WORKER_SOURCE: "workers/identity-probe",
      RPC_AUTH_TOKEN: "token",
      WORKSPACE_ID: "workspace:test",
      CONTEXT_ID: "ctx",
      GATEWAY_URL: "http://server.test",
    });
    await runtime.rpc.call("main", testRpcMethods["probe.read"], []);
    runtime.destroy();

    expect(runtimeHeader).toBe("worker:workers/identity-probe:probe");
    expect(envelopeFrom).toBe("worker:workers/identity-probe:probe");
  });

  it("binds root service factories and callable members to the initialized worker runtime", async () => {
    const calls: ReturnType<typeof parseReq>[] = [];
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = parseReq(init);
      calls.push(request);
      return respond(init, request.method === "workers.resolveService"
        ? durableObjectServiceFixture("do:workers/probe:Probe:chosen")
        : "value");
    }) as typeof fetch;
    const entry = await import("./index.js");
    expect(() => entry.createDurableObjectServiceClient("probe.v1", testRpcMethods)).toThrow("not been initialized");
    const runtime = entry.createWorkerRuntime({
      WORKER_ID: "probe", WORKER_SOURCE: "workers/probe",
      RPC_AUTH_TOKEN: "token",
      WORKSPACE_ID: "workspace:test", CONTEXT_ID: "ctx", GATEWAY_URL: "http://server.test",
    });
    try {
      const client = entry.createDurableObjectServiceClient("probe.v1", testRpcMethods, "chosen");
      expect(await client.call("read", "argument")).toBe("value");
      const digest = "a".repeat(64);
      expect(await entry.callMain("blobstore.getText", digest)).toBe("value");
      expect(calls).toEqual([
        { type: "call", targetId: "main", method: "workers.resolveService", args: ["probe.v1", "chosen"] },
        { type: "call", targetId: "do:workers/probe:Probe:chosen", method: "read", args: ["argument"] },
        { type: "call", targetId: "main", method: "blobstore.getText", args: [digest] },
      ]);
    } finally {
      runtime.destroy();
    }
    expect(() => entry.createDurableObjectServiceClient("probe.v1", testRpcMethods)).toThrow("not been initialized");
  });

  it("routes bare handle RPC events through the refreshed runtime entity id", async () => {
    const calls: Array<{
      type?: string;
      targetId: string;
      method: string;
      args: unknown[];
    }> = [];
    globalThis.fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = parseReq(init);
        calls.push({
          type: body.type,
          targetId: body.targetId,
          method: body.method,
          args: body.args,
        });
        const presentationResponse = respondToWorkspacePresentation(init, body);
        if (presentationResponse) return presentationResponse;
        if (body.method === "workers.resolveService") {
          return respond(init, durableObjectServiceFixture("main"));
        }
        if (body.method === "workspace-state.panelTree.detail") {
          return respond(init, workspaceDetailFor("panel:tree/slot-a"));
        }
        if (body.method === "panelRuntime.ensureSlot")
          return respond(
            init,
            assignedRuntimeSlot(String(body.args[0]), workspaceDetailFor(String(body.args[0])).entity.id),
          );
        if (body.method === "panelRuntime.observeSlot")
          return respond(init, readyRuntimeSlot(String(body.args[0])));
        if (body.method === "workspace-state.slot.create")
          return respond(init, undefined);
        return respond(init, "ok");
      },
    ) as typeof fetch;

    const { createWorkerRuntime } = await import("./index.js");
    const runtime = createWorkerRuntime({
      WORKER_ID: "agent",
      WORKER_SOURCE: "workers/agent",
      RPC_AUTH_TOKEN: "token",
      WORKSPACE_ID: "workspace:test",
      CONTEXT_ID: "ctx",
      GATEWAY_URL: "http://server.test",
    });

    const handle = runtime.panelTree.get("panel:tree/slot-a");
    await handle.call["ping"]?.();
    expect(handle.title).toBe("Panel A");
    expect(handle.source).toBe("panels/a");
    expect(handle.kind).toBe("workspace");
    expect(handle.parentId).toBeNull();
    await handle.emit("ready", { ok: true });
    runtime.destroy();

    expect(calls).toContainEqual({
      type: "call",
      targetId: "main",
      method: "panelRuntime.ensureSlot",
      args: ["panel:tree/slot-a"],
    });
    expect(calls).toContainEqual({
      type: "call",
      targetId: "panel:nav-slot-a-current-entity",
      method: "ping",
      args: [],
    });
    expect(calls).toContainEqual({
      type: "emit",
      targetId: "panel:nav-slot-a-current-entity",
      method: "ready",
      args: [{ ok: true }],
    });
  });

  it("reads canonical boot readiness from observe", async () => {
    const calls: Array<{ targetId: string; method: string; args: unknown[] }> =
      [];
    globalThis.fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = parseReq(init);
        delete (body as Record<string, unknown>)["requestId"];
        delete (body as Record<string, unknown>)["idempotencyKey"];
        calls.push(body);
        const presentationResponse = respondToWorkspacePresentation(init, body);
        if (presentationResponse) return presentationResponse;
        if (body.method === "workers.resolveService")
          return respond(init, durableObjectServiceFixture("main"));
        if (body.method === "workspace-state.panelTree.detail")
          return respond(init, workspaceDetailFor("panel:tree/slot-a"));
        if (body.method === "panelRuntime.observeSlot")
          return respond(init, readyRuntimeSlot(String(body.args[0])));
        return respond(init, null);
      },
    ) as typeof fetch;

    const { createWorkerRuntime } = await import("./index.js");
    const runtime = createWorkerRuntime({
      WORKER_ID: "agent",
      WORKER_SOURCE: "workers/agent",
      RPC_AUTH_TOKEN: "token",
      WORKSPACE_ID: "workspace:test",
      CONTEXT_ID: "ctx",
      GATEWAY_URL: "http://server.test",
    });

    await expect(
      runtime.panelTree.get("panel:tree/slot-a").observe(),
    ).resolves.toMatchObject({
      phase: "ready",
    });
    runtime.destroy();

    expect(calls.map(({ method }) => method)).toEqual([
      "workspace-state.panelTree.detail",
      "panelRuntime.observeSlot",
    ]);
  });

  it("binds arbitrary handles to the runtime entity reported by observe", async () => {
    const calls: Array<{
      type?: string;
      targetId: string;
      method: string;
      args: unknown[];
    }> = [];
    globalThis.fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = parseReq(init);
        calls.push({
          type: body.type,
          targetId: body.targetId,
          method: body.method,
          args: body.args,
        });
        if (body.method === "workers.resolveService")
          return respond(init, durableObjectServiceFixture("main"));
        if (body.method === "workspace-state.panelTree.detail")
          return respond(init, workspaceDetailFor("panel:tree/slot-a"));
        if (body.method === "panelRuntime.observeSlot")
          return respond(init, readyRuntimeSlot(String(body.args[0])));
        if (body.method === "panelRuntime.ensureSlot")
          return respond(
            init,
            assignedRuntimeSlot(String(body.args[0]), workspaceDetailFor(String(body.args[0])).entity.id),
          );
        return respond(init, { loaded: true });
      },
    ) as typeof fetch;

    const { createWorkerRuntime } = await import("./index.js");
    const runtime = createWorkerRuntime({
      WORKER_ID: "agent",
      WORKER_SOURCE: "workers/agent",
      RPC_AUTH_TOKEN: "token",
      WORKSPACE_ID: "workspace:test",
      CONTEXT_ID: "ctx",
      GATEWAY_URL: "http://server.test",
    });

    const handle = runtime.panelTree.get("panel:tree/slot-a");
    await handle.observe();
    await handle.call["ping"]?.();
    runtime.destroy();

    expect(calls.at(-1)).toEqual({
      type: "call",
      targetId: "panel:nav-slot-a-current-entity",
      method: "ping",
      args: [],
    });
  });

  it("lists, hydrates children, and opens panels through the server panelTree service", async () => {
    const calls: Array<{ targetId: string; method: string; args: unknown[] }> =
      [];
    globalThis.fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = parseReq(init);
        delete (body as Record<string, unknown>)["requestId"];
        delete (body as Record<string, unknown>)["idempotencyKey"];
        calls.push(body);
        const presentationResponse = respondToWorkspacePresentation(init, body);
        if (presentationResponse) return presentationResponse;
        if (body.method === "workers.resolveService") {
          return respond(init, durableObjectServiceFixture("main"));
        }
        if (body.method === "workspace-state.panelTree.rootGroups") {
          return respond(init, {
            revision: 1,
            groups: [{ ownerUserId: null, rootCount: 1 }],
            nextCursor: null,
          });
        }
        if (body.method === "workspace-state.panelTree.page") {
          const group = (
            body.args[0] as { group: { kind: string; parentSlotId?: string } }
          ).group;
          const nodes =
            group.kind === "roots"
              ? [
                  {
                    slotId: "panel:tree/root-slot",
                    title: "Root",
                    source: "panels/root",
                    parentSlotId: null,
                    ownerUserId: null,
                    contextId: "ctx-root",
                    runtimeEntityId: "panel:root-entity",
                    createdAt: 1,
                    childCount: 1,
                  },
                ]
              : group.parentSlotId === "panel:tree/root-slot"
                ? [
                    {
                      slotId: "panel:tree/child-slot",
                      title: "Child",
                      source: "panels/child",
                      parentSlotId: "panel:tree/root-slot",
                      ownerUserId: null,
                      contextId: "ctx-child",
                      runtimeEntityId: "panel:child-entity",
                      createdAt: 1,
                      childCount: 0,
                    },
                  ]
                : [];
          return respond(init, { revision: 1, group, nodes, nextCursor: null });
        }
        if (
          body.method === "runtime.reserveEntity" ||
          body.method === "runtime.activateReservedEntity"
        ) {
          return respond(init, runtimeEntityFixture(body.args[0]));
        }
        if (body.method === "build.getPanelMetadata")
          return respond(init, { source: "panels/new", title: "Created", hiddenInLauncher: false });
        if (body.method === "workspace-state.panelTree.detail") {
          const panelId = String(body.args[0]);
          const detail = workspaceDetailFor(panelId, "panels/new");
          return respond(init, {
            ...detail,
            slot: {
              ...detail.slot,
              parent_slot_id: panelId.startsWith("panel:tree/parent-slot/")
                ? "panel:tree/parent-slot"
                : null,
            },
          });
        }
        if (body.method === "panelRuntime.ensureSlot")
          return respond(
            init,
            assignedRuntimeSlot(String(body.args[0]), workspaceDetailFor(String(body.args[0])).entity.id),
          );
        if (body.method === "panelRuntime.observeSlot")
          return respond(init, readyRuntimeSlot(String(body.args[0])));
        if (body.method === "workspace-state.slot.create")
          return respond(init, undefined);
        return respond(init, "ok");
      },
    ) as typeof fetch;

    const { createWorkerRuntime } = await import("./index.js");
    const runtime = createWorkerRuntime({
      WORKER_ID: "agent",
      WORKER_SOURCE: "workers/agent",
      RPC_AUTH_TOKEN: "token",
      WORKSPACE_ID: "workspace:test",
      CONTEXT_ID: "ctx",
      GATEWAY_URL: "http://server.test",
      PARENT_ID: "panel:tree/parent-slot",
      PARENT_KIND: "panel",
    });

    const roots = await runtime.panelTree.page({
      group: { kind: "roots", ownerUserId: null },
      limit: 50,
    });
    const children = await runtime.panelTree.page({
      group: { kind: "children", parentSlotId: "panel:tree/root-slot" },
      limit: 50,
    });
    const created = await runtime.openPanel("panels/new");
    runtime.destroy();

    expect(roots.entries.map(({ handle }) => handle.id)).toEqual(["panel:tree/root-slot"]);
    expect(children.entries.map(({ handle }) => handle.id)).toEqual([
      "panel:tree/child-slot",
    ]);
    expect(children.entries[0]?.handle.parent()?.id).toBe("panel:tree/root-slot");
    expect(created.id).toMatch(/^panel:tree\/parent-slot\/panels~new\//);
    expect(created.parentId).toBe("panel:tree/parent-slot");
    expect(calls.map(({ method }) => method)).toContain(
      "runtime.reserveEntity",
    );
    expect(calls.map(({ method }) => method)).toContain(
      "workspace-state.slot.create",
    );
    expect(calls.map(({ method }) => method)).not.toContain("panelTree.create");
  });

  it("exposes openPanel/getPanelHandle on the worker runtime", async () => {
    const calls: Array<{ targetId: string; method: string; args: unknown[] }> =
      [];
    globalThis.fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = parseReq(init);
        delete (body as Record<string, unknown>)["requestId"];
        delete (body as Record<string, unknown>)["idempotencyKey"];
        calls.push(body);
        const presentationResponse = respondToWorkspacePresentation(init, body);
        if (presentationResponse) return presentationResponse;
        if (body.method === "workers.resolveService") {
          return respond(init, durableObjectServiceFixture("main"));
        }
        if (body.method === "workspace-state.panelTree.rootGroups") {
          return respond(init, { revision: 1, groups: [], nextCursor: null });
        }
        if (
          body.method === "runtime.reserveEntity" ||
          body.method === "runtime.activateReservedEntity"
        ) {
          return respond(init, runtimeEntityFixture(body.args[0]));
        }
        if (body.method === "build.getPanelMetadata")
          return respond(init, { source: "panels/new", title: "Created", hiddenInLauncher: false });
        if (body.method === "workspace-state.panelTree.detail") {
          const panelId = String(body.args[0]);
          return respond(
            init,
            workspaceDetailFor(
              panelId,
              panelId === "panel:tree/browser-slot"
                ? "browser:https://example.com"
                : "panels/direct",
            ),
          );
        }
        if (body.method === "panelRuntime.ensureSlot")
          return respond(
            init,
            assignedRuntimeSlot(String(body.args[0]), workspaceDetailFor(String(body.args[0])).entity.id),
          );
        if (body.method === "panelRuntime.observeSlot")
          return respond(init, readyRuntimeSlot(String(body.args[0])));
        return respond(init, null);
      },
    ) as typeof fetch;

    const { createWorkerRuntime } = await import("./index.js");
    const runtime = createWorkerRuntime({
      WORKER_ID: "agent",
      WORKER_SOURCE: "workers/agent",
      RPC_AUTH_TOKEN: "token",
      WORKSPACE_ID: "workspace:test",
      CONTEXT_ID: "ctx",
      GATEWAY_URL: "http://server.test",
      PARENT_ID: "panel:tree/parent-slot",
      PARENT_KIND: "panel",
    });

    const direct = await runtime.openPanel("panels/direct", {
      focus: true,
      placement: { disposition: "side", preferredWidth: 640 },
    });
    const browser = runtime.getPanelHandle(
      "panel:tree/browser-slot",
      "browser",
    );
    await browser.focus({ placement: { disposition: "split-below" } });
    runtime.destroy();

    expect(direct.id).toMatch(/^panel:tree\/parent-slot\/panels~direct\//);
    expect(browser.kind).toBe("browser");
    expect(browser.source).toBe("https://example.com");
    expect(calls.map(({ method }) => method)).not.toContain("panelTree.create");
    // Worker runtimes do not own a native presentation host, so focusing a
    // handle only waits for readiness. The desktop shell supplies
    // `focusPanel` when one exists; this worker client must not fabricate a
    // `view.focusPanel` call.
    expect(calls.map(({ method }) => method)).not.toContain("view.focusPanel");
  });

  it("builds panel parent handles with entity-scoped RPC and slot-scoped CDP", async () => {
    const calls: Array<{ targetId: string; method: string; args: unknown[] }> =
      [];
    globalThis.fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = parseReq(init);
        delete (body as Record<string, unknown>)["requestId"];
        delete (body as Record<string, unknown>)["idempotencyKey"];
        calls.push(body);
        const presentationResponse = respondToWorkspacePresentation(init, body);
        if (presentationResponse) return presentationResponse;
        if (body.method === "panelCdp.getCdpEndpoint") {
          return respond(init, { wsEndpoint: "ws://cdp.test" });
        }
        if (body.method === "workers.resolveService")
          return respond(init, durableObjectServiceFixture("main"));
        if (body.method === "workspace-state.panelTree.detail")
          return respond(
            init,
            workspaceDetailFor("panel:tree/parent-slot", "panels/parent"),
          );
        if (body.method === "panelRuntime.observeSlot")
          return respond(init, readyRuntimeSlot(String(body.args[0])));
        if (body.method === "build.getPanelMetadata")
          return respond(init, { source: "panels/parent", title: "Parent", hiddenInLauncher: false });
        if (body.method === "runtime.createEntity") {
          const spec = body.args[0] as { key: string };
          return respond(init, {
            id: `panel:nav-${spec.key}`,
            kind: "panel",
            targetId: `panel:nav-${spec.key}`,
            contextId: "ctx",
            source: { repoPath: "panels/parent", effectiveVersion: "ev-a" },
            buildKey: "b".repeat(64),
          });
        }
        if (body.method === "workspace-state.slot.commitPreparedNavigation") {
          const input = body.args[0] as {
            expectedCurrentEntityId: string;
            mutation: { entry: { entryKey: string } };
          };
          return respond(init, {
            previousEntityId: input.expectedCurrentEntityId,
            currentEntityId: `panel:nav-${input.mutation.entry.entryKey}`,
            currentEntryKey: input.mutation.entry.entryKey,
            cursor: 1,
          });
        }
        if (body.method === "workspace-state.panel.updateTitle")
          return respond(init, null);
        if (body.method === "workspace-state.slot.create")
          return respond(init, undefined);
        if (body.method === "panelRuntime.ensureSlot")
          return respond(
            init,
            assignedRuntimeSlot(String(body.args[0]), workspaceDetailFor(String(body.args[0])).entity.id),
          );
        return respond(init, undefined);
      },
    ) as typeof fetch;

    const { createWorkerRuntime } = await import("./index.js");
    const runtime = createWorkerRuntime({
      WORKER_ID: "agent",
      WORKER_SOURCE: "workers/agent",
      RPC_AUTH_TOKEN: "token",
      WORKSPACE_ID: "workspace:test",
      CONTEXT_ID: "ctx",
      GATEWAY_URL: "http://server.test",
      PARENT_ID: "panel:tree/parent-slot",
      PARENT_ENTITY_ID: "panel:nav-parent-entity",
      PARENT_KIND: "panel",
    });

    const parent = runtime.getParent();
    expect(parent?.id).toBe("panel:tree/parent-slot");
    expect(runtime.getParentWithContract({ source: "panels/child" })?.id).toBe(
      "panel:tree/parent-slot",
    );
    expect(parent).toMatchObject({
      id: "panel:tree/parent-slot",
      parentId: null,
    });
    await parent?.call["ping"]?.();
    await expect(parent?.cdp.getCdpEndpoint()).resolves.toEqual({
      wsEndpoint: "ws://cdp.test",
    });
    await parent?.reload();
    await parent?.rebuild();
    runtime.destroy();

    expect(calls).toContainEqual({
      type: "call",
      targetId: "panel:nav-parent-slot-current-entity",
      method: "ping",
      args: [],
    });
    expect(calls).toContainEqual({
      type: "call",
      targetId: "main",
      method: "panelCdp.getCdpEndpoint",
      args: ["panel:tree/parent-slot"],
    });
    const replacements = calls.filter(
      ({ method }) =>
        method === "workspace-state.slot.commitPreparedNavigation",
    );
    // Reload restarts the current entity; rebuild replaces the navigation.
    expect(calls.filter(({ method }) => method === "runtime.supervision.restart")).toEqual([
      { type: "call", targetId: "main", method: "runtime.supervision.restart",
        args: [{ kind: "panel", entityId: "panel:nav-parent-slot-current-entity" }] },
    ]);
    expect(replacements).toHaveLength(1);
    for (const call of replacements) {
      expect(call.args[0]).toMatchObject({
        slotId: "panel:tree/parent-slot",
        mutation: { kind: "replace" },
      });
    }
    expect(calls.map(({ method }) => method)).toContain(
      "workspace-state.slot.commitPreparedNavigation",
    );
    expect(calls.map(({ method }) => method)).not.toContain("panelTree.reload");
    expect(calls.map(({ method }) => method)).not.toContain(
      "panelTree.rebuildPanel",
    );
  });
});
