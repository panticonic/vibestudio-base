import { beforeEach, describe, expect, it, vi } from "vitest";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";

function readyObservation(panelId: string, source = "panels/example") {
  const entityKey = panelId.replace(/^panel:tree\//, "");
  const runtimeEntityId = panelId.includes("panel:tree/panel-self")
    ? "panel:nav-self-entity"
    : panelId.includes("panel:tree/panel-parent")
      ? "panel:nav-parent-entity"
      : `panel:nav-${entityKey}-entity`;
  return {
    panelId,
    title: panelId.includes("parent") ? "Parent" : "Panel",
    source,
    kind: "workspace" as const,
    parentId: panelId.includes("parent") ? null : "panel:tree/panel-parent",
    contextId: "ctx-meta",
    requestedRef: "main",
    runtimeEntityId,
    attemptId: `${runtimeEntityId}@build-${panelId}`,
    effectiveVersion: `ev-${panelId}`,
    buildKey: `build-${panelId}`,
    phase: "ready" as const,
    updatedAt: 1,
  };
}

function panelDetail(
  panelId: string,
  source: string,
  title: string,
  parentSlotId: string | null,
) {
  const key = panelId.replace(/^panel:tree\//, "");
  const entityId = `panel:nav-${key}-entity`;
  return {
    revision: 1,
    slot: {
      slot_id: panelId,
      parent_slot_id: parentSlotId,
      current_entity_id: entityId,
      current_entity_title: title,
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
      context_id: "ctx-meta",
      state_args: '{"preserved":true}',
      recorded_at: 1,
    },
    entity: {
      id: entityId,
      authoritySessionId: "authority-panel-fixture",
      kind: "panel",
      source: { repoPath: source, effectiveVersion: `ev-${key}` },
      contextId: "ctx-meta",
      key,
      createdAt: 1,
      status: "active",
      cleanupComplete: false,
    },
  };
}

function readyAttempt(slotId: string, runtimeEntityId: string) {
  return {
    epoch: "test",
    attemptId: `attempt:${runtimeEntityId}`,
    slotId,
    runtimeEntityId,
    phase: "ready" as const,
    revision: 1,
    reporter: "renderer" as const,
    updatedAt: 1,
  };
}

async function createRpcCall() {
  const call = vi.fn(
    async (_target: string, method: string, args: unknown[]) => {
      switch (method) {
        case "workers.resolveService":
          return durableObjectServiceFixture("do:workspace-presentation");
        case "titlesForSlots":
          return Object.fromEntries(
            (args[0] as string[]).map((slotId) => [
              slotId,
              slotId.includes("parent")
                ? "Parent"
                : slotId.includes("browser")
                  ? "Browser"
                  : slotId.includes("child")
                    ? "Child"
                    : slotId.includes("panels~example")
                      ? "Created"
                      : "Panel",
            ]),
          );
        case "bindSlot":
        case "incrementAccess":
        case "rebuildIndex":
        case "removeSlots":
          return undefined;
        case "indexPanel":
        case "panel.index":
          return null;
        case "updatePanelTitle":
        case "panel.updateTitle":
          return args[1] ?? null;
        case "runtime.reserveEntity":
        case "runtime.activateReservedEntity":
        case "runtime.createEntity": {
          const spec = args[0] as {
            key: string;
            contextId?: string;
            execution:
              | { surface: "code"; source: string }
              | { surface: "external"; url: string };
          };
          return {
            id: `panel:nav-${spec.key}`,
            kind: "panel",
            contextId: spec.contextId ?? "ctx-created",
            source: {
              repoPath: "panels/example",
              effectiveVersion:
                method === "runtime.reserveEntity"
                  ? "ev-reserved"
                  : "ev-created",
            },
            targetId: `panel:nav-${spec.key}`,
            ...(method === "runtime.reserveEntity"
              ? {}
              : { buildKey: "b".repeat(64) }),
          };
        }
        case "workspace-state.slot.patchCurrentStateArgs":
          return { preserved: true, ...(args[1] as Record<string, unknown>) };
        case "workspace-state.slot.create":
          return undefined;
        case "workspace-state.panel.index":
          return null;
        case "workspace-state.panel.updateTitle":
          return args[1] ?? null;
        case "panelTree.focus":
          return undefined;
        case "panelRuntime.ensureSlot":
          return {
            status: "assigned",
            lease: null,
            attempt: readyAttempt(
              String(args[0]),
              `panel:nav-${String(args[0]).replace(/^panel:tree\//, "")}-entity`,
            ),
          };
        case "workspace-state.slot.commitPreparedNavigation": {
          const input = args[0] as {
            expectedCurrentEntityId: string;
            mutation: { entry: { entityId: string } };
          };
          return {
            previousEntityId: input.expectedCurrentEntityId,
            currentEntityId: input.mutation.entry.entityId,
            currentEntryKey: "entry-committed",
            cursor: 0,
          };
        }
        case "build.getPanelMetadata":
          return {
            source: "panels/example",
            title: "Created",
            hiddenInLauncher: false,
          };
        case "workspace-state.panelTree.rootGroups":
          return {
            revision: 1,
            groups: [{ ownerUserId: null, rootCount: 1 }],
            nextCursor: null,
          };
        case "workspace-state.panelTree.page": {
          const input = args[0] as {
            group:
              | { kind: "roots"; ownerUserId: string | null }
              | { kind: "children"; parentSlotId: string };
          };
          const childParent =
            input.group.kind === "children" ? input.group.parentSlotId : null;
          const nodes =
            input.group.kind === "roots"
              ? [
                  {
                    slotId: "panel:tree/browser-1",
                    title: "Browser",
                    source: "browser:https://example.com",
                    kind: "browser",
                    parentSlotId: null,
                    ownerUserId: null,
                    contextId: "ctx",
                    runtimeEntityId: "panel:browser-entity",
                    effectiveVersion: "ev-browser",
                    createdAt: 1,
                    childCount: 0,
                  },
                ]
              : childParent
                ? [
                    {
                      slotId: "panel:tree/child-1",
                      title: "Child",
                      source: "panels/child",
                      kind: "workspace",
                      parentSlotId: childParent,
                      ownerUserId: null,
                      contextId: "ctx",
                      runtimeEntityId: "panel:child-entity",
                      effectiveVersion: "ev-child",
                      createdAt: 1,
                      childCount: 0,
                    },
                  ]
                : [];
          return { revision: 1, group: input.group, nodes, nextCursor: null };
        }
        case "workspace-state.panelTree.detail":
          const panelId = String(args[0]);
          const created = panelId.includes("panels~example");
          const source = created
            ? "panels/example"
            : panelId.includes("parent")
              ? "panels/parent"
              : "panels/self";
          return panelDetail(
            panelId,
            source,
            created
              ? "Created"
              : panelId.includes("parent")
                ? "Parent"
                : "Panel",
            created || panelId.includes("parent")
              ? null
              : "panel:tree/panel-parent",
          );
        case "panelTree.observe":
          return readyObservation(String(args[0]));
        case "panelRuntime.observeSlot":
          const observedPanelId = String(args[0]);
          const observedEntityKey = observedPanelId.replace(
            /^panel:tree\//,
            "",
          );
          const observedRuntimeEntityId = `panel:nav-${observedEntityKey}-entity`;
          return {
            version: { epoch: "test", counter: 1 },
            attempt: readyAttempt(observedPanelId, observedRuntimeEntityId),
            route: {
              reachable: true,
              connectionId: `route:${observedPanelId}`,
              holderLabel: "Test host",
              platform: "headless",
              supportsCdp: true,
              view: { url: "http://panel.test/", loading: false },
            },
          };
        case "panelTree.diagnose":
          return {
            observation: readyObservation(String(args[0])),
            consoleHistory: {
              entries: [{ message: "loaded" }],
              errors: [],
              page: { nextBeforeSeq: null, hasOlder: false },
              dropped: { entries: 0, errors: 0 },
              capacity: { entries: 1000, errors: 500 },
            },
          };
        case "panelCdp.getCdpEndpoint":
          return { wsEndpoint: "ws://localhost", token: "t" };
        case "panelCdp.consoleHistory":
          return {
            entries: [
              {
                timestamp: 1,
                level: "info",
                message: "loaded",
                line: 1,
                sourceId: "app.tsx",
                url: "https://example.com",
              },
            ],
            errors: [],
            page: { nextBeforeSeq: null, hasOlder: false },
            dropped: { entries: 0, errors: 0 },
            capacity: { entries: 1000, errors: 500 },
          };
        case "panelTree.reload":
          return readyObservation(String(args[0]));
        case "panelTree.rebuildPanel":
          return readyObservation(String(args[0]));
        case "panelTree.navigate":
          return {
            id: args[0],
            title: "Navigated",
            observation: readyObservation(String(args[0]), String(args[1])),
          };
        case "externalOpen.openExternal":
          return {};
        default:
          return undefined;
      }
    },
  );
  const schemaMock = (await import("@vibestudio/rpc/test-utils")).schemaRpcMock(
    { call },
  );
  return Object.assign(schemaMock.call, { wireCall: call });
}

describe("PanelHandle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("@workspace/cdp-client");
    delete (globalThis as any).__vibestudioShell;
    delete (globalThis as any).__vibestudioRequire__;
    delete (globalThis as any).__vibestudioRequireAsync__;
    delete (globalThis as any).__vibestudioLoadImport__;
  });

  it("keeps panel APIs bound to their owning runtime when another runtime is created", async () => {
    const { createPanelHandleApi } = await import("./handle.js");
    const firstCall = await createRpcCall();
    const secondCall = await createRpcCall();
    const first = createPanelHandleApi(
      { call: firstCall, on: vi.fn() } as never,
      { selfId: "panel:tree/first" },
    );
    const second = createPanelHandleApi(
      { call: secondCall, on: vi.fn() } as never,
      { selfId: "panel:tree/second" },
    );

    expect(first.panelTree.self().id).toBe("panel:tree/first");
    expect(second.panelTree.self().id).toBe("panel:tree/second");
    await first.openExternal("https://example.test/first");
    expect(firstCall.wireCall).toHaveBeenCalledWith(
      "main",
      "externalOpen.openExternal",
      ["https://example.test/first", undefined],
      undefined,
    );
    expect(secondCall.wireCall).not.toHaveBeenCalled();
  });

  it("cleans native and RPC child subscriptions exactly once on runtime destruction", async () => {
    const removeEventListener = vi.fn();
    (globalThis as any).__vibestudioShell = {
      addEventListener: vi.fn().mockReturnValueOnce(11).mockReturnValueOnce(12),
      removeEventListener,
    };
    const { createPanelHandleApi } = await import("./handle.js");
    const rpcUnsubscribe = vi.fn();
    const runtime = createPanelHandleApi({
      call: await createRpcCall(),
      on: vi.fn(() => rpcUnsubscribe),
    } as never);
    const unsubscribe = runtime.onChildCreated(vi.fn());
    runtime.onChildCreationError(vi.fn());
    unsubscribe();
    runtime.destroy();
    runtime.destroy();
    unsubscribe();
    expect(removeEventListener.mock.calls).toEqual([[11], [12]]);
    expect(rpcUnsubscribe).toHaveBeenCalledTimes(2);
    expect(() => runtime.onChildCreated(vi.fn())).toThrow("destroyed");
    expect(() => runtime.onChildCreationError(vi.fn())).toThrow("destroyed");
  });

  it("returns a workspace handle from openPanel", async () => {
    const { createPanelHandleApi } = await import("./handle.js");
    const { openPanel } = createPanelHandleApi({
      call: await createRpcCall(),
      on: vi.fn(),
    } as never);

    const handle = await openPanel("panels/example");

    expect(handle).toMatchObject({
      id: expect.stringMatching(/^panel:tree\/panels~example\//),
      title: "Created",
      source: "panels/example",
      kind: "workspace",
    });
    await expect(handle.cdp.getCdpEndpoint()).resolves.toEqual({
      wsEndpoint: "ws://localhost",
      token: "t",
    });
    await expect(handle.cdp.consoleHistory()).resolves.toMatchObject({
      capacity: { entries: 1000, errors: 500 },
    });
  });

  it("defaults panel opens under self but treats parentId null as root", async () => {
    const { createPanelHandleApi } = await import("./handle.js");
    const rpcCall = await createRpcCall();
    const { openPanel } = createPanelHandleApi(
      { call: rpcCall, on: vi.fn() } as never,
      {
        selfId: "panel:tree/panel-self",
      },
    );

    await openPanel("panels/child");
    await openPanel("panels/root", { parentId: null });
    await openPanel("panels/context", {
      contextId: "ctx-next",
      ref: "ctx:ctx-next",
    });

    const reservations = rpcCall.wireCall.mock.calls.filter(
      ([target, method]) =>
        target === "main" && method === "runtime.reserveEntity",
    );
    expect(reservations).toHaveLength(3);
    expect(reservations[0]?.[2]?.[0]).toMatchObject({
      execution: { surface: "code", source: "panels/child" },
    });
    expect(reservations[1]?.[2]?.[0]).toMatchObject({
      execution: { surface: "code", source: "panels/root" },
    });
    expect(reservations[2]?.[2]?.[0]).toMatchObject({
      execution: {
        surface: "code",
        source: "panels/context",
        ref: "ctx:ctx-next",
      },
      contextId: "ctx-next",
    });
    expect(
      rpcCall.wireCall.mock.calls.filter(
        ([, method]) => method === "panelTree.create",
      ),
    ).toHaveLength(0);
  });

  it("hydrates paged browser handles with CDP automation", async () => {
    const { createPanelHandleApi } = await import("./handle.js");
    const { panelTree } = createPanelHandleApi({
      call: await createRpcCall(),
      on: vi.fn(),
    } as never);

    const page = await panelTree.page({
      group: { kind: "roots", ownerUserId: null },
      limit: 200,
    });
    const handle = page.entries[0]?.handle;

    expect(handle?.kind).toBe("browser");
    expect(handle?.source).toBe("https://example.com");
    await expect(handle?.cdp.getCdpEndpoint()).resolves.toEqual({
      wsEndpoint: "ws://localhost",
      token: "t",
    });
  });

  it("routes hydrated handle RPC to the current runtime entity", async () => {
    const rpcCall = await createRpcCall();
    const rpcEmit = vi.fn(async () => undefined);
    const eventHandlers: Array<
      (event: { caller: { callerId: string }; payload: unknown }) => void
    > = [];
    const rpcOn = vi.fn(
      (
        _event: string,
        handler: (event: {
          caller: { callerId: string };
          payload: unknown;
        }) => void,
      ) => {
        eventHandlers.push(handler);
        return vi.fn();
      },
    );
    const { createPanelHandleApi } = await import("./handle.js");
    const { panelTree } = createPanelHandleApi({
      call: rpcCall,
      emit: rpcEmit,
      on: rpcOn,
    } as never);

    const child = (
      await panelTree.page({
        group: { kind: "children", parentSlotId: "panel:tree/parent-1" },
        limit: 200,
      })
    ).entries[0]?.handle;
    expect(child).toBeDefined();
    await (child!.call as Record<string, () => Promise<unknown>>)["ping"]!();
    await child!.emit("ready", { ok: true });
    const listener = vi.fn();
    child!.on("status", listener, {
      kind: "eligible",
      rationale: "Observe this public child status event.",
    });
    eventHandlers[0]?.({
      caller: { callerId: "panel:other-entity" },
      payload: { ignored: true },
    });
    eventHandlers[0]?.({
      caller: { callerId: "panel:nav-child-1-entity" },
      payload: { ok: true },
    });

    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "panel:nav-child-1-entity",
      "ping",
      [],
      undefined,
    );
    expect(rpcEmit).toHaveBeenCalledWith("panel:nav-child-1-entity", "ready", {
      ok: true,
    });
    expect(rpcOn).toHaveBeenCalledWith("status", expect.any(Function), {
      kind: "eligible",
      rationale: "Observe this public child status event.",
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ ok: true });
  });

  it("keeps child contract handles unified with the underlying panel target", async () => {
    const rpcCall = await createRpcCall();
    const rpcEmit = vi.fn(async () => undefined);
    const { createPanelHandleApi } = await import("./handle.js");
    const { panelTree } = createPanelHandleApi({
      call: rpcCall,
      emit: rpcEmit,
      on: vi.fn(),
    } as never);

    const child = (
      await panelTree.page({
        group: { kind: "children", parentSlotId: "panel:tree/parent-1" },
        limit: 200,
      })
    ).entries[0]!.handle;
    const { defineContract } = await import("../core/defineContract.js");
    const { createRpcMethods } = await import("@vibestudio/shared/rpcMethods");
    const { z } = await import("zod");
    const childContract = defineContract({
      source: "panels/child",
      child: {
        methods: createRpcMethods(
          "panel",
          {
            ping: {
              website: { kind: "closed", reason: "Test child contract." },
              args: z.tuple([]),
              returns: z.void(),
            },
          },
          "",
        ),
      },
    });
    const typedChild = child!.withContract(childContract, "child");

    expect(typedChild.id).toBe(child!.id);
    expect(typedChild.id).toBe("panel:tree/child-1");
    await (typedChild.call as Record<string, () => Promise<unknown>>)[
      "ping"
    ]!();
    await typedChild.emit("ready", { ok: true });
    await expect(typedChild.cdp.getCdpEndpoint()).resolves.toEqual({
      wsEndpoint: "ws://localhost",
      token: "t",
    });
    await expect(typedChild.stateArgs.patch({ mode: "live" })).resolves.toEqual(
      {
        mode: "live",
        preserved: true,
      },
    );

    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "panel:nav-child-1-entity",
      "ping",
      [],
      undefined,
    );
    expect(rpcEmit).toHaveBeenCalledWith("panel:nav-child-1-entity", "ready", {
      ok: true,
    });
    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "main",
      "workspace-state.slot.patchCurrentStateArgs",
      ["panel:tree/child-1", { mode: "live" }],
      undefined,
    );
  });

  it("exposes bounded panelTree queries plus get and self handles", async () => {
    const { createPanelHandleApi } = await import("./handle.js");
    const rpcCall = await createRpcCall();
    const { panelTree } = createPanelHandleApi(
      { call: rpcCall, on: vi.fn() } as never,
      {
        selfId: "panel:tree/panel-self",
        selfRpcTargetId: "panel:self-entity",
        parentId: "panel:tree/panel-parent",
        parentRpcTargetId: "panel:parent-entity",
      },
    );

    const owners = await panelTree.rootOwners({ limit: 200 });
    const roots = await panelTree.rootsForOwner(owners.owners[0]!.ownerUserId, {
      limit: 200,
    });
    const children = await panelTree.children("panel:tree/parent-1", {
      limit: 50,
    });
    const self = panelTree.self();
    const parent = self.parent();

    expect(roots.entries).toHaveLength(1);
    expect(roots.entries[0]?.handle.id).toBe("panel:tree/browser-1");
    expect(children.entries[0]?.handle.id).toBe("panel:tree/child-1");
    await expect(roots.entries[0]?.handle.observe()).resolves.toMatchObject({
      phase: "ready",
    });
    expect(panelTree.get("panel:tree/arbitrary").id).toBe(
      "panel:tree/arbitrary",
    );
    expect(self.id).toBe("panel:tree/panel-self");
    await expect(self.observe()).resolves.toMatchObject({
      panelId: "panel:tree/panel-self",
      parentId: "panel:tree/panel-parent",
    });
    await (self.call as Record<string, () => Promise<unknown>>)["ping"]!();
    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "panel:nav-panel-self-entity",
      "ping",
      [],
      undefined,
    );
    expect(parent?.id).toBe("panel:tree/panel-parent");
    await expect(parent?.observe()).resolves.toMatchObject({
      panelId: "panel:tree/panel-parent",
      parentId: null,
    });
    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "main",
      "workspace-state.panelTree.page",
      [{ group: { kind: "roots", ownerUserId: null }, limit: 200 }],
      undefined,
    );
    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "main",
      "workspace-state.panelTree.page",
      [
        {
          group: { kind: "children", parentSlotId: "panel:tree/parent-1" },
          limit: 50,
        },
      ],
      undefined,
    );
    await (parent!.call as Record<string, () => Promise<unknown>>)["ping"]!();
    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "panel:nav-panel-parent-entity",
      "ping",
      [],
      undefined,
    );
  });

  it("lazily resolves arbitrary panel handles before target RPC", async () => {
    const { createPanelHandleApi } = await import("./handle.js");
    const rpcCall = await createRpcCall();
    const rpcEmit = vi.fn(async () => undefined);
    const { panelTree } = createPanelHandleApi({
      call: rpcCall,
      emit: rpcEmit,
      on: vi.fn(),
    } as never);

    const handle = panelTree.get("panel:tree/arbitrary");
    await (handle.call as Record<string, () => Promise<unknown>>)["ping"]!();
    await handle.emit("ready", { ok: true });

    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "main",
      "workspace-state.panelTree.detail",
      ["panel:tree/arbitrary"],
      undefined,
    );
    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "panel:nav-arbitrary-entity",
      "ping",
      [],
      undefined,
    );
    expect(rpcEmit).toHaveBeenCalledWith(
      "panel:nav-arbitrary-entity",
      "ready",
      { ok: true },
    );
  });

  it("resolves arbitrary panel event targets once and filters synchronously afterward", async () => {
    const { createPanelHandleApi } = await import("./handle.js");
    let resolveMetadata!: (value: unknown) => void;
    let resolveDetailCallStarted!: () => void;
    const detailCallStarted = new Promise<void>((resolve) => {
      resolveDetailCallStarted = resolve;
    });
    const metadataPromise = new Promise<unknown>((resolve) => {
      resolveMetadata = resolve;
    });
    const wireCall = vi.fn(
      async (_target: string, method: string, args: unknown[]) => {
        if (method === "workspace-state.panelTree.detail") {
          resolveDetailCallStarted();
          return metadataPromise;
        }
        if (method === "workers.resolveService") {
          return durableObjectServiceFixture("do:workspace-presentation");
        }
        if (method === "titlesForSlots") {
          return Object.fromEntries(
            (args[0] as string[]).map((slotId) => [slotId, "Events"]),
          );
        }
        if (method === "panelRuntime.ensureSlot") {
          return {
            status: "assigned",
            lease: null,
            attempt: readyAttempt(
              String(args[0]),
              "panel:nav-arbitrary-events-entity",
            ),
          };
        }
        if (method === "panelRuntime.observeSlot") {
          return {
            version: { epoch: "test", counter: 1 },
            attempt: readyAttempt(
              String(args[0]),
              "panel:nav-arbitrary-events-entity",
            ),
            route: {
              reachable: true,
              connectionId: `route:${String(args[0])}`,
              holderLabel: "Test host",
              platform: "headless",
              supportsCdp: true,
              view: { url: "http://panel.test/", loading: false },
            },
          };
        }
        return undefined;
      },
    );
    const schemaMock = (
      await import("@vibestudio/rpc/test-utils")
    ).schemaRpcMock({
      call: wireCall,
    });
    const rpcCall = Object.assign(schemaMock.call, { wireCall });
    const eventHandlers: Array<
      (event: { caller: { callerId: string }; payload: unknown }) => void
    > = [];
    const rpcOn = vi.fn(
      (
        _event: string,
        handler: (event: {
          caller: { callerId: string };
          payload: unknown;
        }) => void,
      ) => {
        eventHandlers.push(handler);
        return vi.fn();
      },
    );
    const { panelTree } = createPanelHandleApi({
      call: rpcCall,
      on: rpcOn,
    } as never);

    const handle = panelTree.get("panel:tree/arbitrary-events");
    const listener = vi.fn();
    handle.on("status", listener, {
      kind: "eligible",
      rationale: "Observe this public child status event.",
    });

    for (let i = 0; i < 5; i += 1) {
      eventHandlers[0]?.({
        caller: { callerId: "panel:nav-arbitrary-events-entity" },
        payload: { before: i },
      });
    }
    await detailCallStarted;
    expect(rpcCall.wireCall).toHaveBeenCalledTimes(1);
    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "main",
      "workspace-state.panelTree.detail",
      ["panel:tree/arbitrary-events"],
      undefined,
    );
    expect(listener).not.toHaveBeenCalled();

    resolveMetadata({
      revision: 1,
      slot: {
        slot_id: "panel:tree/arbitrary-events",
        parent_slot_id: null,
        current_entity_id: "panel:nav-arbitrary-events-entity",
        current_entity_title: "Events",
        current_entry_key: "events-entry",
        sort_key: 0,
        owner_user_id: null,
        created_at: 1,
        closed_at: null,
      },
      currentHistory: {
        slot_id: "panel:tree/arbitrary-events",
        cursor: 0,
        entry_key: "events-entry",
        entity_id: "panel:nav-arbitrary-events-entity",
        source: "panels/events",
        context_id: "ctx-events",
        state_args: null,
        recorded_at: 1,
      },
      entity: {
        id: "panel:nav-arbitrary-events-entity",
        authoritySessionId: "authority-events",
        kind: "panel",
        source: { repoPath: "panels/events", effectiveVersion: "ev-events" },
        contextId: "ctx-events",
        key: "arbitrary-events",
        createdAt: 1,
        status: "active",
        cleanupComplete: false,
        activeBuildKey: "b".repeat(64),
      },
    });
    await vi.waitFor(() => {
      eventHandlers[0]?.({
        caller: { callerId: "panel:nav-arbitrary-events-entity" },
        payload: { resolved: true },
      });
      expect(listener).toHaveBeenCalledTimes(1);
    });
    eventHandlers[0]?.({
      caller: { callerId: "panel:other-entity" },
      payload: { ignored: true },
    });
    eventHandlers[0]?.({
      caller: { callerId: "panel:nav-arbitrary-events-entity" },
      payload: { ok: true },
    });

    expect(
      rpcCall.wireCall.mock.calls.filter(
        (entry) => entry[1] === "workspace-state.panelTree.detail",
      ),
    ).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, { resolved: true });
    expect(listener).toHaveBeenNthCalledWith(2, { ok: true });
  });

  it("targets parent slot, not self, when navigating, reloading, and rebuilding parent handles", async () => {
    const { createPanelHandleApi } = await import("./handle.js");
    const rpcCall = await createRpcCall();
    const { panelTree } = createPanelHandleApi(
      { call: rpcCall, on: vi.fn() } as never,
      {
        selfId: "panel:tree/panel-self",
        selfRpcTargetId: "panel:self-entity",
        parentId: "panel:tree/panel-parent",
        parentRpcTargetId: "panel:parent-entity",
      },
    );

    const parent = panelTree.self().parent();
    await expect(parent?.rebuild()).resolves.toMatchObject({
      panelId: "panel:tree/panel-parent",
      phase: "ready",
    });
    await expect(parent?.reload()).resolves.toMatchObject({
      panelId: "panel:tree/panel-parent",
      phase: "ready",
    });
    await expect(
      parent?.navigate("panels/next", {
        contextId: "ctx-next",
        stateArgs: { mode: "live" },
      }),
    ).resolves.toMatchObject({
      panelId: "panel:tree/panel-parent",
      phase: "ready",
    });

    const replacements = rpcCall.wireCall.mock.calls.filter(
      ([, method, args]) =>
        method === "workspace-state.slot.commitPreparedNavigation" &&
        (args[0] as { mutation: { kind: string } }).mutation.kind === "replace",
    );
    expect(replacements).toHaveLength(1);
    // Reload restarts the current renderer; rebuilding replaces its source
    // generation. Both operations must target the parent, never this child.
    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "main",
      "runtime.supervision.restart",
      [{ kind: "panel", entityId: "panel:nav-panel-parent-entity" }],
      undefined,
    );
    for (const [, , args] of replacements) {
      expect(args[0]).toMatchObject({
        slotId: "panel:tree/panel-parent",
        mutation: {
          entry: { source: "panels/parent", stateArgs: { preserved: true } },
        },
      });
    }
    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "main",
      "workspace-state.slot.commitPreparedNavigation",
      [
        expect.objectContaining({
          slotId: "panel:tree/panel-parent",
          mutation: expect.objectContaining({ kind: "replace" }),
        }),
      ],
      undefined,
    );
    expect(rpcCall.wireCall).not.toHaveBeenCalledWith(
      "main",
      "panelTree.rebuildPanel",
      expect.any(Array),
    );
    expect(rpcCall.wireCall).not.toHaveBeenCalledWith(
      "main",
      "panelTree.reload",
      expect.any(Array),
    );
    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "main",
      "workspace-state.slot.commitPreparedNavigation",
      [expect.objectContaining({ slotId: "panel:tree/panel-parent" })],
      undefined,
    );
    expect(rpcCall.wireCall).not.toHaveBeenCalledWith(
      "main",
      "panelTree.navigate",
      expect.any(Array),
    );
    expect(rpcCall.wireCall).not.toHaveBeenCalledWith(
      "main",
      "panelTree.rebuildPanel",
      ["panel:tree/panel-self"],
    );
    expect(rpcCall.wireCall).not.toHaveBeenCalledWith(
      "main",
      "panelTree.reload",
      ["panel:tree/panel-self"],
    );
    expect(rpcCall.wireCall).not.toHaveBeenCalledWith(
      "main",
      "panelTree.navigate",
      expect.arrayContaining(["panel:tree/panel-self"]),
    );
  });

  it("hydrates arbitrary parent handles from discovered tree metadata", async () => {
    const { createPanelHandleApi } = await import("./handle.js");
    const { panelTree } = createPanelHandleApi(
      { call: await createRpcCall(), on: vi.fn() } as never,
      {
        selfId: "panel:tree/panel-self",
        parentId: "panel:tree/panel-parent",
      },
    );

    const child = (
      await panelTree.page({
        group: { kind: "children", parentSlotId: "panel:tree/parent-1" },
        limit: 200,
      })
    ).entries[0]?.handle;
    const parent = child?.parent();

    expect(child?.id).toBe("panel:tree/child-1");
    expect(panelTree.parent("panel:tree/child-1")?.id).toBe(
      "panel:tree/parent-1",
    );
    expect(parent?.id).toBe("panel:tree/parent-1");
  });

  it("creates non-panel runtime handles that cannot be targeted", async () => {
    const { createNonPanelRuntimeHandle } =
      await import("../shared/handles.js");
    const parent = createNonPanelRuntimeHandle({
      id: "panel:tree/panel-parent",
    });
    const handle = createNonPanelRuntimeHandle({
      id: "worker:agent",
      parentId: "panel:tree/panel-parent",
      parent: () => parent,
    });

    expect(handle.id).toBe("worker:agent");
    expect(handle.parent()?.id).toBe("panel:tree/panel-parent");
    await expect(handle.observe()).rejects.toThrow(
      "worker:agent is not a panel target",
    );
    await expect(handle.cdp.getCdpEndpoint()).rejects.toThrow(
      "CDP is not available for panel worker:agent",
    );
    await expect(handle.call["anything"]!()).rejects.toThrow(
      "worker:agent is not a panel target",
    );
    await expect(handle.emit("event", {})).rejects.toThrow(
      "worker:agent is not a panel target",
    );
  });

  it("archives on async disposal and propagates an archive failure", async () => {
    const { createPanelHandle, unavailableCdp } =
      await import("../shared/handles.js");
    const archive = vi
      .fn()
      .mockResolvedValueOnce({ status: "archived" })
      .mockRejectedValueOnce(new Error("archive denied"));
    const handle = createPanelHandle({
      rpc: { call: vi.fn(), on: vi.fn() } as never,
      metadata: { id: "panel:tree/owned", source: "panels/example" },
      cdp: unavailableCdp("panel:tree/owned"),
      ops: { archive },
    });

    await handle[Symbol.asyncDispose]();
    expect(archive).toHaveBeenCalledExactlyOnceWith("panel:tree/owned");
    await expect(handle[Symbol.asyncDispose]()).rejects.toThrow(
      "archive denied",
    );
  });

  it("rejects an owned lifetime before committing a slot when no lifecycle owner exists", async () => {
    const { createPanelHandleApi } = await import("./handle.js");
    const call = await createRpcCall();
    const { openPanel } = createPanelHandleApi({ call, on: vi.fn() } as never);

    await expect(
      openPanel("panels/example", { lifetime: "invocation" }),
    ).rejects.toThrow(/requires an owning eval invocation or session/);
    expect(call).not.toHaveBeenCalled();
  });

  it.each(["invocation", "session"] as const)(
    "claims %s ownership before activation, including a failed boot",
    async (lifetime) => {
      const { createPanelRuntime } = await import("../shared/panelRuntime.js");
      const call = await createRpcCall();
      const delegate = call.getMockImplementation()!;
      const claim = vi.fn();
      const failure = new Error("Panel activation failed");
      call.mockImplementation(async (target, method, args) => {
        if (method === "runtime.activateReservedEntity") {
          expect(claim).toHaveBeenCalledExactlyOnceWith({
            id: expect.any(String),
            lifetime,
          });
          throw failure;
        }
        return delegate(target, method, args);
      });
      const runtime = createPanelRuntime({
        rpc: { call, on: vi.fn() } as never,
        claimPanelLifetime: claim,
      });
      await expect(
        runtime.openPanel("panels/example", { lifetime, focus: false }),
      ).rejects.toMatchObject({
        code: "PANEL_OPERATION_FAILED",
        failure: {
          message: expect.stringContaining(failure.message),
          details: { slotCommitted: true },
        },
      });
      expect(claim).toHaveBeenCalledOnce();
    },
  );

  it("persists only durable identities as scope references", async () => {
    const { createPanelHandle, createNonPanelRuntimeHandle, unavailableCdp } =
      await import("../shared/handles.js");
    const ref = (value: object) =>
      (value as Record<symbol, () => unknown>)[
        Symbol.for("vibestudio.scopeRef")
      ]?.();
    const panel = createPanelHandle({
      rpc: { call: vi.fn(), on: vi.fn() } as never,
      metadata: {
        id: "panel:tree/owned",
        rpcTargetId: "panel:cached-entity",
      },
      cdp: unavailableCdp("panel:tree/owned"),
    });

    expect(ref(panel)).toEqual({ kind: "panel", id: "panel:tree/owned" });
    expect(
      Object.prototype.propertyIsEnumerable.call(
        panel,
        Symbol.for("vibestudio.scopeRef"),
      ),
    ).toBe(false);
    expect(ref(createNonPanelRuntimeHandle({ id: "worker:agent" }))).toEqual({
      kind: "worker",
      id: "worker:agent",
    });
    expect(
      ref(createNonPanelRuntimeHandle({ id: "agent-entity", kind: "do" })),
    ).toEqual({ kind: "do", id: "agent-entity" });
    expect(ref(createNonPanelRuntimeHandle({ id: "opaque" }))).toBeUndefined();
  });

  it("routes non-Electron CDP calls through the server panelCdp service", async () => {
    const wireCall = vi.fn(async () => ({
      wsEndpoint: "ws://server/cdp/panel-1",
      token: "t",
    }));
    const rpcCall = (await import("@vibestudio/rpc/test-utils")).schemaRpcMock({
      call: wireCall,
    }).call;
    const { createPanelHandleApi } = await import("./handle.js");
    const { getPanelHandle } = createPanelHandleApi({
      call: rpcCall,
      on: vi.fn(),
    } as never);

    await expect(
      getPanelHandle("panel-1", "browser").cdp.getCdpEndpoint(),
    ).resolves.toEqual({
      wsEndpoint: "ws://server/cdp/panel-1",
      token: "t",
    });

    expect(wireCall).toHaveBeenCalledWith(
      "main",
      "panelCdp.getCdpEndpoint",
      ["panel-1"],
      undefined,
    );
  });

  it("routes non-Electron CDP drive verbs through panelCdp", async () => {
    const rpcCall = await createRpcCall();
    const { createPanelHandleApi } = await import("./handle.js");
    const { getPanelHandle } = createPanelHandleApi({
      call: rpcCall,
      on: vi.fn(),
    } as never);

    await getPanelHandle("panel:tree/panel-1", "browser").navigate(
      "https://example.com",
    );

    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "main",
      "workspace-state.slot.commitPreparedNavigation",
      [expect.objectContaining({ slotId: "panel:tree/panel-1" })],
      undefined,
    );
    expect(rpcCall.wireCall).not.toHaveBeenCalledWith(
      "main",
      "panelTree.navigate",
      expect.any(Array),
    );
  });

  it("routes historical console access through panelCdp", async () => {
    const rpcCall = await createRpcCall();
    const { createPanelHandleApi } = await import("./handle.js");
    const { getPanelHandle } = createPanelHandleApi({
      call: rpcCall,
      on: vi.fn(),
    } as never);

    await expect(
      getPanelHandle("panel:tree/panel-1").cdp.consoleHistory({
        limit: 50,
        errorLimit: 50,
      }),
    ).resolves.toMatchObject({
      entries: [expect.objectContaining({ message: "loaded" })],
      capacity: { entries: 1000, errors: 500 },
    });

    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "main",
      "panelCdp.consoleHistory",
      ["panel:tree/panel-1", { limit: 50, errorLimit: 50 }],
      undefined,
    );
  });

  it("exposes a unified panel diagnostics bundle", async () => {
    const rpcCall = await createRpcCall();
    const { createPanelHandleApi } = await import("./handle.js");
    const { getPanelHandle } = createPanelHandleApi({
      call: rpcCall,
      on: vi.fn(),
    } as never);

    await expect(
      getPanelHandle("panel:tree/panel-1").diagnose(),
    ).resolves.toMatchObject({
      observation: { panelId: "panel:tree/panel-1", phase: "ready" },
      consoleHistory: {
        entries: [expect.objectContaining({ message: "loaded" })],
      },
    });

    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "main",
      "panelCdp.consoleHistory",
      ["panel:tree/panel-1", { limit: 200, errorLimit: 100 }],
      undefined,
    );
    expect(rpcCall.wireCall).not.toHaveBeenCalledWith(
      "main",
      "panelTree.diagnose",
      expect.any(Array),
    );
  });

  it("supports handle.click as a CDP automation convenience", async () => {
    const click = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const isClosed = vi.fn(() => false);
    const locator = vi.fn(() => ({ click }));
    const page = { locator, isClosed };
    const connect = vi.fn(async () => ({
      contexts: () => [{ pages: () => [page] }],
      close,
    }));
    const loadCdpClient = vi.fn(() => ({ BrowserImpl: { connect } }));
    vi.doMock("@workspace/cdp-client", loadCdpClient);
    const rpcCall = await createRpcCall();
    const { createPanelHandleApi } = await import("./handle.js");
    const { getPanelHandle } = createPanelHandleApi({
      call: rpcCall,
      on: vi.fn(),
    } as never);

    const handle = getPanelHandle("panel:tree/panel-1", "browser");
    await handle.click("button.submit");

    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "main",
      "panelCdp.getCdpEndpoint",
      ["panel:tree/panel-1"],
      { signal: expect.any(AbortSignal) },
    );
    expect(locator).toHaveBeenCalledWith("button.submit");
    expect(click).toHaveBeenCalledWith();
    expect(loadCdpClient).toHaveBeenCalledOnce();
    // The click ran on the panel's stable session, which stays bound.
    expect(close).not.toHaveBeenCalled();
    await (await handle.cdp.session()).close();
    expect(close).toHaveBeenCalledOnce();
  });

  it("loads the canonical CDP page client only when requested", async () => {
    const page = {
      marker: "async-page",
      isClosed: vi.fn(() => false),
      title: vi.fn(async function (this: { marker: string }) {
        return this.marker;
      }),
    };
    const connect = vi.fn(async () => ({
      contexts: () => [{ pages: () => [page] }],
    }));
    const loadCdpClient = vi.fn(() => ({ BrowserImpl: { connect } }));
    vi.doMock("@workspace/cdp-client", loadCdpClient);
    const rpcCall = await createRpcCall();
    const { createPanelHandleApi } = await import("./handle.js");
    const { getPanelHandle } = createPanelHandleApi({
      call: rpcCall,
      on: vi.fn(),
    } as never);

    const handle = getPanelHandle("panel:tree/browser-1");
    const session = await handle.cdp.session();
    const connectedPage = session.page;
    expect(connectedPage).not.toBe(page);
    expect((await handle.cdp.session()).page).toBe(connectedPage);
    // The stable page proxy must preserve the browser client's receiver.
    expect(await connectedPage.title()).toBe("async-page");
    expect(page.title).toHaveBeenCalledOnce();

    expect(loadCdpClient).toHaveBeenCalledOnce();
  });

  it("reports an invalid canonical CDP package surface", async () => {
    vi.doMock("@workspace/cdp-client", () => ({ BrowserImpl: null }));
    const rpcCall = await createRpcCall();
    const { createPanelHandleApi } = await import("./handle.js");
    const { getPanelHandle } = createPanelHandleApi({
      call: rpcCall,
      on: vi.fn(),
    } as never);

    await expect(
      getPanelHandle("panel:tree/browser-1").cdp.session(),
    ).rejects.toThrow(/module does not expose BrowserImpl\.connect/);
  });

  it("routes CDP operations through rpc for workspace and self handles", async () => {
    const rpcCall = await createRpcCall();
    const { createPanelHandleApi } = await import("./handle.js");
    const { getPanelHandle, panelTree } = createPanelHandleApi(
      { call: rpcCall, on: vi.fn() } as never,
      {
        selfId: "panel:tree/panel-self",
      },
    );

    // CDP automation is available for every panel target, including workspace
    // panels and the panel the agent is running in (panelTree.self()).
    await expect(
      getPanelHandle("panel:tree/workspace-1").navigate("https://example.com"),
    ).resolves.toMatchObject({ phase: "ready" });
    await expect(
      getPanelHandle("panel:tree/workspace-1").cdp.getCdpEndpoint(),
    ).resolves.toEqual({
      wsEndpoint: "ws://localhost",
      token: "t",
    });
    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "main",
      "workspace-state.slot.commitPreparedNavigation",
      [expect.objectContaining({ slotId: "panel:tree/workspace-1" })],
      undefined,
    );
    expect(rpcCall.wireCall).not.toHaveBeenCalledWith(
      "main",
      "panelTree.navigate",
      expect.any(Array),
    );
    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "main",
      "panelCdp.getCdpEndpoint",
      ["panel:tree/workspace-1"],
      undefined,
    );
    await expect(panelTree.self().cdp.getCdpEndpoint()).resolves.toEqual({
      wsEndpoint: "ws://localhost",
      token: "t",
    });
    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "main",
      "panelCdp.getCdpEndpoint",
      ["panel:tree/panel-self"],
      undefined,
    );
  });

  it("hydrates direct children through bounded pages", async () => {
    const { createPanelHandleApi } = await import("./handle.js");
    const rpcCall = await createRpcCall();
    const { openPanel, panelTree } = createPanelHandleApi({
      call: rpcCall,
      on: vi.fn(),
    } as never);
    const handle = await openPanel("panels/example");

    const children = await panelTree.page({
      group: { kind: "children", parentSlotId: handle.id },
      limit: 200,
    });

    expect(children.entries).toHaveLength(1);
    expect(children.entries[0]?.handle.id).toBe("panel:tree/child-1");
    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "main",
      "workspace-state.panelTree.page",
      [
        {
          group: { kind: "children", parentSlotId: handle.id },
          limit: 200,
        },
      ],
      undefined,
    );
  });
});
