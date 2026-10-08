// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { describe, expect, it, vi } from "vitest";
import { ActionButton, useResponseActions } from "@workspace/ui/response";
import type { ChatContextValue, ChatInputContextValue } from "../types";
import { ChatProvider } from "./ChatProvider";

describe("ChatProvider response actions", () => {
  it("sends catalog controls as user messages, carrying interaction as message metadata", async () => {
    const send = vi.fn(async () => undefined);
    const value = { chat: { send } } as unknown as ChatContextValue;
    render(
      <Theme>
        <ChatProvider value={value} inputValue={{} as ChatInputContextValue}>
          <ActionButton message="Plain" />
          <ActionButton message="Approve" id="plan" action="approve" />
        </ChatProvider>
      </Theme>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Plain" }));
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    });
    expect(send).toHaveBeenNthCalledWith(1, "Plain", undefined);
    expect(send).toHaveBeenNthCalledWith(2, "Approve", {
      metadata: {
        interaction: { source: "action-button", kind: "action", action: "approve", targetId: "plan" },
      },
    });
  });

  it("derives answered state from interactions in the transcript messages", () => {
    const value = {
      chat: { send: vi.fn() },
      messages: [
        { id: "a", senderId: "u", content: "Pick? → Old", interaction: { source: "choices", kind: "choice", action: "submit", targetId: "pick", values: ["Old"] } },
        { id: "b", senderId: "u", content: "Pick? → Red, Blue", interaction: { source: "choices", kind: "choice", action: "submit", targetId: "pick", values: ["Red", "Blue"] } },
        { id: "c", senderId: "u", content: "Approve", interaction: { source: "action-button", kind: "action", action: "approve", targetId: "plan" } },
        { id: "d", senderId: "u", content: "plain" },
      ],
    } as unknown as ChatContextValue;
    let seen: ReturnType<NonNullable<ReturnType<typeof useResponseActions>>["answer"]>[] = [];
    function Probe() {
      const actions = useResponseActions()!;
      seen = [actions.answer("choices", "pick"), actions.answer("action-button", "plan"), actions.answer("choices", "plan")];
      return null;
    }
    render(
      <Theme>
        <ChatProvider value={value} inputValue={{} as ChatInputContextValue}>
          <Probe />
        </ChatProvider>
      </Theme>,
    );
    expect(seen).toEqual([{ text: "Pick? → Red, Blue", values: ["Red", "Blue"] }, { text: "Approve" }, undefined]);
  });
});
