import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  launchAgentIntoChannel: vi.fn(),
  unsubscribeAgentFromChannel: vi.fn(),
  withWorkspaceReviewRetry: vi.fn(),
  call: vi.fn(),
  resolveService: vi.fn(),
}));

vi.mock("@workspace/runtime", () => ({
  contextId: "context-default",
  rpc: { call: mocks.call },
  workers: { resolveService: mocks.resolveService },
}));

vi.mock("@workspace/agentic-core/agent-launch", () => ({
  launchAgentIntoChannel: mocks.launchAgentIntoChannel,
  unsubscribeAgentFromChannel: mocks.unsubscribeAgentFromChannel,
}));
vi.mock("@workspace/agentic-core/provisional-agent-lifecycle", () => ({
  withWorkspaceReviewRetry: mocks.withWorkspaceReviewRetry,
}));

import { addAgentToChannel, agentObjectKey } from "./index.js";
import { createChannelMembershipServices } from "./channelMembershipBinding.js";
import { channelClientRpcMethods } from "@workspace/pubsub/rpc-contract";
import type { ChannelAgentRequest } from "./channel-membership/types.js";

describe("addAgentToChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withWorkspaceReviewRetry.mockImplementation(
      async (operation: () => Promise<unknown>) => operation(),
    );
    mocks.launchAgentIntoChannel.mockResolvedValue({
      handle: { targetId: "do:explorer" },
      subscription: { ok: true, participantId: "participant-explorer" },
      contextId: "context-default",
    });
  });

  it("derives one stable agent entity per handle and channel", () => {
    expect(agentObjectKey(" explorer ", " channel-1 ")).toBe(
      "explorer-channel-1",
    );
  });

  it("delegates creation, subscription, and approval retry to the canonical lifecycle", async () => {
    await expect(
      addAgentToChannel({
        source: "workers/explorer-agent",
        className: "ExplorerAgentWorker",
        handle: "explorer",
        name: "Explorer",
        channelId: "channel-1",
        config: {
          handle: "wrong-handle",
          name: "Wrong name",
          respondPolicy: "mentioned-strict",
        },
        waitForReview: async () => undefined,
      }),
    ).resolves.toEqual({
      ok: true,
      channelId: "channel-1",
      contextId: "context-default",
      targetId: "do:explorer",
      participantId: "participant-explorer",
      key: "explorer-channel-1",
    });

    expect(mocks.launchAgentIntoChannel).toHaveBeenCalledWith(
      expect.objectContaining({ call: expect.any(Function) }),
      {
        source: "workers/explorer-agent",
        className: "ExplorerAgentWorker",
        key: "explorer-channel-1",
        channelId: "channel-1",
        contextId: "context-default",
        config: {
          handle: "explorer",
          name: "Explorer",
          respondPolicy: "mentioned-strict",
        },
      },
    );
    expect(mocks.withWorkspaceReviewRetry).toHaveBeenCalledOnce();
  });

  it("launches directly when the product has no review adapter", async () => {
    await addAgentToChannel({
      source: "workers/explorer-agent",
      className: "ExplorerAgentWorker",
      handle: "explorer",
      channelId: "channel-1",
    });

    expect(mocks.launchAgentIntoChannel).toHaveBeenCalledOnce();
    expect(mocks.withWorkspaceReviewRetry).not.toHaveBeenCalled();
  });
});

describe("Natlang channel membership service", () => {
  const source = "workers/agent-worker";
  const className = "AiChatWorker";
  const participantId = `do:${source}:${className}:reviewer-chat-1`;
  const assignment: ChannelAgentRequest = {
    goal: "Attach the local reviewer",
    channelId: "chat-1",
    contextId: "context-default",
    handle: "reviewer",
    action: "attach",
    options: {
      modelRef: "local:lfm3-1.7b",
      response: "mentioned-strict",
      replay: true,
    },
  };
  const participant = {
    participantId,
    metadata: { type: "agent", handle: assignment.handle },
  };
  let context: string;
  let roster: unknown[];

  beforeEach(() => {
    vi.clearAllMocks();
    context = assignment.contextId;
    roster = [];
    mocks.resolveService.mockResolvedValue({
      kind: "durable-object",
      targetId: "channel-target",
    });
    mocks.call.mockImplementation(async (_target, method) =>
      method === channelClientRpcMethods.getContextId ? context : roster,
    );
    mocks.launchAgentIntoChannel.mockImplementation(async () => {
      roster = [participant];
      return {
        handle: { targetId: participantId },
        subscription: { ok: true, participantId },
        contextId: context,
      };
    });
    mocks.unsubscribeAgentFromChannel.mockImplementation(async () => {
      roster = [];
      return { ok: true };
    });
  });

  it("uses the channel's canonical roster and forwards the exact attachment settings", async () => {
    const { channelAgentRead, channelAgentAttach } =
      createChannelMembershipServices(assignment, { source, className });
    await expect(channelAgentRead.read(assignment)).resolves.toMatchObject({
      state: "absent",
    });
    await expect(
      channelAgentAttach.attach(assignment, assignment.options!),
    ).resolves.toEqual({
      outcome: "acknowledged",
      participantId,
    });
    await expect(channelAgentRead.read(assignment)).resolves.toEqual({
      state: "member",
      participantId,
    });
    expect(mocks.resolveService).toHaveBeenCalledWith(
      "vibestudio.channel.v1",
      assignment.channelId,
    );
    expect(mocks.call).toHaveBeenCalledWith(
      "channel-target",
      channelClientRpcMethods.getParticipants,
      [],
    );
    expect(mocks.launchAgentIntoChannel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source,
        className,
        key: "reviewer-chat-1",
        replay: true,
        config: {
          handle: "reviewer",
          model: assignment.options?.modelRef,
          respondPolicy: "mentioned-strict",
        },
      }),
    );
  });

  it("holds for a changed context or an existing handle owned by another worker", async () => {
    const { channelAgentRead, channelAgentAttach } =
      createChannelMembershipServices(assignment, { source, className });
    context = "fork";
    await expect(channelAgentRead.read(assignment)).resolves.toMatchObject({
      state: "unavailable",
    });
    context = assignment.contextId;
    roster = [
      {
        ...participant,
        participantId: "do:workers/different:Agent:reviewer-chat-1",
      },
    ];
    await expect(channelAgentRead.read(assignment)).resolves.toMatchObject({
      state: "conflict",
    });
    await expect(
      channelAgentAttach.attach(assignment, assignment.options!),
    ).resolves.toMatchObject({ outcome: "blocked" });
    expect(mocks.launchAgentIntoChannel).not.toHaveBeenCalled();
  });

  it("removes the existing agent's channel-local key", async () => {
    const request: ChannelAgentRequest = {
      ...assignment,
      action: "detach",
      options: null,
    };
    roster = [participant];
    const { channelAgentRead, channelAgentDetach } =
      createChannelMembershipServices(request, { source, className });
    await expect(channelAgentDetach.detach(request)).resolves.toMatchObject({
      outcome: "acknowledged",
    });
    await expect(channelAgentRead.read(request)).resolves.toMatchObject({
      state: "absent",
    });
    expect(mocks.unsubscribeAgentFromChannel).toHaveBeenCalledWith(
      expect.anything(),
      {
        source,
        className,
        channelId: request.channelId,
        key: "reviewer-chat-1",
      },
    );
  });
});
