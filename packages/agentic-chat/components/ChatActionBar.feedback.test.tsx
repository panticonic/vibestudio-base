// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Stats } from "@workspace/ui/response";

const chatContext = vi.hoisted(() => ({
  chat: { publish: vi.fn(async () => undefined) },
  scope: {},
  scopes: {},
  scopeManager: {
    persist: vi.fn(async () => undefined),
    onChange: vi.fn(() => () => undefined),
  },
  onActionBarMaxHeightChange: undefined,
  actionBar: null as unknown,
}));

vi.mock("../context/ChatContext", () => ({
  useChatContext: () => chatContext,
}));
vi.mock("../utils/wrapSandboxApis", () => ({
  wrapChatForErrorReporting: (chat: unknown) => chat,
  wrapScopesForErrorReporting: (scopes: unknown) => scopes,
}));

import { ChatActionBar } from "./ChatActionBar";

const author = { kind: "agent", id: "agent:author" };
const data = {
  id: "bar-1",
  source: { type: "file" as const, path: "bars/Bar.tsx" },
};

function publishedPayloads() {
  return chatContext.chat.publish.mock.calls.map(
    (call) => (call as unknown as [string, { payload: Record<string, unknown> }])[1].payload,
  );
}

describe("ChatActionBar ui.feedback", () => {
  it("reports a compile failure to the recorded author and offers no manual button", async () => {
    chatContext.chat.publish.mockClear();
    chatContext.actionBar = {
      data: { ...data, author },
      component: { cacheKey: "k", error: "Unexpected token" },
    };
    const view = render(<ChatActionBar />);
    await waitFor(() => expect(chatContext.chat.publish).toHaveBeenCalledTimes(1));
    expect(publishedPayloads()[0]).toMatchObject({
      category: "compile_failed",
      target: { kind: "agent", id: "agent:author" },
      refs: { actionBarId: "bar-1" },
    });
    expect(view.queryByText("Report to Agent")).toBeNull();
  });

  it("reports rejected catalog props", async () => {
    chatContext.chat.publish.mockClear();
    chatContext.actionBar = {
      data: { ...data, author },
      component: { cacheKey: "k", Component: () => <Stats items={"nope" as never} /> },
    };
    render(<ChatActionBar />);
    await waitFor(() => expect(chatContext.chat.publish).toHaveBeenCalledTimes(1));
    expect(publishedPayloads()[0]).toMatchObject({
      category: "props_invalid",
      refs: { actionBarId: "bar-1", component: "Stats" },
    });
  });

  it("sends nothing when the bar has no agent author", async () => {
    chatContext.chat.publish.mockClear();
    chatContext.actionBar = {
      data,
      component: { cacheKey: "k", error: "Unexpected token" },
    };
    const view = render(<ChatActionBar />);
    await waitFor(() => expect(view.getAllByText(/Unexpected token/).length).toBeGreaterThan(0));
    expect(chatContext.chat.publish).not.toHaveBeenCalled();
  });
});
