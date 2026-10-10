// @vitest-environment jsdom

import { channelClientRpcMethods } from "@workspace/pubsub/rpc-contract";
import { useEffect } from "react";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useChatCore, type ChatCoreState } from "./useChatCore.js";
import { createTranscriptHarness } from "../__tests__/transcriptTestHarness.js";

function SeedProbe({
  harness,
  onValue,
}: {
  harness: Awaited<ReturnType<typeof createTranscriptHarness>>;
  onValue: (value: ChatCoreState) => void;
}) {
  const config = {
    seed: {
      messages: [
        { author: "Introduction", content: "Welcome before credentials" },
      ],
      openingRequest: "Help me get started",
    },
  };
  const core = useChatCore({
    config: {
      clientId: "panel:chat",
      rpc: harness.createParticipantRpc({
        id: "panel:chat",
        name: "User",
        type: "panel",
        handle: "alice",
      }) as never,
    },
    channelName: harness.channelId,
    metadata: { name: "User", type: "panel", handle: "alice" },
  });
  onValue(core);
  useEffect(() => {
    void core.connectToChannel({
      channelId: harness.channelId,
      contextId: "ctx-seed",
      methods: {},
      channelConfig: config,
    });
    return () => {
      void core.clientRef.current?.close();
    };
  }, []);
  return null;
}
describe("useChatCore conversation seed", () => {
  it("publishes the retained opening request live, once, after a real agent relationship joins", async () => {
    const harness = await createTranscriptHarness("chat-core-seed-live");
    let latest: ChatCoreState | undefined;
    const panel = render(
      <SeedProbe
        harness={harness}
        onValue={(value) => {
          latest = value;
        }}
      />,
    );
    await waitFor(() =>
      expect(latest?.initialization?.openingRequest).toBe(
        "Help me get started",
      ),
    );
    const agentId = "do:workers/agent-worker:AiChatWorker:seed-test";
    const agentRpc = harness.createParticipantRpc({
      id: agentId,
      name: "Agent",
      type: "agent",
      handle: "agent",
    });
    await agentRpc.call(
      `do:workers/pubsub-channel:PubSubChannel:${harness.channelId}`,
      channelClientRpcMethods.join,
      [
        {
          participantId: agentId,
          operationId: "seed-agent-membership",
          contextId: "ctx-seed",
          metadata: { type: "agent", name: "Agent", handle: "agent" },
          delivery: "all",
          endpoint: { kind: "entity", entityId: agentId, invocation: "direct" },
          applicationConfig: null,
          replay: false,
        },
      ],
    );
    await waitFor(() =>
      expect(latest?.initialization?.firstAgentPending).toBe(false),
    );
    await latest!.clientRef.current!.resolveOpeningRequest("deliver");
    await waitFor(() =>
      expect(latest?.messages).toContainEqual(
        expect.objectContaining({
          content: "Help me get started",
          complete: true,
        }),
      ),
    );
    await latest!.clientRef.current!.resolveOpeningRequest("deliver");
    expect(
      latest?.messages.filter(
        (message) => message.content === "Help me get started",
      ),
    ).toHaveLength(1);
    expect(latest?.initialization?.openingRequest).toBeUndefined();
    await latest!.clientRef.current!.close();
    panel.unmount();
  });
  it("reads authored messages and the pending request without invoking a model or sending on mount", async () => {
    const harness = await createTranscriptHarness("chat-core-seed");
    let latest: ChatCoreState | undefined;
    const first = render(
      <SeedProbe
        harness={harness}
        onValue={(value) => {
          latest = value;
        }}
      />,
    );
    await waitFor(() =>
      expect(latest?.messages).toContainEqual(
        expect.objectContaining({
          content: "Welcome before credentials",
          complete: true,
        }),
      ),
    );
    expect(latest?.initialization).toEqual({
      firstAgentPending: true,
      openingRequest: "Help me get started",
    });
    await latest!.clientRef.current!.resolveOpeningRequest("cancel");
    await waitFor(() =>
      expect(latest?.initialization?.openingRequest).toBeUndefined(),
    );
    await latest!.clientRef.current!.close();
    first.unmount();
    render(
      <SeedProbe
        harness={harness}
        onValue={(value) => {
          latest = value;
        }}
      />,
    );
    await waitFor(() => expect(latest?.connected).toBe(true));
    expect(
      latest?.messages.filter(
        (message) => message.content === "Welcome before credentials",
      ),
    ).toHaveLength(1);
    expect(latest?.initialization?.openingRequest).toBeUndefined();
    await latest!.clientRef.current!.close();
  });
});
