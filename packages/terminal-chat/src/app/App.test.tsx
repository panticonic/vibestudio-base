import { afterEach, describe, expect, it } from "vitest";
import { render, type Instance } from "ink";
import type { ChatMessage } from "@workspace/agentic-core";
import { DeferredAgentMachine } from "@workspace/agentic-core/chat-store";
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
  instance = render(
    <TerminalChatApp runtime={chat.runtime} input={input} control={(s) => control.push(s)} />,
    {
      stdout: stdout as never,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    }
  );
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

const agentReply = (
  id: string,
  content: string,
  extra: Partial<ChatMessage> = {}
): ChatMessage => ({ id, senderId: "ai", content, ...extra });

describe("TerminalChatApp", () => {
  it("explains attempted delivery immutability before opening an edit prompt", async () => {
    const app = await mount();
    const machine = new DeferredAgentMachine({
      participants: {},
      pendingAgents: new Map(),
      input: "",
      clearComposer: () => {},
      publishText: async () => {},
      maybeSetDefaultTitle: () => {},
      coreSendMessage: async () => {},
      onAddAgent: async () => {},
      availableAgents: [],
      modelCatalog: null,
      firstAgentPending: true,
      resolveOpeningRequest: async () => {},
      channelName: "chat",
      replaySettled: true,
      queueStore: {
        load: async () => [
          { kind: "message", id: "attempted", text: "possibly accepted", publication: "attempted" },
        ],
        put: async () => {},
        remove: async () => {},
      },
    });
    await machine.ready();
    app.chat.updateDeferred(machine.getSnapshot().deferredAgent);
    await app.type("/queue", "\r", "e");
    expect(app.chat.notices()).toContainEqual(
      expect.objectContaining({
        title: "This delivery is not editable",
        message: expect.stringContaining("Discarding does not recall it"),
      })
    );
    expect(app.text()).not.toContain("Edit the queued message");
    await machine.close();
  });

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
    expect(app.text()).toContain("Approvals open in the terminal browser: Ctrl-B a");
    expect(screen.at(-1)).toMatch(/^● online │ ◇ idle │ GPT-5 │ thinking medium │ ctx 12%/);
    expect(screen.at(-2)).toContain(" Enter send   F2 settings ");
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
    app.chat.update({
      messages: [agentReply("a1", "# Plan\n\n- step **one**", { complete: false })],
      agentBusy: true,
    });
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
    const app = await mount({
      messages: [{ id: "turn:1", senderId: "ai", content: "", contentType: "typing" }],
      agentBusy: true,
    });
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
      invocation: {
        id: "1",
        name: "eval",
        arguments: { code: "1+1" },
        execution: {
          status: "complete",
          description: "Adds",
          result: { details: { success: true, returnValue: 2 } },
        },
      },
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

  it("is clickable: tool cards expand, hint keys press, pickers pick, the wheel scrolls", async () => {
    const tool: ChatMessage = {
      id: "invocation:1",
      senderId: "ai",
      content: "",
      contentType: "invocation",
      invocation: {
        id: "1",
        name: "eval",
        arguments: { code: "1+1" },
        execution: {
          status: "complete",
          description: "Adds",
          result: { details: { success: true, returnValue: 2 } },
        },
      },
    };
    const app = await mount({ messages: [agentReply("a1", "Let me compute", { seq: 1 }), tool] });
    const click = (x: number, y: number) =>
      app.type(`\x1b[<0;${x + 1};${y + 1}M`, `\x1b[<0;${x + 1};${y + 1}m`);
    const rowOf = (text: string) => app.screen().findIndex((line) => line.includes(text));
    const hintAt = (text: string) =>
      [app.screen().at(-2)!.indexOf(text), app.screen().length - 2] as const;

    await click(4, rowOf("Eval"));
    expect(app.text()).toContain('"code": "1+1"');
    expect(app.screen().at(-2)).toContain("Enter collapse".slice(0, 5));
    await click(...hintAt("Esc back"));
    expect(app.screen().at(-2)).toContain("Enter send");

    await app.type("\x1b[<64;1;1M"); // wheel up scrolls the transcript, never the draft
    expect(app.screen().at(-2)).toContain("Enter send");

    await click(...hintAt("F2 settings"));
    expect(app.text()).toContain("Agent settings");
    await click(4, rowOf("Thinking "));
    expect(app.text()).toContain("Thinking level");
  });

  it("shows inline approval cards as display-only, pointing at the overlay key", async () => {
    const app = await mount({
      messages: [
        {
          id: "approval:1",
          senderId: "ai",
          content: "",
          contentType: "approval",
          approval: { id: "1", status: "requested", question: "Run rm -rf build?" },
        },
      ],
    });
    expect(app.text()).toContain("Approval needed: Run rm -rf build?");
    expect(app.text()).toContain("press Ctrl-B a");
  });

  it("shows a turn parked on the person's decision once, as waiting for them", async () => {
    const title = "Finish reviewing Welcome — here's what's in your workspace to continue.";
    const app = await mount({
      messages: [
        { id: "u1", senderId: "me", content: "tell me a joke" },
        { id: "turn:t1", senderId: "ai", content: "", contentType: "typing", complete: false },
        {
          id: "turn:t1:waiting",
          senderId: "ai",
          content: title,
          contentType: "lifecycle",
          kind: "system",
          complete: false,
          lifecycle: { status: "waiting", title, reason: "input_required" },
        },
      ],
    });
    const text = app.text();
    // The terminal browser draws the "Needs you" bar in its own chrome; the
    // chat says it once, in the transcript, with the key that answers it.
    expect(text).not.toContain("Needs you");
    expect(text).toContain("Waiting for you: Finish reviewing Welcome");
    expect(text).toContain("Press Ctrl-B a to answer it");
    expect(text.split("Finish reviewing Welcome").length - 1).toBe(1);
    expect(text).not.toContain("is working");
    expect(app.screen().at(-1)).toContain("◆ waiting for you");
  });

  it("quits with Ctrl-D from an empty draft and deletes with it otherwise", async () => {
    const app = await mount();
    let exited = false;
    void instance!.waitUntilExit().then(() => {
      exited = true;
    });
    await app.type("ab", "\x1b[D", "\x04");
    expect(app.text()).toContain("› a");
    expect(exited).toBe(false);
    await app.type("\x15", "\x04");
    expect(exited).toBe(true);
  });

  it("walks repeated Ctrl-C from clearing the draft to quitting", async () => {
    const app = await mount();
    let exited = false;
    void instance!.waitUntilExit().then(() => {
      exited = true;
    });
    await app.type("draft", "\x03");
    expect(app.text()).not.toContain("› draft");
    await app.type("\x03");
    expect(app.chat.notices()).toContainEqual(
      expect.objectContaining({ title: "Press Ctrl-C again to quit" })
    );
    await app.type("x", "\x03");
    expect(exited).toBe(false); // another key in between starts over: this one cleared "x"
    await app.type("\x03", "\x03");
    expect(exited).toBe(true);
  });

  it("opens agent settings with F2 and changes one from there", async () => {
    const app = await mount();
    await app.type("\x1bOQ");
    const text = app.text();
    expect(text).toContain("Agent settings");
    expect(text).toMatch(/Model\s+GPT-5/);
    expect(text).toMatch(/Thinking\s+medium/);
    expect(text).toContain("Approvals");
    await app.type("\r");
    expect(app.text()).toContain("Choose a model");
  });

  it("answers an agent's feedback_form as a terminal form", async () => {
    const app = await mount();
    const answer = app.chat.addForm({
      id: "call-1",
      from: "ai",
      args: {
        title: "Which color?",
        fields: [
          {
            key: "color",
            type: "select",
            required: true,
            options: [
              { value: "red", label: "Red" },
              { value: "blue", label: "Blue" },
            ],
          },
        ],
      },
    });
    await settle();
    expect(app.text()).toContain("An agent is asking");
    expect(app.text()).toContain("Which color?");
    await app.type("\x1b[C", " ", "\x13");
    await expect(answer).resolves.toEqual({ type: "submit", value: { color: "blue" } });
    await settle();
    expect(app.text()).not.toContain("Which color?");
  });

  it("answers an agent's question by mouse: options, then the Submit button", async () => {
    const app = await mount();
    const answer = app.chat.addForm({
      id: "call-2",
      from: "ai",
      args: {
        title: "Which color?",
        fields: [
          {
            key: "color",
            type: "select",
            required: true,
            options: [
              { value: "red", label: "Red" },
              { value: "blue", label: "Blue" },
            ],
          },
        ],
      },
    });
    await settle();
    const click = (x: number, y: number) =>
      app.type(`\x1b[<0;${x + 1};${y + 1}M`, `\x1b[<0;${x + 1};${y + 1}m`);
    const at = (text: string) => {
      const y = app.screen().findIndex((line) => line.includes(text));
      return [app.screen()[y]!.indexOf(text), y] as const;
    };
    await click(...at("Blue"));
    expect(app.screen()[at("Blue")[1]]).toContain("(•) Blue");
    await click(...at("[ Submit ]"));
    await expect(answer).resolves.toEqual({ type: "submit", value: { color: "blue" } });
  });

  it("offers a clickable way back to the newest message after scrolling up", async () => {
    const messages = Array.from({ length: 60 }, (_, i) =>
      agentReply(`m${i}`, `message number ${i}`)
    );
    const app = await mount({ messages });
    expect(app.text()).not.toContain("· Ctrl-End");
    await app.type("\x1b[5~", "\x1b[5~");
    const y = app.screen().findIndex((line) => line.includes("· Ctrl-End"));
    expect(y).toBeGreaterThan(0);
    expect(app.screen()[y]).toMatch(/↓ \d+ newer messages/);
    await app.type(`\x1b[<0;5;${y + 1}M`, `\x1b[<0;5;${y + 1}m`);
    expect(app.text()).not.toContain("· Ctrl-End");
    expect(app.text()).toContain("message number 59");
    await app.type("\x1b[5~", "\x1b[1;5F"); // Ctrl-End does the same
    expect(app.text()).not.toContain("· Ctrl-End");
  });

  it("guides first-time setup when no model is usable", async () => {
    const app = await mount();
    (
      app.chat.runtime.getSnapshot().host!.modelCatalog!.models[0] as { availability: unknown }
    ).availability = { state: "needs-setup", detail: "no-credential" };
    app.chat.update({
      participants: { me: { id: "me", metadata: { name: "Me", type: "panel" } } } as never,
      channelTitle: null,
    });
    await settle();
    expect(app.text()).toContain("No model is ready yet");
    expect(app.text()).toContain("/connect");
  });

  it("stays readable at 80x24 with a long transcript and adapts to resizes", async () => {
    const messages = Array.from({ length: 200 }, (_, i) =>
      agentReply(`m${i}`, `message number ${i} ${"lorem ipsum ".repeat(i % 7)}`)
    );
    const app = await mount({ messages });
    expect(app.text()).toContain("message number 199");
    expect(app.text()).not.toContain("message number 150 ");
    app.stdout.resize(120, 40);
    await settle();
    expect(app.screen()).toHaveLength(39);
    expect(app.screen().every((line) => line.length <= 120)).toBe(true);
  });
});
