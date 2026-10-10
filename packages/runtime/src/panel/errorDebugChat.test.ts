import { beforeEach, describe, expect, it, vi } from "vitest";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";

function readyObservation(panelId: string, source: string) {
  return {
    panelId,
    title: "Agentic Chat",
    source,
    kind: "workspace" as const,
    parentId: "spectrolite",
    contextId: "ctx-vault",
    requestedRef: "main",
    runtimeEntityId: `panel:${panelId}-entity`,
    attemptId: `panel:${panelId}-entity@build-chat`,
    effectiveVersion: "ev-chat",
    buildKey: "b".repeat(64),
    phase: "ready" as const,
    updatedAt: 1,
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
  let createdTitle = "Agentic Chat";
  const runtimeEntity = {
    id: "panel:nav-debug-chat-entity",
    kind: "panel",
    contextId: "ctx-vault",
    source: { repoPath: "panels/chat", effectiveVersion: "ev-chat" },
    buildKey: "b".repeat(64),
    targetId: "panel:nav-debug-chat-entity",
  };
  const call = vi.fn(
    async (_target: string, method: string, args: unknown[]) => {
      switch (method) {
        case "panelTree.metadata":
          return {
            id: args[0],
            title: "Spectrolite",
            source: "panels/spectrolite",
            kind: "workspace",
            parentId: null,
            contextId: "ctx-vault",
            runtimeEntityId: "panel:spectrolite-entity",
            effectiveVersion: "ev-spectrolite",
          };
        case "panelTree.getStateArgs":
          return {
            repoRoot: "/workspace/docs",
            apiToken: "super-secret-token",
          };
        case "panelCdp.consoleHistory":
          return {
            entries: [
              {
                timestamp: 1,
                level: "error",
                message: "Fetch failed with Bearer abcdefghijklmnop",
                line: 10,
                sourceId: "index.tsx",
                url: "http://localhost/panels/spectrolite",
              },
            ],
            errors: [],
            page: { nextBeforeSeq: null, hasOlder: false },
            dropped: { entries: 0, errors: 0 },
            capacity: { entries: 1000, errors: 500 },
          };
        case "panelTree.diagnose":
          return {
            observation: {
              ...readyObservation("spectrolite", "panels/spectrolite"),
              title: "Spectrolite",
              parentId: null,
            },
            consoleHistory: {
              entries: [
                {
                  timestamp: 1,
                  level: "error",
                  message: "Fetch failed with Bearer abcdefghijklmnop",
                  line: 10,
                  sourceId: "index.tsx",
                  url: "http://localhost/panels/spectrolite",
                },
              ],
              errors: [],
              page: { nextBeforeSeq: null, hasOlder: false },
              dropped: { entries: 0, errors: 0 },
              capacity: { entries: 1000, errors: 500 },
            },
          };
        case "build.getPanelMetadata":
          return {
            source: "panels/chat",
            title: "Agentic Chat",
            hiddenInLauncher: false,
          };
        case "workers.resolveService":
          return durableObjectServiceFixture("do:workspace-state");
        case "titlesForSlots":
          return Object.fromEntries(
            (args[0] as string[]).map((slotId) => [
              slotId,
              slotId === "panel:tree/spectrolite"
                ? "Spectrolite"
                : createdTitle,
            ]),
          );
        case "bindSlot":
        case "incrementAccess":
        case "rebuildIndex":
        case "removeSlots":
          return undefined;
        case "indexPanel":
        case "panel.index":
        case "workspace-state.panel.index":
          return null;
        case "updatePanelTitle":
        case "panel.updateTitle":
        case "workspace-state.panel.updateTitle":
          createdTitle = String(args[1]);
          return args[1] ?? null;
        case "runtime.reserveEntity":
        case "runtime.activateReservedEntity":
          return runtimeEntity;
        case "workspace-state.slot.create":
          return undefined;
        case "panelRuntime.ensureSlot":
          return {
            status: "assigned",
            lease: null,
            attempt: readyAttempt(String(args[0]), runtimeEntity.id),
          };
        case "workspace-state.panelTree.detail":
          if (args[0] === "panel:tree/spectrolite") {
            return {
              revision: 1,
              slot: {
                slot_id: "panel:tree/spectrolite",
                parent_slot_id: null,
                current_entity_id: "panel:nav-spectrolite-entity",
                current_entity_title: "Spectrolite",
                current_entry_key: "spectrolite-entry",
                sort_key: 0,
                owner_user_id: null,
                created_at: 1,
                closed_at: null,
              },
              entity: {
                id: "panel:nav-spectrolite-entity",
                authoritySessionId: "authority-spectrolite",
                kind: "panel",
                source: {
                  repoPath: "panels/spectrolite",
                  effectiveVersion: "ev-spectrolite",
                },
                contextId: "ctx-vault",
                key: "spectrolite",
                createdAt: 1,
                status: "active",
                cleanupComplete: false,
                activeBuildKey: "b".repeat(64),
              },
              currentHistory: {
                slot_id: "panel:tree/spectrolite",
                cursor: 0,
                entry_key: "spectrolite-entry",
                entity_id: "panel:nav-spectrolite-entity",
                source: "panels/spectrolite",
                context_id: "ctx-vault",
                state_args: JSON.stringify({
                  repoRoot: "/workspace/docs",
                  apiToken: "super-secret-token",
                }),
                recorded_at: 1,
              },
            };
          }
          return {
            revision: 1,
            slot: {
              slot_id: "panel:tree/debug-chat",
              parent_slot_id: "panel:tree/spectrolite",
              current_entity_id: runtimeEntity.id,
              current_entity_title: createdTitle,
              current_entry_key: "debug-entry",
              sort_key: 0,
              owner_user_id: null,
              created_at: 1,
              closed_at: null,
            },
            entity: {
              id: runtimeEntity.id,
              authoritySessionId: "authority-debug",
              kind: "panel",
              source: { repoPath: "panels/chat", effectiveVersion: "ev-chat" },
              contextId: "ctx-vault",
              key: "debug-chat",
              createdAt: 1,
              status: "active",
              cleanupComplete: false,
              activeBuildKey: "c".repeat(64),
            },
            currentHistory: {
              slot_id: "panel:tree/debug-chat",
              cursor: 0,
              entry_key: "debug-entry",
              entity_id: runtimeEntity.id,
              source: "panels/chat",
              context_id: "ctx-vault",
              state_args: null,
              recorded_at: 1,
            },
          };
        case "panelRuntime.observeSlot":
          return {
            version: { epoch: "test", counter: 1 },
            attempt: readyAttempt(String(args[0]), runtimeEntity.id),
            route: {
              reachable: true,
              connectionId: `route:${String(args[0])}`,
              holderLabel: "test",
              platform: "headless",
              supportsCdp: false,
              view: { url: "http://test/panels/chat", loading: false },
            },
          };
        case "panelTree.create":
          return {
            id: "debug-chat",
            title: "Agentic Chat",
            kind: "workspace",
            runtimeEntityId: "panel:debug-chat-entity",
            effectiveVersion: "ev-chat",
            observation: readyObservation("debug-chat", "panels/chat"),
          };
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

describe("panel error diagnostic chat launcher", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("opens a child chat with a redacted agent debugging prompt", async () => {
    const rpcCall = await createRpcCall();
    const { createPanelHandleApi } = await import("./handle.js");
    const { openPanelErrorDiagnosticChat } =
      await import("./errorDebugChat.js");
    const panelRuntime = createPanelHandleApi(
      { call: rpcCall, on: vi.fn() } as never,
      {
        selfId: "panel:tree/spectrolite",
        selfRpcTargetId: "panel:nav-spectrolite-entity",
      },
    );

    const result = await openPanelErrorDiagnosticChat(
      {
        surfaceName: "Spectrolite panel",
        errorName: "Error",
        errorMessage: "Maximum update depth exceeded",
        componentStack: "at SessionGate",
        locationHref: "http://localhost/panels/spectrolite",
        userAgent: "vitest",
        timestamp: "2026-06-15T00:00:00.000Z",
      },
      {
        slotId: "panel:tree/spectrolite",
        contextId: "ctx-fallback",
        panelRuntime,
      },
    );

    expect(result).toMatchObject({
      panelId: expect.any(String),
      title: "Panel error debug",
    });
    expect(rpcCall.wireCall).toHaveBeenCalledWith(
      "main",
      "runtime.activateReservedEntity",
      [
        expect.objectContaining({
          kind: "panel",
          execution: { surface: "code", source: "panels/chat" },
          contextId: "ctx-vault",
          stateArgs: expect.objectContaining({
            seed: {
              openingRequest: expect.stringContaining(
                "Maximum update depth exceeded",
              ),
            },
          }),
        }),
      ],
      undefined,
    );
    expect(result.prompt).toContain("Inspect the failing panel source");
    expect(result.prompt).toContain("panels/spectrolite");
    expect(result.prompt).toContain('"apiToken": "[redacted]"');
    expect(result.prompt).toContain("Bearer [redacted]");
    expect(result.prompt).not.toContain("super-secret-token");
    expect(result.prompt).not.toContain("abcdefghijklmnop");
  });
});
