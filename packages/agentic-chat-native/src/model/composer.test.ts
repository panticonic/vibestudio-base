import { describe, expect, it } from "vitest";
import { chatComposerView } from "./composer.js";

describe("chatComposerView", () => {
  it("sends only a non-blank draft on a live connection", () => {
    const base = { connected: true, primaryActionIntent: "send" as const };
    expect(chatComposerView({ ...base, input: "  " }).canSend).toBe(false);
    expect(chatComposerView({ ...base, input: "hi" })).toMatchObject({
      canSend: true,
      disabledReason: null,
      actionLabel: "Send",
    });
  });

  it("explains a disconnect only when there is something to send", () => {
    const base = { connected: false, primaryActionIntent: "send" as const };
    expect(chatComposerView({ ...base, input: "" }).disabledReason).toBeNull();
    const view = chatComposerView({ ...base, input: "hi" });
    expect(view.canSend).toBe(false);
    expect(view.disabledReason).toMatch(/Not connected/);
  });

  it("names the steer and queue intents", () => {
    const base = { connected: true, input: "x" };
    expect(chatComposerView({ ...base, primaryActionIntent: "steer" }).actionLabel).toMatch(/Steer/);
    expect(chatComposerView({ ...base, primaryActionIntent: "queue" }).actionLabel).toMatch(/Queue/);
  });
});
