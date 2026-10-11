// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { schemaRpcMock } from "@vibestudio/rpc/test-utils";
import { Theme } from "@radix-ui/themes";
import { Blob as NodeBlob } from "node:buffer";
import { makeTestCatalogEntry } from "@workspace/model-catalog/testing";
import { ChatInput } from "./ChatInput";
import { ChatProvider } from "../context/ChatProvider";
import type {
  ChatContextValue,
  ChatInputContextValue,
  FlushNarration,
  PrimaryActionIntent,
  UndoableAction,
} from "../types";

beforeAll(() => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
});

interface Harness {
  onSendMessage: ReturnType<typeof vi.fn>;
  onInputChange: ReturnType<typeof vi.fn>;
  flushOutboxAndInterrupt: ReturnType<typeof vi.fn>;
  undoLastAction: ReturnType<typeof vi.fn>;
}

function renderInput(
  opts: {
    input?: string;
    agentBusy?: boolean;
    hasOpenTurn?: boolean;
    primaryActionIntent?: PrimaryActionIntent;
    flushNarration?: FlushNarration;
    undoableAction?: UndoableAction;
    pendingSendCount?: number;
    defaultMentions?: readonly string[];
    disabled?: boolean;
    context?: Partial<ChatContextValue>;
    inputContext?: Partial<ChatInputContextValue>;
  } = {},
): Harness {
  const onSendMessage = vi.fn(async () => {});
  const onInputChange = vi.fn();
  const flushOutboxAndInterrupt = vi.fn(async () => {});
  const undoLastAction = vi.fn();

  const ctx = {
    chat: {
      rpc: schemaRpcMock({
        call: vi.fn(async (_target: string, method: string) => {
          if (method === "account.resolveProfiles") return {};
          throw new Error("Unexpected ChatInput RPC");
        }),
      }),
      contextId: "context:chat-input-test",
      channelId: "chat-input-test",
    },
    connected: true,
    allParticipants: {},
    participants: {},
    selfId: "user-1" as ChatContextValue["selfId"],
    agentBusy: opts.agentBusy ?? false,
    hasOpenTurn: opts.hasOpenTurn ?? false,
    primaryActionIntent: opts.primaryActionIntent ?? "send",
    flushOutboxAndInterrupt,
    flushNarration: opts.flushNarration,
    undoableAction: opts.undoableAction,
    undoLastAction,
    pendingSendCount: opts.pendingSendCount ?? 0,
    modelCatalog: null,
    onCallMethodResult: vi.fn(async () => ({})),
    ...opts.context,
  } as unknown as ChatContextValue;

  const inputCtx = {
    input: opts.input ?? "hello",
    pendingImages: [],
    onInputChange,
    onSendMessage,
    onImagesChange: vi.fn(),
    replyTo: null,
    replyToMessage: null,
    setReplyTo: vi.fn(),
    ...opts.inputContext,
  } as unknown as ChatInputContextValue;

  render(
    <Theme>
      <ChatProvider value={ctx} inputValue={inputCtx}>
        <ChatInput
          defaultMentions={opts.defaultMentions}
          disabled={opts.disabled}
        />
      </ChatProvider>
    </Theme>,
  );
  return {
    onSendMessage,
    onInputChange,
    flushOutboxAndInterrupt,
    undoLastAction,
  };
}

function textarea(): HTMLTextAreaElement {
  return screen.getByPlaceholderText(/Type a message/i) as HTMLTextAreaElement;
}

async function keyDown(
  init: KeyboardEventInit & { key: string },
): Promise<void> {
  await act(async () => {
    fireEvent.keyDown(textarea(), init);
  });
}

it("dictates into the draft selection without sending and releases the microphone", async () => {
  const original = {
    MediaRecorder: globalThis.MediaRecorder,
    AudioContext: globalThis.AudioContext,
    OfflineAudioContext: globalThis.OfflineAudioContext,
    Blob: globalThis.Blob,
  };
  const mediaDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    "mediaDevices",
  );
  const stop = vi.fn();
  const track = { stop, onended: null };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  class Recorder {
    state = "inactive";
    mimeType = "audio/test";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["audio"]) });
      this.onstop?.();
    }
  }
  const close = vi.fn(async () => {});
  class Context {
    close = close;
    async decodeAudioData() {
      return { duration: 0.02 };
    }
  }
  class Offline {
    destination = {};
    createBufferSource() {
      return { buffer: null, connect() {}, start() {} };
    }
    async startRendering() {
      return { getChannelData: () => new Float32Array(320) };
    }
  }
  Object.assign(globalThis, {
    MediaRecorder: Recorder,
    AudioContext: Context,
    OfflineAudioContext: Offline,
    Blob: NodeBlob,
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => stream,
      enumerateDevices: async () => [{ kind: "audioinput" }],
    },
  });
  try {
    const rpc = {
      call: vi.fn(async () => ({ ready: true })),
      stream: vi.fn(
        async () => new Response('{"type":"result","text":"Hello."}\n'),
      ),
    };
    const harness = renderInput({
      input: "Before selected after",
      context: {
        chat: {
          rpc,
          contextId: "context",
          channelId: "chat",
        } as unknown as ChatContextValue["chat"],
      },
    });
    textarea().setSelectionRange(7, 15);
    const dictate = await screen.findByRole("button", {
      name: "Dictate",
    });
    await act(async () => fireEvent.click(dictate));
    expect(textarea().readOnly).toBe(true);
    await keyDown({ key: "Enter" });
    expect(harness.onSendMessage).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Stop dictation" })),
    );
    await waitFor(() =>
      expect(harness.onInputChange).toHaveBeenCalledWith("Before Hello. after"),
    );
    expect(harness.onSendMessage).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(textarea().readOnly).toBe(false);
  } finally {
    Object.assign(globalThis, original);
    if (mediaDescriptor)
      Object.defineProperty(navigator, "mediaDevices", mediaDescriptor);
    else Reflect.deleteProperty(navigator, "mediaDevices");
  }
});

