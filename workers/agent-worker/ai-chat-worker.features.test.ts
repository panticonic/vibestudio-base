import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { createNativeVesselTestDO } from "@workspace/agentic-do/testing/native-vessel";
import type {
  ToolRegistration,
  ParticipantDescriptor,
} from "@workspace/harness";
import type { PanelContextSnapshot } from "@vibestudio/service-schemas/panelContext";
import { AiChatWorker } from "./ai-chat-worker.js";
import { formatPanelContext } from "./panel-describe-tool.js";
import type { Context } from "@panticonic/pi-chord";
import type { ToolExecutionApi } from "@panticonic/pi-durable";
import type { RpcCallOptions } from "@vibestudio/rpc";
import { executeTool } from "@workspace/harness/testing/native-tool";
import type { NativeInvocationExecution } from "../../packages/agentic-do/src/native-invocation-boundary.js";

const databases = new Set<{ close(): void }>();
afterEach(() => {
  for (const database of databases) database.close();
  databases.clear();
});
async function configuredAgent() {
  const fixture = await createNativeVesselTestDO(TestConfiguredAgent);
  databases.add(fixture.db);
  return fixture;
}

const SNAPSHOT: PanelContextSnapshot = {
  panelId: "slot-a",
  tree: {
    slotId: "slot-a",
    parentSlotId: "slot-root",
    title: "Sales Dashboard",
    siblings: [{ slotId: "slot-b", title: "Q3 sheet" }],
    stateArgs: '{"tab":"q3"}',
    createdAt: 1_000,
  },
  source: {
    source: "panels/sales-dash",
    repoPath: "panels/sales-dash",
    effectiveVersion: "ev-1",
    executionDigest: "a".repeat(64),
    contextId: "ctx-panel",
    entityId: "panel:entry-1",
    kind: "workspace",
  },
  presentation: {
    state: "ready",
    url: "https://example.test/q3",
    surface: "desktop",
    hostConnectionId: "host-1",
    holderLabel: "Desktop",
    supportsCdp: true,
    reachable: true,
  },
  console: {
    available: false,
    reason: "counts-require-cdp-read",
    via: "panel_console",
  },
  address: { available: false, reason: "presentation-local" },
};

const FOCUSED_FEATURES = {
  resources: { subject: { kind: "panel-slot", id: "slot-a" } },
  tools: [
    { kind: "standard" },
    { kind: "panel.describe", resource: "subject" },
    { kind: "panel.screenshot", resource: "subject" },
    { kind: "panel.console", resource: "subject" },
    { kind: "panel.evaluate", resource: "subject" },
    { kind: "panel.cdp", resource: "subject" },
  ],
};

const FOCUSED_PROMPT =
  "You are a quick inspector. Use panel_screenshot and panel_console.";

class TestConfiguredAgent extends AiChatWorker {
  readonly boundCalls: Array<{
    method: string;
    args: unknown[];
    signal?: AbortSignal;
  }> = [];

  protected override async bindNativeToolExecution(
    api: ToolExecutionApi,
    context: Context,
  ): Promise<NativeInvocationExecution> {
    const rpc = {
      ...this.rpc,
      call: schemaRpcMock({
        call: async (
          _target: string,
          method: string,
          args: unknown[],
          options?: RpcCallOptions,
        ) => {
          this.boundCalls.push({ method, args, signal: options?.signal });
          return SNAPSHOT;
        },
      }).call,
    };
    context.abortSignal?.throwIfAborted();
    return {
      invocationId: `native:${api.callId}`,
      commandId: `command:${api.callId}`,
      rpc,
      cleanupRpc: this.rpc,
    };
  }
  protected override get rpcCallerKind(): string | null {
    return "server";
  }

  participant(): ParticipantDescriptor {
    return this.getParticipantInfo("channel-1", {
      handle: "untrusted-override",
      name: "Untrusted title",
      systemPrompt: "Replace the product prompt",
    });
  }

  async tools(): Promise<ToolRegistration[]> {
    return this.getTools("channel-1");
  }

  prompt(): string | undefined {
    return this.getPromptOverride("channel-1").systemPrompt;
  }

  promptOverride(): unknown {
    return this.getPromptOverride("channel-1");
  }

