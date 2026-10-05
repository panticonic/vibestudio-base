import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "@vitest/browser/context";
import { Theme } from "@radix-ui/themes";
import { ChatLayout } from "./ChatLayout";
import { ChatProvider } from "../context/ChatProvider";
import type { ActiveFeedbackSchema } from "@workspace/tool-ui";
import type { ChatContextValue, ChatInputContextValue } from "../types";
import { resolveAgenticChatFeatures } from "../features";
import "@radix-ui/themes/styles.css";
import "@workspace/ui/foundation.css";
import "../styles.css";

afterEach(cleanup);

it("keeps the composer mounted and visible while approvals stack, resize, and resolve", async () => {
  await page.viewport(874, 800);
  const complete = vi.fn();
  const feedback = (callId: string): ActiveFeedbackSchema => ({
    type: "schema",
    callId,
    createdAt: 0,
    values: {},
    title: `Approval ${callId}`,
    fields: [
      {
        key: "command",
        type: "code",
        default: "echo proposed\n".repeat(100),
        language: "bash",
      },
    ],
    submitLabel: `Allow ${callId}`,
    cancelLabel: `Deny ${callId}`,
    complete,
  });
  const context = {
    messages: [],
    dirtyRepoWarnings: new Map(),
    clientRef: { current: null },
    chat: {},
    inlineUiComponents: {},
    messageTypeComponents: {},
    hasMoreHistory: false,
    loadingMore: false,
    connected: true,
    allParticipants: {},
    participants: {},
    selfId: "user-1",
    agentBusy: false,
    hasOpenTurn: false,
    primaryActionIntent: "send",
    flushOutboxAndInterrupt: vi.fn(),
    undoLastAction: vi.fn(),
    pendingSendCount: 0,
    modelCatalog: null,
    onCallMethodResult: vi.fn(async () => ({})),
    activeFeedbacks: new Map(),
    onFeedbackDismiss: vi.fn(),
    onFeedbackError: vi.fn(),
  } as unknown as ChatContextValue;
  const input = {
    input: "Unsent approval draft",
    pendingImages: [],
    onInputChange: vi.fn(),
    onSendMessage: vi.fn(),
    onImagesChange: vi.fn(),
    replyTo: null,
    replyToMessage: null,
    setReplyTo: vi.fn(),
  } as unknown as ChatInputContextValue;
  const content = (
    height: number,
    feedbacks: ReturnType<typeof feedback>[],
  ) => (
    <Theme>
      <ChatProvider
        value={{
          ...context,
          activeFeedbacks: new Map(
            feedbacks.map((item) => [item.callId, item]),
          ),
        }}
        inputValue={input}
      >
        <div data-testid="panel" style={{ height }}>
          <ChatLayout
            features={resolveAgenticChatFeatures(["feedback"])}
            renderHeader={() => (
              <div style={{ height: 40, flexShrink: 0 }}>Header</div>
            )}
            renderEmptyState={() => <div>Transcript</div>}
          />
        </div>
      </ChatProvider>
    </Theme>
  );
  const view = render(content(713, []));
  const textarea = screen.getByPlaceholderText(
    /Type a message/,
  ) as HTMLTextAreaElement;
  fireEvent.input(textarea, { target: { value: input.input } });
  const checkComposer = () => {
    expect(screen.getByPlaceholderText(/Type a message/)).toBe(textarea);
    expect(textarea.value).toBe("Unsent approval draft");
    const bottom = screen.getByTestId("panel").getBoundingClientRect().bottom;
    expect(textarea.getBoundingClientRect().bottom).toBeLessThanOrEqual(bottom);
    expect(
      screen.getByTitle("Send message").getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(bottom);
  };
  const first = feedback("one"),
    second = feedback("two");
  view.rerender(content(713, [first]));
  await expect
    .poll(() => screen.getByRole("button", { name: "Allow one" }))
    .toBeTruthy();
  checkComposer();
  view.rerender(content(713, [first, second]));
  await expect
    .poll(() => screen.getByRole("button", { name: "Allow two" }))
    .toBeTruthy();
  checkComposer();
  const queue = document.querySelector<HTMLElement>(
    "[data-part=chat-feedback]",
  )!;
  expect(queue.scrollHeight).toBeGreaterThan(queue.clientHeight);
  for (const height of [300, 180, 713]) {
    view.rerender(content(height, [first, second]));
    await expect
      .poll(() => screen.getByTestId("panel").getBoundingClientRect().height)
      .toBe(height);
    checkComposer();
  }
  const allow = screen.getByRole("button", { name: "Allow two" });
  allow.scrollIntoView({ block: "nearest" });
  expect(allow.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    queue.getBoundingClientRect().bottom,
  );
  fireEvent.click(allow);
  expect(complete).toHaveBeenCalledWith({
    type: "submit",
    value: expect.any(Object),
  });
  view.rerender(content(713, []));
  expect(document.querySelector("[data-part=chat-feedback]")).toBeNull();
  checkComposer();
});
