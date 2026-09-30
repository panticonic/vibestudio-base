import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "@vitest/browser/context";
import { Theme } from "@radix-ui/themes";
import { ChatInput } from "./ChatInput";
import { ChatProvider } from "../context/ChatProvider";
import type { ChatContextValue, ChatInputContextValue } from "../types";
import "@radix-ui/themes/styles.css";
import "@workspace/ui/foundation.css";
import "../styles.css";

afterEach(cleanup);

describe("composer panel height", () => {
  it("keeps the draft and send control inside a short panel, then expands with it", async () => {
    await page.viewport(874, 402);
    const context = {
      connected: true, allParticipants: {}, participants: {}, selfId: "user-1",
      agentBusy: false, hasOpenTurn: false, primaryActionIntent: "send",
      flushOutboxAndInterrupt: vi.fn(), undoLastAction: vi.fn(), pendingSendCount: 0,
      modelCatalog: null, onCallMethodResult: vi.fn(async () => ({})),
    } as unknown as ChatContextValue;
    const input = {
      input: "Landscape draft", pendingImages: [], onInputChange: vi.fn(),
      onSendMessage: vi.fn(), onImagesChange: vi.fn(), replyTo: null,
      replyToMessage: null, setReplyTo: vi.fn(),
    } as unknown as ChatInputContextValue;
    const content = (height: number) => (
      <Theme>
        <ChatProvider value={context} inputValue={input}>
          <div className="agentic-chat-root" data-testid="panel" style={{
            height, containerType: "size", display: "flex", flexDirection: "column",
            boxSizing: "border-box", padding: 8, gap: 2,
          }}>
            <div style={{ flex: "1 1 0", minHeight: 0 }} />
            <ChatInput />
          </div>
        </ChatProvider>
      </Theme>
    );
    const view = render(content(70));
    const textarea = screen.getByPlaceholderText(/Type a message/) as HTMLTextAreaElement;
    await expect.poll(() => textarea.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    const panel = screen.getByTestId("panel");
    const shortHeight = textarea.getBoundingClientRect().height;
    const send = screen.getByTitle("Send message");
    expect(textarea.value).toBe("Landscape draft");
    expect(textarea.getBoundingClientRect().bottom).toBeLessThanOrEqual(panel.getBoundingClientRect().bottom);
    expect(send.getBoundingClientRect().bottom).toBeLessThanOrEqual(panel.getBoundingClientRect().bottom);
    view.rerender(content(350));
    await expect.poll(() => textarea.getBoundingClientRect().height).toBeGreaterThan(shortHeight);
    expect(textarea.value).toBe("Landscape draft");
  });
});
