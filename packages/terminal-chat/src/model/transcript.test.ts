import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@workspace/agentic-core";
import { stripAnsi } from "./ansi.js";
import {
  isExpandable,
  messageActions,
  renderRow,
  rowKind,
  toolSummary,
  type RowContext,
} from "./transcript.js";

const ctx: RowContext = {
  selfId: "me",
  participants: {
    me: { id: "me", metadata: { name: "Me", type: "panel" } },
    ai: {
      id: "ai",
      metadata: { name: "Assistant", type: "agent", handle: "ai-chat" },
    },
  } as never,
  columns: 60,
  approvalsKey: "Ctrl-Space a",
};
const text = (lines: string[]) => lines.map(stripAnsi);

describe("transcript rows", () => {
  it("keeps all console and structured-result evidence inspectable", () => {
    const tool: ChatMessage = {
      id: "large-tool",
      senderId: "ai",
      content: "",
      contentType: "invocation",
      invocation: {
        id: "large",
        name: "read",
        arguments: {},
        execution: {
          status: "complete",
          description: "",
          consoleOutput: Array.from({ length: 450 }, (_, i) => `console-${i}`).join("\n"),
          result: Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`value-${i}`, i])),
        },
      },
    };
    const rendered = text(renderRow(tool, ctx, true)).join("\n");
    expect(rendered).toContain("console-0");
    expect(rendered).toContain("console-449");
    expect(rendered).toContain('"value-249"');
    expect(rendered).not.toContain("more lines");
  });

  it("renders user and agent messages with receipts, model and edit markers", () => {
    const user: ChatMessage = {
      id: "1",
      senderId: "me",
      content: "hi **there**",
      seq: 3,
      receipts: { byParticipant: { ai: "read" }, aggregate: "read" },
      editedAt: "x",
    };
    const lines = text(renderRow(user, ctx, false));
    expect(lines[0]).toMatch(/^› You · edited +✓✓ read$/);
    expect(lines[1]).toBe("  hi there");
    const agent: ChatMessage = {
      id: "2",
      senderId: "ai",
      content: "Hello",
      model: { ref: "openai:gpt", displayName: "GPT" },
      complete: false,
    };
    expect(text(renderRow(agent, ctx, false))).toEqual(["● Assistant · GPT", "  Hello▌"]);
  });

  it("returns the same lines for an unchanged message (rows are cached by identity)", () => {
    const msg: ChatMessage = { id: "3", senderId: "ai", content: "cached" };
    expect(renderRow(msg, ctx, false)).toBe(renderRow(msg, ctx, false));
    expect(renderRow(msg, { ...ctx, columns: 40 }, false)).not.toBe(renderRow(msg, ctx, false));
  });

  it("collapses thinking by default and shows it when expanded", () => {
    const thinking: ChatMessage = {
      id: "t",
      senderId: "ai",
      content: "step one\nstep two",
      contentType: "thinking",
      complete: true,
    };
    expect(isExpandable(thinking, "me")).toBe(true);
    expect(text(renderRow(thinking, ctx, false))).toEqual(["▸ Thought (2 lines)"]);
    expect(text(renderRow(thinking, ctx, true))).toEqual(["▾ Thought", "  step one", "  step two"]);
  });

  it("summarises tool calls and colours file-mutation diffs when expanded", () => {
    const tool: ChatMessage = {
      id: "invocation:1",
      senderId: "ai",
      content: "",
      contentType: "invocation",
      invocation: {
        id: "1",
        name: "edit",
        arguments: { path: "src/a.ts", oldText: "foo" },
        execution: {
          status: "complete",
          description: "",
          result: {
            details: {
              protocol: "file-mutation.v1",
              status: "applied",
              storage: "vcs",
              operations: [
                {
                  operation: 0,
                  path: "src/a.ts",
                  kind: "edit",
                  status: "changed",
                  diff: "@@ -1 +1 @@\n-foo\n+bar",
                },
              ],
              conflicts: [],
            },
          },
        },
      },
    };
    const collapsed = text(renderRow(tool, ctx, false));
    expect(collapsed[0]).toMatch(/^▸ Edit src\/a\.ts · foo +Complete$/);
    expect(collapsed[1]).toBe("  changed src/a.ts +1 −1");
    const expanded = renderRow(tool, ctx, true);
    expect(expanded.some((line) => line.includes("\x1b[32m+bar"))).toBe(true);
    expect(expanded.some((line) => line.includes("\x1b[31m-foo"))).toBe(true);
  });

  it("summarises eval results and labels result images", () => {
    const payload = {
      id: "e",
      name: "eval",
      arguments: { code: "1+1" },
      execution: {
        status: "complete" as const,
        description: "",
        result: { details: { success: true, returnValue: 2 } },
        resultImages: [{ mimeType: "image/png", data: "AAAA" }],
      },
    };
    expect(stripAnsi(toolSummary(payload))).toBe("→ 2 [1 image]");
    const lines = text(
      renderRow(
        {
          id: "x",
          senderId: "ai",
          content: "",
          contentType: "invocation",
          invocation: payload,
        },
        ctx,
        true
      )
    );
    expect(lines.some((line) => line.includes("[image 1: image/png, 3 B]"))).toBe(true);
  });

  it("makes approval cards display-only and names the overlay key", () => {
    const approval: ChatMessage = {
      id: "approval:1",
      senderId: "ai",
      content: "",
      contentType: "approval",
      approval: {
        id: "1",
        status: "requested",
        question: "Delete the build folder?",
      },
    };
    const lines = text(renderRow(approval, ctx, false));
    expect(lines[0]).toBe("! Approval needed: Delete the build folder?");
    expect(lines[1]).toBe("  Answer it in the approvals overlay: press Ctrl-Space a.");
    expect(messageActions(approval, "me")).toEqual([]);
  });

  it("offers retry and schedule-resume on a usage-limit diagnostic", () => {
    const limit: ChatMessage = {
      id: "d",
      senderId: "ai",
      content: "",
      contentType: "diagnostic",
      diagnostic: {
        code: "message_failed",
        failureCode: "usage_limit_terminal",
        severity: "error",
        title: "Usage limit reached",
        resetAt: "2026-10-12T18:30:00Z",
        messageId: "m1",
      },
    };
    expect(rowKind(limit, "me")).toBe("diagnostic");
    expect(messageActions(limit, "me").map((a) => a.id)).toEqual(["retry", "schedule-resume"]);
    expect(text(renderRow(limit, ctx, false)).join(" ")).toContain("resets at");
  });

  it("offers connect on credential requests and fork/edit on own messages", () => {
    const credential: ChatMessage = {
      id: "c",
      senderId: "ai",
      content: "",
      contentType: "credential-connect",
      credentialRequest: {
        credKey: "k",
        providerId: "openai",
        connectSpec: {} as never,
        agentParticipantId: "ai",
      },
    };
    expect(messageActions(credential, "me").map((a) => a.id)).toEqual(["connect"]);
    expect(
      messageActions({ id: "u", senderId: "me", content: "x", seq: 4 }, "me").map((a) => a.id)
    ).toEqual(["fork", "edit-fork"]);
    expect(messageActions({ id: "u", senderId: "me", content: "x" }, "me")).toEqual([]);
  });

  it("marks retracted messages and agent disconnects", () => {
    expect(
      text(renderRow({ id: "r", senderId: "me", content: "oops", retracted: true }, ctx, false))[1]
    ).toContain("message cancelled");
    const gone: ChatMessage = {
      id: "g",
      senderId: "ai",
      content: "",
      kind: "system",
      disconnectedAgent: {
        name: "Assistant",
        handle: "ai-chat",
        type: "agent",
      },
    };
    expect(text(renderRow(gone, ctx, false))[0]).toContain(
      "Assistant (@ai-chat) disconnected unexpectedly"
    );
  });

  it("expands subagent cards into their child transcript", () => {
    const task: ChatMessage = {
      id: "task:1",
      senderId: "ai",
      content: "",
      contentType: "task",
      task: {
        id: "1",
        taskType: "subagent",
        title: "Research",
        execution: { status: "running", description: "Looking things up" },
        subagent: {
          childParticipantId: "child",
          taskChannelId: "ch-2",
          label: "Researcher",
        },
      },
    };
    const collapsed = text(renderRow(task, ctx, false));
    expect(collapsed[0]).toMatch(/^▸ Subagent Researcher +Running$/);
    expect(collapsed[1]).toBe("  Looking things up");
    const lines = text(renderRow(task, ctx, true, ["child says hi"]));
    expect(lines).toContain("  ┃ child says hi");
  });
});
