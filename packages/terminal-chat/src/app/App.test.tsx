import { afterEach, describe, expect, it } from "vitest";
import { render, type Instance } from "ink";
import type { ChatMessage } from "@workspace/agentic-core";
import { TerminalChatApp } from "./App.js";
import { FrameStdout, TypedInput, createFakeChat } from "../testing/fakes.js";

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
let instance: Instance | null = null;
afterEach(() => {
  instance?.unmount();
  instance = null;
});

async function mount(initial: Parameters<typeof createFakeChat>[0] = {}, columns = 80, rows = 24) {
  const chat = createFakeChat(initial);
  const stdout = new FrameStdout(columns, rows);
  const input = new TypedInput();
  const control: string[] = [];
  instance = render(<TerminalChatApp runtime={chat.runtime} input={input} control={(s) => control.push(s)} />, {
    stdout: stdout as never,
    debug: true,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  await settle();
  return {
    chat,
    stdout,
    control,
    screen: () => stdout.screen(),
    text: () => stdout.screen().join("\n"),
    type: async (...chunks: string[]) => {
      for (const chunk of chunks) {
        input.type(chunk);
        await settle();
      }
    },
  };
}

const agentReply = (id: string, content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, senderId: "ai", content, ...extra });

describe("TerminalChatApp", () => {
  it("marks the true start of history only after replay and older paging settle", async () => {
    const app = await mount({ messages: [agentReply("a1", "First reply")], replaySettled: false });
    expect(app.text()).not.toContain("↑ start of conversation");
    app.chat.update({ replaySettled: true, hasMoreHistory: true });
    await settle();
    expect(app.text()).toContain("↑ older messages");
    app.chat.update({ hasMoreHistory: false, loadingMore: true });
    await settle();
    expect(app.text()).toContain("loading older messages");
    expect(app.text()).not.toContain("↑ start of conversation");
    app.chat.update({ loadingMore: false });
    await settle();
    expect(app.text()).toContain("↑ start of conversation");
  });
  it("shows the empty state, the composer and the status line on a fresh conversation", async () => {
    const app = await mount();
    const screen = app.screen();
    expect(screen).toHaveLength(23); // one row short of the terminal, so Ink rewrites only changed lines
    expect(app.text()).toContain("New conversation");
    expect(app.text()).toContain("Approvals open in the terminal browser: Ctrl-Space a");
    expect(screen.at(-1)).toMatch(/^● online │ ◇ idle │ GPT-5 │ thinking medium │ ctx 12%/);
    expect(screen.at(-2)).toContain("Enter send · Alt-Enter newline");
    expect(app.control.some((s) => s.includes("\x1b]2;Planning — Chat"))).toBe(true);
  });

  it("sends the draft with Enter and inserts newlines with Alt-Enter", async () => {
    const app = await mount();
    await app.type("hello", "\x1b\r", "world");
    expect(app.text()).toContain("› hello");
    expect(app.text()).toContain("  world");
    await app.type("\r");
    expect(app.chat.calls.submitted).toEqual([{ text: "hello\nworld", options: { mentions: [] } }]);
    expect(app.text()).toContain("› You");
  });

  it("streams agent replies into the transcript and renders markdown", async () => {
    const app = await mount();
    app.chat.update({ messages: [agentReply("a1", "# Plan\n\n- step **one**", { complete: false })], agentBusy: true });
    await settle();
    expect(app.text()).toContain("● Assistant");
    expect(app.text()).toContain("Plan");
    expect(app.text()).toContain("• step one▌");
    expect(app.screen().at(-1)).toContain("◆ working");
  });

  it("completes slash commands inline and runs them", async () => {
    const app = await mount();
    await app.type("/he");
    expect(app.text()).toContain("❯ /help");
    await app.type("\r");
    expect(app.screen()[0]).toBe("Help");
    expect(app.text()).toContain("Esc       Stop the agent");
    await app.type("\x1b");
    expect(app.text()).toContain("New conversation");
  });

  it("explains unknown commands instead of sending them", async () => {
    const app = await mount();
    await app.type("/bogus", "\x1b", "\r");
    expect(app.chat.calls.submitted).toEqual([]);
    expect(app.text()).toContain("There is no /bogus command");
  });

  it("opens the command palette with Ctrl-K and filters it", async () => {
    const app = await mount();
    await app.type("\x0b", "fork");
    expect(app.text()).toContain("Command palette");
    expect(app.text()).toContain("/fork");
    expect(app.text()).not.toContain("/missions");
  });

  it("interrupts with Esc and flushes with Esc Esc while the agent works", async () => {
    const app = await mount({ messages: [{ id: "turn:1", senderId: "ai", content: "", contentType: "typing" }], agentBusy: true });
    await app.type("\x1b");
    expect(app.chat.calls.interrupted).toEqual(["ai"]);
    await app.type("\x1b");
    expect(app.chat.calls.flushed).toBe(1);
  });

  it("selects messages, expands a tool card and forks from the transcript", async () => {
    const tool: ChatMessage = {
      id: "invocation:1",
      senderId: "ai",
      content: "",
      contentType: "invocation",
      invocation: { id: "1", name: "eval", arguments: { code: "1+1" }, execution: { status: "complete", description: "Adds", result: { details: { success: true, returnValue: 2 } } } },
    };
    const app = await mount({ messages: [agentReply("a1", "Let me compute", { seq: 1 }), tool] });
    expect(app.text()).toContain("→ 2");
    await app.type("\x1b[1;5A"); // Ctrl-Up: select the newest row
    expect(app.screen().some((line) => line.startsWith("▌ ▸ Eval"))).toBe(true);
    expect(app.screen().at(-2)).toContain("Enter expand");
    await app.type("\r");
    expect(app.text()).toContain("Arguments");
    expect(app.text()).toContain('"code": "1+1"');
    await app.type("k");
    expect(app.screen().at(-2)).toContain("f fork here");
  });

  it("shows inline approval cards as display-only, pointing at the overlay key", async () => {
    const app = await mount({ messages: [{ id: "approval:1", senderId: "ai", content: "", contentType: "approval", approval: { id: "1", status: "requested", question: "Run rm -rf build?" } }] });
    expect(app.text()).toContain("Approval needed: Run rm -rf build?");
    expect(app.text()).toContain("press Ctrl-Space a");
  });

  it("answers an agent's feedback_form as a terminal form", async () => {
    const app = await mount();
    const answer = app.chat.addForm({ id: "call-1", from: "ai", args: { title: "Which color?", fields: [{ key: "color", type: "select", required: true, options: [{ value: "red", label: "Red" }, { value: "blue", label: "Blue" }] }] } });
    await settle();
    expect(app.text()).toContain("An agent is asking");
    expect(app.text()).toContain("Which color?");
    await app.type("\x1b[C", " ", "\x13");
    await expect(answer).resolves.toEqual({ type: "submit", value: { color: "blue" } });
    await settle();
    expect(app.text()).not.toContain("Which color?");
  });

  it("guides first-time setup when no model is usable", async () => {
    const app = await mount();
    (app.chat.runtime.getSnapshot().host!.modelCatalog!.models[0] as { availability: unknown }).availability = { state: "needs-setup", detail: "no-credential" };
    app.chat.update({ participants: { me: { id: "me", metadata: { name: "Me", type: "panel" } } } as never, channelTitle: null });
    await settle();
    expect(app.text()).toContain("No model is ready yet");
    expect(app.text()).toContain("/connect");
  });

  it("stays readable at 80x24 with a long transcript and adapts to resizes", async () => {
    const messages = Array.from({ length: 200 }, (_, i) => agentReply(`m${i}`, `message number ${i} ${"lorem ipsum ".repeat(i % 7)}`));
    const app = await mount({ messages });
    expect(app.text()).toContain("message number 199");
    expect(app.text()).not.toContain("message number 150 ");
    app.stdout.resize(120, 40);
    await settle();
    expect(app.screen()).toHaveLength(39);
    expect(app.screen().every((line) => line.length <= 120)).toBe(true);
  });
});
