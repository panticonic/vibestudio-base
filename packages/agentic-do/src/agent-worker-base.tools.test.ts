import { afterEach, describe, expect, it, vi } from "vitest";
import { schemaRpcClient, wireClientFor } from "@vibestudio/rpc/internal";

import { createNativeVesselTestDO } from "./testing/native-vessel.js";
import type { ParticipantDescriptor } from "@workspace/harness";
import type { JsonValue } from "@panticonic/pi-chord";
import type { ResolveAddresseeContext } from "@workspace/agentic-protocol";
import type { Context } from "@panticonic/pi-chord";
import {
  withRpcAbortSignal,
  type RpcClient,
  type RpcCallOptions,
} from "@vibestudio/rpc";
import {
  executeTool,
  nativeToolContext,
  toolResultDetails,
} from "@workspace/harness/testing/native-tool";
import { AgentWorkerBase, hasAskableUser } from "./agent-worker-base.js";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";

describe("agent loop tool availability", () => {
  it("offers ask_user only when the channel has a canonical user participant", () => {
    expect(
      hasAskableUser([
        { ref: { kind: "headless" } },
        { ref: { kind: "agent" } },
      ]),
    ).toBe(false);
    expect(
      hasAskableUser([
        { ref: { kind: "headless" } },
        { ref: { kind: "user" } },
      ]),
    ).toBe(true);
  });
});

describe("conversation address discovery", () => {
  const databases = new Set<{ close(): void }>();
  afterEach(() => {
    for (const database of databases) database.close();
    databases.clear();
  });
  function detailsRecord(value: JsonValue): Record<string, JsonValue> {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new Error("Expected actual native tool object details");
    return value;
  }
  class DiscoveryAgent extends AgentWorkerBase {
    protected override getParticipantInfo(): ParticipantDescriptor {
      return {
        name: "Discovery agent",
        handle: "discovery",
        type: "agent",
        metadata: {},
      };
    }

    readonly local: ResolveAddresseeContext = {
      channelId: "current",
      roster: [
        {
          id: "participant-one",
          kind: "agent",
          metadata: { handle: "helper" },
          displayName: "Helper",
        },
      ],
      parent: { participantId: "supervisor-one" },
      runs: [
        {
          runId: "child-one",
          runRef: "@s1",
          taskChannelId: "child-channel",
          status: "running",
        },
      ],
    };
    readonly conversation = vi.fn(() => this.local);
    readonly global = vi.fn(async () => ({
      ...this.local,
      directory: [
        {
          instanceId: "unrelated",
          channelId: "foreign",
          handle: "unrelated",
          participantId: "foreign-participant",
        },
      ],
    }));
    readonly search = vi.fn(async () => ({
      summary: { rows: 1, running: 1, terminal: 0 },
      entries: [
        {
          instanceId: "instance-archivist",
          ref: "agent:archivist@foreign",
          channelId: "foreign",
          participantId: "agent:archivist",
          kind: "agent",
          status: "running",
          handle: "archivist",
          displayName: "Archivist",
          description: null,
          parentInstanceId: null,
          runId: null,
          workerId: null,
          ownerUserId: null,
          statusEventId: null,
          lastActivityAt: null,
          summary: null,
        },
      ],
    }));
    readonly rpcCalls: Array<{
      target: string;
      method: string;
      args: unknown[];
      signal?: AbortSignal;
    }> = [];
    protected override conversationAddresseeContext(
      channelId: string,
    ): ResolveAddresseeContext {
      expect(channelId).toBe("current");
      return this.conversation();
    }
    protected override async addresseeContext(): Promise<ResolveAddresseeContext> {
      return this.global();
    }
    protected override get rpc(): RpcClient {
      const base = super.rpc;
      const wire = wireClientFor(base);
      return schemaRpcClient({
        ...wire,
        call: async (
          destination: string,
          method: string,
          args: unknown[],
          options?: RpcCallOptions,
        ) => {
          options?.signal?.throwIfAborted();
          this.rpcCalls.push({
            target: destination,
            method,
            args,
            signal: options?.signal,
          });
          if (destination === "main" && method === "workers.resolveService") {
            return durableObjectServiceFixture(
              "do:workers/workspace-source:GadWorkspaceDO:workspace",
              {
                source: "workers/workspace-source",
                className: "GadWorkspaceDO",
                objectKey: "workspace",
              },
            );
          }
          if (
            destination ===
              "do:workers/workspace-source:GadWorkspaceDO:workspace" &&
            method === "searchAgentDirectory"
          )
            return await this.search();
          return wire.call(destination, method, args, options);
        },
      });
    }
    discovery(context: Context) {
      if (!context.abortSignal)
        throw new Error(
          "Discovery unit fixture requires its actual execution signal",
        );
      return this.createDiscoveryTools(
        "current",
        withRpcAbortSignal(this.rpc, context.abortSignal),
      );
    }
  }
  async function tools() {
    const fixture = await createNativeVesselTestDO(DiscoveryAgent);
    databases.add(fixture.db);
    const cancellation = new AbortController();
    return {
      conversation: fixture.instance.conversation,
      global: fixture.instance.global,
      search: fixture.instance.search,
      instance: fixture.instance,
      tools: fixture.instance.discovery(nativeToolContext(cancellation.signal)),
      signal: cancellation.signal,
    };
  }

  it("enumerates the bound conversation and owned relationships without consulting the workspace directory", async () => {
    const f = await tools();
    const tool = f.tools.find((x) => x.name === "list_addressees")!;
    const result = await executeTool(tool, {}, { signal: f.signal });
    expect(detailsRecord(toolResultDetails(result))["addressees"]).toEqual([
      {
        ref: "(omit `to`)",
        kind: "channel",
        note: "everyone in this conversation",
      },
      { ref: "@helper", kind: "agent", note: "Helper" },
      { ref: "parent", kind: "supervisor", note: "the agent that spawned you" },
      {
        ref: "run:@s1",
        kind: "subagent run",
        note: "running · child-channel",
      },
    ]);
    expect(f.global).not.toHaveBeenCalled();
    expect(f.search).not.toHaveBeenCalled();
    expect(JSON.parse(JSON.stringify(tool.parameters))).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false,
    });
  });

  it("uses an explicit purpose search to discover an agent elsewhere", async () => {
    const f = await tools();
    const tool = f.tools.find((x) => x.name === "discover_agents")!;
    const result = await executeTool(
      tool,
      { query: "archivist" },
      { signal: f.signal },
    );
    expect(f.search).toHaveBeenCalledTimes(1);
    expect(f.instance.rpcCalls).toEqual([
      {
        target: "main",
        method: "workers.resolveService",
        args: ["vibestudio.gad.workspace.v1", null],
        signal: f.signal,
      },
      {
        target: "do:workers/workspace-source:GadWorkspaceDO:workspace",
        method: "searchAgentDirectory",
        args: [{ query: "archivist" }],
        signal: f.signal,
      },
    ]);
    expect(detailsRecord(toolResultDetails(result))["entries"]).toEqual([
      {
        instanceId: "instance-archivist",
        ref: "agent:archivist@foreign",
        channelId: "foreign",
        participantId: "agent:archivist",
        kind: "agent",
        status: "running",
        handle: "archivist",
        displayName: "Archivist",
        description: null,
        parentInstanceId: null,
        runId: null,
        workerId: null,
        ownerUserId: null,
        statusEventId: null,
        lastActivityAt: null,
        summary: null,
      },
    ]);
    expect(f.conversation).not.toHaveBeenCalled();
  });
});
