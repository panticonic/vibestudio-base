import { describe, expect, it } from "vitest";
import { ChildTranscriptStore } from "@workspace/agentic-core/chat-store";
import {
  appendTrajectoryEventsAndBroadcast,
  assistantMessage,
  createTranscriptHarness,
} from "./transcriptTestHarness.js";

async function until(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("condition not reached");
}

describe("ChildTranscriptStore", () => {
  it("replays the child channel into its transcript and follows live messages", async () => {
    const harness = await createTranscriptHarness("child-transcript-store");
    await appendTrajectoryEventsAndBroadcast(harness, [
      assistantMessage("child-history", "History before observing"),
    ]);
    // Each observer attempt claims a fresh participant id. Production panels
    // are admitted as their verified human account; this fixture has no user,
    // so the channel caller is the attempt's own participant id, read lazily.
    let caller = "panel:parent";
    const inner = harness.createParticipantRpc({
      get id() {
        return caller;
      },
      name: "Parent",
      type: "panel",
      handle: "parent",
    });
    const claim = (args: unknown) => {
      const found = JSON.stringify(args ?? null).match(/panel:parent:observe:[^"]+/);
      if (found) caller = found[0];
    };
    const rpc = {
      ...inner,
      call: (target: string, method: unknown, args: unknown, options?: unknown) => {
        claim(args);
        return (inner.call as (...values: unknown[]) => unknown)(target, method, args, options);
      },
      stream: (target: string, method: unknown, args: unknown, options?: unknown) => {
        claim(args);
        return (inner.stream as (...values: unknown[]) => unknown)(target, method, args, options);
      },
    };
    const store = new ChildTranscriptStore({
      connection: {
        config: { clientId: "panel:parent", rpc: rpc as never },
        metadata: { name: "Parent", type: "panel" },
      },
      channelId: harness.channelId,
      contextId: "ctx-transcript-pipeline",
    });
    expect(store.getSnapshot().loading).toBe(true);
    // Two holders (the collapsed card and its expanded transcript) share one observer.
    const releaseCard = store.retain();
    const releaseTranscript = store.retain();
    try {
      await until(() => !store.getSnapshot().loading);
      const settled = store.getSnapshot();
      expect(settled.error).toBeNull();
      expect(settled.selfId).toMatch(/^panel:parent:observe:child-transcript-store:\d+$/);
      await until(() =>
        store.getSnapshot().messages.some((message) => message.id === "child-history")
      );

      await appendTrajectoryEventsAndBroadcast(harness, [
        assistantMessage("child-live", "Live after observing"),
      ]);
      await until(() =>
        store.getSnapshot().messages.some((message) => message.id === "child-live")
      );
      const history = store.getSnapshot().messages.find((message) => message.id === "child-history");
      expect(history?.content).toBe("History before observing");
    } finally {
      releaseTranscript();
      releaseCard();
      store.dispose();
    }
  });
});
