// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickfireSkinProvider } from "@workspace/quickfire-core/ui";
import type { QuickfireCard } from "@workspace/quickfire-core";
import type { ChatMessage } from "@workspace/agentic-core";
import { domSkin } from "../testing/domSkin.js";
import type { ChatTranscriptView } from "../model/transcript-view.js";
import { ChatTranscript } from "./ChatTranscript.js";
import { ConversationList } from "./ConversationList.js";

afterEach(cleanup);

function card(overrides: Partial<QuickfireCard>): QuickfireCard {
  return {
    id: "c1",
    kind: "message",
    layout: "speech",
    role: "agent",
    tone: "neutral",
    glyph: "agent",
    title: "Agent",
    meta: null,
    badges: [],
    body: { format: "text", text: "hello there" },
    details: [],
    work: [],
    actions: [],
    busy: false,
    continues: false,
    plainText: "hello there",
    focused: false,
    ...overrides,
  };
}

function view(cards: QuickfireCard[], extra: Partial<ChatTranscriptView> = {}): ChatTranscriptView {
  return { cards, richMessages: new Map(), hasMoreHistory: false, loadingMore: false, ...extra };
}

function renderWithSkin(ui: React.ReactElement) {
  return render(<QuickfireSkinProvider value={domSkin}>{ui}</QuickfireSkinProvider>);
}

describe("ChatTranscript", () => {
  it("draws shared cards", () => {
    renderWithSkin(<ChatTranscript view={view([card({})])} />);
    expect(screen.getByText("hello there")).toBeTruthy();
  });

  it("hands a rich card's message to the injected panel renderer", () => {
    const message = { id: "ui1", contentType: "inline_ui" } as ChatMessage;
    const renderPanelCard = vi.fn(() => <div>panel body</div>);
    renderWithSkin(
      <ChatTranscript
        view={view([card({ id: "ui1", kind: "rich", body: null })], {
          richMessages: new Map([["ui1", message]]),
        })}
        renderPanelCard={renderPanelCard}
      />
    );
    expect(renderPanelCard).toHaveBeenCalledWith({ cardId: "ui1", message });
    expect(screen.getByText("panel body")).toBeTruthy();
  });

  it("leaves a rich card to the shared renderer when no panel renderer is injected", () => {
    renderWithSkin(
      <ChatTranscript view={view([card({ id: "ui1", kind: "rich", title: "Interactive card", body: null })])} />
    );
    expect(screen.getByText("Interactive card")).toBeTruthy();
  });

  it("offers earlier history and reports the press", () => {
    const onLoadEarlier = vi.fn();
    renderWithSkin(
      <ChatTranscript view={view([card({})], { hasMoreHistory: true })} onLoadEarlier={onLoadEarlier} />
    );
    fireEvent.click(screen.getByLabelText("Load earlier messages"));
    expect(onLoadEarlier).toHaveBeenCalledTimes(1);
  });
});

describe("ConversationList", () => {
  const row = (channelId: string, kind: "conversation" | "fork", extra = {}) => ({
    channelId,
    contextId: "ctx",
    title: `Title ${channelId}`,
    kind,
    current: false,
    unread: false,
    ...extra,
  });

  it("opens a row and starts a new chat", () => {
    const onOpen = vi.fn();
    const onNew = vi.fn();
    const rows = [row("a", "conversation"), row("b", "fork", { unread: true })];
    renderWithSkin(
      <ConversationList rows={rows} loading={false} error={null} onOpen={onOpen} onNew={onNew} onRetry={() => {}} />
    );
    fireEvent.click(screen.getByLabelText("Fork: Title b"));
    expect(onOpen).toHaveBeenCalledWith(rows[1]);
    fireEvent.click(screen.getByLabelText("New chat"));
    expect(onNew).toHaveBeenCalled();
    expect(screen.getByText("New")).toBeTruthy();
  });

  it("shows a load failure with a retry", () => {
    const onRetry = vi.fn();
    renderWithSkin(
      <ConversationList rows={[]} loading={false} error="boom" onOpen={() => {}} onNew={() => {}} onRetry={onRetry} />
    );
    expect(screen.getByText("boom")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Retry loading conversations"));
    expect(onRetry).toHaveBeenCalled();
  });
});
