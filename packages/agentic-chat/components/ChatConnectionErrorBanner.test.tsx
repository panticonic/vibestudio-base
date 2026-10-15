// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Theme } from "@radix-ui/themes";
import { ChatContext } from "../context/ChatContext";
import type { ChatContextValue } from "../types";
import { ChatConnectionErrorBanner } from "./ChatConnectionErrorBanner";

afterEach(cleanup);

function renderBanner(connectionError: ChatContextValue["connectionError"]) {
  const retryConnection = vi.fn();
  const dismissConnectionError = vi.fn();
  const value = {
    connectionError,
    status: "Connected",
    retryConnection,
    dismissConnectionError,
  } as unknown as ChatContextValue;
  render(
    <Theme>
      <ChatContext.Provider value={value}>
        <ChatConnectionErrorBanner />
      </ChatContext.Provider>
    </Theme>
  );
  return { retryConnection, dismissConnectionError };
}

describe("ChatConnectionErrorBanner", () => {
  it("shows what happened and the next step, with the technical text behind Details", () => {
    const { retryConnection } = renderBanner({
      title: "Couldn't open this conversation",
      message: "You may not have access to it, or it was removed. Retry, or open another conversation.",
      detail: "AccessDenied: subject lacks channel.read",
      retryable: true,
      at: 1,
    });
    expect(screen.getByText("Couldn't open this conversation")).toBeTruthy();
    expect(screen.getByText(/open another conversation/)).toBeTruthy();
    expect(screen.getByText("Details")).toBeTruthy();
    expect(screen.getByText("AccessDenied: subject lacks channel.read")).toBeTruthy();
    fireEvent.click(screen.getByText("Retry"));
    expect(retryConnection).toHaveBeenCalledOnce();
  });

  it("does not offer a reconnect when rejoining cannot help", () => {
    renderBanner({
      title: "Couldn't stop the agent",
      message: "The agent didn't respond and may still be working. Try stopping it again.",
      retryable: false,
      at: 1,
    });
    expect(screen.getByText("Couldn't stop the agent")).toBeTruthy();
    expect(screen.queryByText("Retry")).toBeNull();
    expect(screen.queryByText("Details")).toBeNull();
  });
});