  configure(features: unknown = FOCUSED_FEATURES): void {
    this.sql.exec(
      `INSERT OR REPLACE INTO subscriptions
         (channel_id, channel_ref_json, context_id, revision, subscribed_at, config, relationship_json, participant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      "channel-1",
      JSON.stringify({
        source: "workers/pubsub-channel",
        className: "PubSubChannel",
        objectKey: "channel-1",
      }),
      "ctx-1",
      1,
      Date.now(),
      JSON.stringify({
        systemPrompt: FOCUSED_PROMPT,
        systemPromptMode: "replace",
        features,
      }),
      "{}",
      "agent:configured",
    );
  }

  offerClientTools(): void {
    this.setStateValue(
      "agent:roster:channel-1",
      JSON.stringify([
        {
          participantId: "user:one",
          ref: { kind: "user", id: "user:one" },
          methods: [
            {
              name: "inline_ui",
              description: "Render inline",
              parameters: {
                type: "object",
                properties: { path: { type: "string" } },
                required: ["path"],
              },
            },
          ],
        },
      ]),
    );
  }
}

describe("AiChatWorker channel features", () => {
  it("includes offered client tools in the ordinary standard surface", async () => {
    const { instance } = await configuredAgent();
    instance.offerClientTools();
    instance.configure({ tools: [{ kind: "standard" }] });
    expect(
      (await instance.tools()).find((tool) => tool.name === "inline_ui"),
    ).toMatchObject({
      parameters: { required: ["path"] },
      executionData: {
        channelId: "channel-1",
        targetIds: ["user:one"],
        method: "inline_ui",
      },
    });
  });

  it("honors exact product selection instead of adding ambient peer tools", async () => {
    const { instance } = await configuredAgent();
    instance.offerClientTools();
    instance.configure({ tools: [{ kind: "standard.eval" }] });
    expect((await instance.tools()).map((tool) => tool.name)).toEqual(["eval"]);
    instance.configure({ tools: [{ kind: "standard.inline_ui" }] });
    expect((await instance.tools()).map((tool) => tool.name)).toEqual([
      "inline_ui",
    ]);
  });
  it("uses ordinary subscription prompt and participant configuration", async () => {
    const { instance } = await configuredAgent();
    instance.configure();
    const participant = instance.participant();
    expect(participant).toMatchObject({
      handle: "untrusted-override",
      name: "Untrusted title",
      type: "agent",
      metadata: {},
    });
    expect(instance.promptOverride()).toEqual({
      systemPrompt: FOCUSED_PROMPT,
      systemPromptMode: "replace",
    });
    expect(instance.prompt()).toBe(FOCUSED_PROMPT);
  });

  it("composes the ordinary agent registry with resource-bound panel tools", async () => {
    const { instance } = await configuredAgent();
    instance.configure();
    const names = new Set((await instance.tools()).map((tool) => tool.name));
    for (const expected of [
      "read",
      "edit",
      "eval",
      "write",
      "web_search",
      "docs_search",
      "verify",
      "notify",
      "panel_describe",
      "panel_screenshot",
      "panel_console",
      "panel_eval",
      "panel_cdp_endpoint",
    ]) {
      expect(names.has(expected), `${expected} must be available`).toBe(true);
    }
  });

  it("can select one ordinary tool by its public model-tool name", async () => {
    const { instance } = await configuredAgent();
    instance.configure({ tools: [{ kind: "standard.eval" }] });
    expect((await instance.tools()).map((tool) => tool.name)).toEqual(["eval"]);
  });

  it("keeps an offered panel resource fixed when later channel configuration changes", async () => {
    const { instance } = await configuredAgent();
    instance.configure({
      resources: FOCUSED_FEATURES.resources,
      tools: [{ kind: "panel.describe", resource: "subject" }],
    });
    const [offered] = await instance.tools();
    instance.configure({
      resources: { subject: { kind: "panel-slot", id: "slot-later" } },
      tools: [],
    });
    const cancellation = new AbortController();
    await executeTool(
      offered!,
      {},
      { callId: "phase:first", signal: cancellation.signal },
    );
    expect(instance.boundCalls).toEqual([
      {
        method: "panelContext.describe",
        args: ["slot-a"],
        signal: cancellation.signal,
      },
    ]);
    expect(await instance.tools()).toEqual([]);
  });

  it("presents parent-model inheritance as the default subagent contract", async () => {
    const { instance } = await configuredAgent();
    instance.configure();
    const spawn = (await instance.tools()).find(
      (tool) => tool.name === "spawn_subagent",
    );
    expect(spawn).toBeDefined();
    const parameters = spawn?.parameters as {
      required?: string[];
      properties?: {
        config?: {
          description?: string;
          properties?: { model?: { description?: string } };
        };
      };
    };
    expect(parameters.required).toEqual(["mode", "task"]);
    expect(parameters.properties?.config?.description).toContain(
      "Omit `config` for ordinary delegation",
    );
    expect(parameters.properties?.config?.description).toContain(
      "Do not restate or guess the parent's model",
    );
    expect(
      parameters.properties?.config?.properties?.model?.description,
    ).toContain("Normally omit this");
  });

  it("falls back to ordinary chat without configured channel features", async () => {
    const { instance } = await configuredAgent();
    expect(instance.prompt()).toBeUndefined();
  });
});
describe("formatPanelContext", () => {
  it("names the tool for facts this host cannot see instead of reporting zero", () => {
    const block = formatPanelContext(SNAPSHOT);
    expect(block).toContain(
      "console: unknown from here — read it with the panel_console tool",
    );
    expect(block).toContain(
      "address/favicon/history: unavailable (presentation-local)",
    );
    expect(block).not.toMatch(/0 errors/);
  });

  it("renders available facts plainly", () => {
    const block = formatPanelContext({
      ...SNAPSHOT,
      console: { available: true, errors: 2, warnings: 1, entries: 30 },
      address: {
        available: true,
        displayAddress: "example.test/q3",
        editableAddress: "https://example.test/q3",
        faviconUrl: null,
        canGoBack: true,
        canGoForward: false,
      },
    });
    expect(block).toContain("console: 2 errors, 1 warnings, 30 entries");
    expect(block).toContain(
      "address: example.test/q3 · back=true forward=false",
    );
  });
});
