import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "@vitest/browser/context";
import { Theme } from "@radix-ui/themes";
import { ChatInput } from "./ChatInput";
import { ChatProvider } from "../context/ChatProvider";
import type { ChatContextValue, ChatInputContextValue } from "../types";
import "@radix-ui/themes/styles.css";
import "@workspace/ui/foundation.css";
import "../styles.css";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("offers model preparation before capture and keeps all voice status above a stationary composer", async () => {
  await page.viewport(874, 402);
  vi.spyOn(navigator.mediaDevices, "enumerateDevices").mockResolvedValue([
    { kind: "audioinput" } as MediaDeviceInfo,
  ]);
  const track = { onended: null, stop: vi.fn() };
  const capture = vi
    .spyOn(navigator.mediaDevices, "getUserMedia")
    .mockResolvedValue({
      getTracks: () => [track],
      getAudioTracks: () => [track],
    } as unknown as MediaStream);
  vi.stubGlobal(
    "MediaRecorder",
    class {
      state = "inactive";
      onstop = null;
      onerror = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
      }
    },
  );
  let events!: ReadableStreamDefaultController<Uint8Array>;
  let ready = false;
  const rpc = {
    call: vi.fn(async () => ({ ready })),
    stream: vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              events = controller;
            },
          }),
        ),
    ),
  };
  const context = {
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
    chat: { rpc, contextId: "context", channelId: "channel" },
  } as unknown as ChatContextValue;
  const input = {
    input: "Keep my draft",
    pendingImages: [],
    onInputChange: vi.fn(),
    onSendMessage: vi.fn(),
    onImagesChange: vi.fn(),
    replyTo: null,
    replyToMessage: null,
    setReplyTo: vi.fn(),
  } as unknown as ChatInputContextValue;
  render(
    <Theme>
      <ChatProvider value={context} inputValue={input}>
        <div
          className="agentic-chat-root"
          style={{
            height: 350,
            containerType: "size",
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box",
            padding: 8,
          }}
        >
          <div style={{ flex: "1 1 0", minHeight: 0 }} />
          <ChatInput />
        </div>
      </ChatProvider>
    </Theme>,
  );
  const field = screen.getByPlaceholderText(/Type a message/);
  const bounds = field.getBoundingClientRect();
  const unchanged = () => {
    expect(screen.getByPlaceholderText(/Type a message/)).toBe(field);
    expect((field as HTMLTextAreaElement).value).toBe("Keep my draft");
    expect(field.getBoundingClientRect().y).toBe(bounds.y);
    expect(field.getBoundingClientRect().height).toBe(bounds.height);
    expect(
      screen.getByRole("status").getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(bounds.top);
  };
  await expect
    .poll(() => screen.getByRole("button", { name: "Dictate" }))
    .toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Dictate" }));
  await expect
    .poll(() => screen.getByRole("button", { name: "Load voice input" }))
    .toBeTruthy();
  expect(capture).not.toHaveBeenCalled();
  expect(rpc.stream).not.toHaveBeenCalled();
  unchanged();
  fireEvent.click(screen.getByRole("button", { name: "Load voice input" }));
  await expect.poll(() => rpc.stream.mock.calls.length).toBe(1);
  await act(async () =>
    events.enqueue(
      new TextEncoder().encode(
        '{"type":"progress","message":"Loading voice model…","completed":1,"total":2}\n',
      ),
    ),
  );
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
    "50",
  );
  unchanged();
  await act(async () => {
    ready = true;
    events.enqueue(new TextEncoder().encode('{"type":"ready"}\n'));
    events.close();
  });
  await expect
    .poll(() => screen.getByRole("button", { name: "Start speaking" }))
    .toBeTruthy();
  expect(capture).not.toHaveBeenCalled();
  unchanged();
  fireEvent.click(screen.getByRole("button", { name: "Start speaking" }));
  await expect
    .poll(() => screen.getByRole("button", { name: "Stop dictation" }))
    .toBeTruthy();
  expect(capture).toHaveBeenCalledOnce();
  unchanged();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(track.stop).toHaveBeenCalled();
  expect(screen.queryByRole("status")).toBeNull();
});