describe("ChatInput keyboard shortcuts", () => {
  it("Enter sends with default mode (no after-turn metadata)", async () => {
    const { onSendMessage } = renderInput();
    await keyDown({ key: "Enter" });
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    const [, options] = onSendMessage.mock.calls[0]!;
    expect(options?.metadata?.deliverAfterTurn).toBeUndefined();
  });

  it("routes unaddressed text to product-supplied default recipients", async () => {
    const { onSendMessage } = renderInput({
      input: "Bridge-wide directive",
      defaultMentions: [
        "agent-engineering",
        "agent-navigation",
        "agent-engineering",
      ],
    });

    await keyDown({ key: "Enter" });

    const [, options] = onSendMessage.mock.calls[0]!;
    expect(options?.mentions).toEqual([
      "agent-engineering",
      "agent-navigation",
    ]);
  });

  it("uses explicit mentions instead of product-supplied defaults", async () => {
    const engineering = {
      id: "agent-engineering",
      metadata: { type: "agent", handle: "engineering" },
    };
    const navigation = {
      id: "agent-navigation",
      metadata: { type: "agent", handle: "navigation" },
    };
    const { onSendMessage } = renderInput({
      input: "@engineering take the order",
      defaultMentions: ["agent-engineering", "agent-navigation"],
      context: {
        allParticipants: {
          "agent-engineering": engineering,
          "agent-navigation": navigation,
        } as unknown as ChatContextValue["allParticipants"],
      },
    });

    await keyDown({ key: "Enter" });

    const [, options] = onSendMessage.mock.calls[0]!;
    expect(options?.mentions).toEqual(["agent-engineering"]);
  });

  it("Shift+Enter does NOT send (newline)", async () => {
    const { onSendMessage } = renderInput();
    await keyDown({ key: "Enter", shiftKey: true });
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  // "Send & interrupt" was removed: interrupting is now the separate flush-queue
  // control. Cmd/Ctrl+Enter just sends (default mode), never flushing.
  it("Ctrl+Enter sends (default mode, no interrupt/flush)", async () => {
    const { onSendMessage, flushOutboxAndInterrupt } = renderInput({
      agentBusy: true,
    });
    await keyDown({ key: "Enter", ctrlKey: true });
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    const [, options] = onSendMessage.mock.calls[0]!;
    expect(options?.metadata?.deliverAfterTurn).toBeUndefined();
    expect(flushOutboxAndInterrupt).not.toHaveBeenCalled();
  });

  it("Cmd+Enter (metaKey) also sends (default mode, no flush)", async () => {
    const { onSendMessage, flushOutboxAndInterrupt } = renderInput({
      agentBusy: true,
    });
    await keyDown({ key: "Enter", metaKey: true });
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(flushOutboxAndInterrupt).not.toHaveBeenCalled();
  });

  it("Ctrl+Shift+Enter sends after the turn (deliverAfterTurn metadata)", async () => {
    const { onSendMessage } = renderInput({
      agentBusy: true,
      hasOpenTurn: true,
    });
    await keyDown({ key: "Enter", ctrlKey: true, shiftKey: true });
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    const [, options] = onSendMessage.mock.calls[0]!;
    expect(options?.metadata?.deliverAfterTurn).toBe(true);
  });

  it("Ctrl+Shift+Enter falls back to default send when no turn is open", async () => {
    const { onSendMessage } = renderInput({
      agentBusy: true,
      hasOpenTurn: false,
    });
    await keyDown({ key: "Enter", ctrlKey: true, shiftKey: true });
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    const [, options] = onSendMessage.mock.calls[0]!;
    expect(options?.metadata?.deliverAfterTurn).toBeUndefined();
  });

  it("Escape flushes (advance pipeline) only when composer empty and agent busy", async () => {
    const { flushOutboxAndInterrupt } = renderInput({
      input: "",
      agentBusy: true,
    });
    await keyDown({ key: "Escape" });
    expect(flushOutboxAndInterrupt).toHaveBeenCalledTimes(1);
  });

  it("Escape does NOT flush when the composer has text", async () => {
    const { flushOutboxAndInterrupt } = renderInput({
      input: "draft",
      agentBusy: true,
    });
    await keyDown({ key: "Escape" });
    expect(flushOutboxAndInterrupt).not.toHaveBeenCalled();
  });
});

describe("ChatInput /model command", () => {
  it("preserves current agent behavior settings when switching models", async () => {
    const onReplaceAgent = vi.fn(async () => {});
    const onCallMethodResult = vi.fn(async () => ({
      model: "openai-codex:gpt-5.5",
      thinkingLevel: "max",
      fastMode: true,
      approvalLevel: 1,
      respondPolicy: "from-participants",
      respondFrom: ["user-1"],
    }));
    const modelCatalog = {
      providers: [],
      models: [
        makeTestCatalogEntry({
          ref: "local:lfm2.5-2.6b",
          id: "lfm2.5-2.6b",
          name: "LFM2.5 2.6B",
          provider: "local",
          baseUrl: "http://127.0.0.1:43117/v1",
          auth: "loopback",
          availability: { state: "ready", detail: "running" },
        }),
      ],
    };

    const { onInputChange } = renderInput({
      input: "/model local",
      context: {
        selfId: "user-1" as ChatContextValue["selfId"],
        participants: {
          "agent-1": {
            id: "agent-1",
            metadata: { type: "agent", handle: "ai-chat" },
          },
        } as unknown as ChatContextValue["participants"],
        modelCatalog,
        onReplaceAgent,
        onCallMethodResult,
      },
    });

    await keyDown({ key: "Enter" });

    await waitFor(() => expect(onReplaceAgent).toHaveBeenCalledTimes(1));
    expect(onCallMethodResult).toHaveBeenCalledWith(
      "agent-1",
      "getAgentSettings",
      {},
    );
    expect(onReplaceAgent).toHaveBeenCalledWith("agent-1", undefined, {
      model: "local:lfm2.5-2.6b",
      handle: "ai-chat",
      thinkingLevel: "max",
      fastMode: true,
      approvalLevel: 1,
      respondPolicy: "from-participants",
      respondFrom: ["user-1"],
    });
    expect(onInputChange).toHaveBeenCalledWith("");
  });
});

describe("ChatInput send-button intent", () => {
  // The primary send control is icon-only; intent is exposed via aria-label.
  it("idle shows the Send intent", () => {
    renderInput({ agentBusy: false, primaryActionIntent: "send" });
    expect(screen.getByLabelText(/^Send \(/)).toBeTruthy();
  });

  it("agent busy shows the Steer intent", () => {
    renderInput({ agentBusy: true, primaryActionIntent: "steer" });
    expect(screen.getByLabelText(/^Steer \(/)).toBeTruthy();
  });

  it("keeps send options available for attachment when the composer is empty", () => {
    renderInput({ input: "" });
    const primary = screen.getByLabelText(/^Send \(/).closest("button");
    const options = screen.getByLabelText("Send options").closest("button");
    expect(primary?.hasAttribute("disabled")).toBe(true);
    expect(options?.hasAttribute("disabled")).toBe(false);
  });

  it("honors a product-owned readiness gate even while the channel is connected", async () => {
    const { onSendMessage } = renderInput({
      disabled: true,
      input: "premature order",
    });

    expect(textarea().hasAttribute("disabled")).toBe(true);
    expect(
      screen
        .getByLabelText(/^Send \(/)
        .closest("button")
        ?.hasAttribute("disabled"),
    ).toBe(true);
    await keyDown({ key: "Enter" });
    expect(onSendMessage).not.toHaveBeenCalled();
  });
});

describe("ChatInput narration / undo / ghost", () => {
  it("renders the flush narration pill as a status region", () => {
    renderInput({
      flushNarration: { text: "Delivered 2 steers", remaining: 0 },
    });
    const pill = screen.getByText("Delivered 2 steers");
    expect(pill).toBeTruthy();
    expect(pill.closest('[role="status"]')).toBeTruthy();
  });

  it("renders the undo snackbar and fires undoLastAction", () => {
    const { undoLastAction } = renderInput({
      undoableAction: {
        kind: "cancel",
        messageIds: ["m1"],
        expiresAt: Date.now() + 5000,
      },
    });
    fireEvent.click(screen.getByText("Undo"));
    expect(undoLastAction).toHaveBeenCalledTimes(1);
  });

  it("shows the Sending… ghost while a send is in flight", () => {
    renderInput({ pendingSendCount: 1 });
    expect(screen.getByText("Sending…")).toBeTruthy();
  });
});
