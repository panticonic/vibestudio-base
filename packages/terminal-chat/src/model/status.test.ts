import { describe, expect, it } from "vitest";
import { stripAnsi, width } from "./ansi.js";
import { statusLine, type StatusInfo } from "./status.js";

const info: StatusInfo = {
  connection: "connected",
  joined: true,
  model: "GPT-5",
  thinkingLevel: "high",
  fastMode: false,
  contextPercent: 42,
  approvalLevel: 1,
  agentCount: 1,
  busy: true,
  waitingForYou: false,
  unreadForks: 2,
  queued: 1,
  title: "Planning",
};

describe("status line", () => {
  it("shows model, thinking, context, approvals, connection, activity and forks", () => {
    expect(stripAnsi(statusLine(info, 200))).toBe(
      "● online │ ◆ working │ GPT-5 │ thinking high │ ctx 42% │ approval safe │ 1 queued │ ⑂ 2 unread │ Planning"
    );
  });

  it("drops the least important parts first on narrow terminals", () => {
    const narrow = stripAnsi(statusLine(info, 40));
    expect(width(narrow)).toBeLessThanOrEqual(40);
    expect(narrow.startsWith("● online │ ◆ working │ GPT-5")).toBe(true);
  });

  it("says when there is no agent or no connection", () => {
    expect(
      stripAnsi(statusLine({ ...info, connection: "connecting", agentCount: 0, model: null }, 80))
    ).toMatch(/^◌ reconnecting │ no agent yet/);
  });
});
