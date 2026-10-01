// @vitest-environment jsdom
import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createTranscriptHarness } from "../transcriptTestHarness.js";
import { useChatCore, type ChatCoreState } from "./useChatCore.js";

const projection = vi.hoisted(() => ({ replay: vi.fn() }));
vi.mock("../useChannelMessages.js", () => ({
  useChannelMessages: () => ({
    messages: [],
    actionBar: null,
    messageTypes: [],
    hasMoreHistory: false,
    loadingMore: false,
    hasOpenTurn: false,
    loadEarlierMessages: vi.fn(),
    backfillAfterLocalPublish: projection.replay,
    replaySettled: true,
  }),
}));
afterEach(() => vi.clearAllMocks());

function Probe({
  harness,
  onValue,
}: {
  harness: Awaited<ReturnType<typeof createTranscriptHarness>>;
  onValue(core: ChatCoreState): void;
}) {
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
    contextId: "ctx-send",
    metadata: { name: "User", type: "panel", handle: "alice" },
  });
  onValue(core);
  useEffect(() => {
    void core.connectToChannel({
      channelId: core.channelName,
      methods: {},
      contextId: "ctx-send",
    });
    // This probe represents one panel mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

it("keeps an accepted send out of the composer and surfaces the original projection failure", async () => {
  const harness = await createTranscriptHarness("accepted-send-projection");
  let latest!: ChatCoreState;
  const view = render(
    <Probe
      harness={harness}
      onValue={(core) => {
        latest = core;
      }}
    />
  );
  try {
    await waitFor(() => expect(latest.clientRef.current).not.toBeNull());
    const failure = new Error("Replay connection lost");
    projection.replay.mockRejectedValueOnce(failure);
    const send = vi
      .spyOn(latest.clientRef.current!, "send")
      .mockResolvedValue({ messageId: "accepted", pubsubId: 42 });
    act(() => latest.handleInputChange("Send this once"));
    await act(async () => {
      await latest.sendMessage();
    });
    expect(send).toHaveBeenCalledOnce();
    expect(latest.input).toBe("");
    expect(latest.pendingSendCount).toBe(0);
    expect(latest.connectionError).toMatchObject({ cause: failure });
    expect(latest.connectionError?.message).toContain("server accepted the change");
    await act(async () => {
      await latest.sendMessage();
    });
    expect(send).toHaveBeenCalledOnce();
  } finally {
    view.unmount();
  }
});

it("retains a newer draft when submission itself fails", async () => {
  const harness = await createTranscriptHarness("failed-send-newer-draft");
  let latest!: ChatCoreState;
  const view = render(
    <Probe
      harness={harness}
      onValue={(core) => {
        latest = core;
      }}
    />
  );
  try {
    await waitFor(() => expect(latest.clientRef.current).not.toBeNull());
    let reject!: (error: Error) => void;
    vi.spyOn(latest.clientRef.current!, "send").mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      })
    );
    act(() => latest.handleInputChange("Original draft"));
    let sending!: Promise<void>;
    act(() => {
      sending = latest.sendMessage();
    });
    act(() => latest.handleInputChange("New draft"));
    const failure = new Error("Publication rejected");
    await act(async () => {
      const assertion = expect(sending).rejects.toBe(failure);
      reject(failure);
      await assertion;
    });
    expect(latest.input).toBe("New draft\n\nOriginal draft");
    expect(latest.pendingSendCount).toBe(0);
  } finally {
    view.unmount();
  }
});
