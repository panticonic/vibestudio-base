import { describe, expect, it } from "vitest";
import type { SqlStorage } from "@workspace/runtime/worker";
import { createInMemorySql } from "@workspace/runtime/worker/test-utils";
import type { UiFeedbackPayload } from "@workspace/agentic-protocol";
import { FeedbackIngest, formatFeedbackNote } from "./feedback-ingest.js";

const feedback = (occurrenceKey: string): UiFeedbackPayload => ({
  protocol: "agentic.trajectory.v1",
  target: { kind: "agent", id: "agent:test", participantId: "agent:test" },
  category: "render_failed",
  occurrenceKey,
  error: { message: "Renderer crashed" },
});

describe("FeedbackIngest", () => {
  it("queues new feedback for the target channel and deduplicates repeats", async () => {
    const sql = (await createInMemorySql()) as unknown as SqlStorage;
    FeedbackIngest.createTables(sql);
    const ingest = new FeedbackIngest(sql, () => 1_000);

    ingest.ingest("channel-a", feedback("render:1"));
    ingest.ingest("channel-a", feedback("render:1"));

    expect(ingest.consume("channel-b")).toEqual([]);
    expect(ingest.consume("channel-a")).toEqual([
      "[ui-feedback] A UI component you published failed to render.\n" +
        "Error: Renderer crashed\n" +
        "Fix the underlying problem or tell the user what went wrong; do not ignore this.",
    ]);
    expect(ingest.consume("channel-a")).toEqual([]);
  });
});

describe("formatFeedbackNote", () => {
  it("tells the agent to re-render a failed inline UI with the same id", () => {
    const note = formatFeedbackNote({
      ...feedback("k"),
      category: "compile_failed",
      refs: { inlineUiId: "summary-card", messageId: "inline-ui:a:summary-card" as never },
      error: { message: "Unexpected token" },
    });
    expect(note).toBe(
      "[ui-feedback] UI source you authored failed to compile (inline UI summary-card).\n" +
        "Error: Unexpected token\n" +
        'Fix the source and call inline_ui again with the same id "summary-card" to replace the broken component; do not ignore this.',
    );
  });

  it("points MDX failures at the authored message", () => {
    const note = formatFeedbackNote({
      ...feedback("k"),
      category: "compile_failed",
      refs: { messageId: "m1" as never },
    });
    expect(note).toContain("(message m1)");
    expect(note).toContain("Re-send it with valid MDX");
  });

  it("names the component and problems for rejected catalog props", () => {
    const inMessage = formatFeedbackNote({
      ...feedback("k"),
      category: "props_invalid",
      refs: { messageId: "m1" as never, component: "Chart" },
      error: { message: "Chart needs a data array." },
    });
    expect(inMessage).toBe(
      "[ui-feedback] Chart in message m1 rejected props: Chart needs a data array.\n" +
        "The user sees a notice instead of the component. Re-send the message with corrected props.",
    );
    const inInline = formatFeedbackNote({
      ...feedback("k"),
      category: "props_invalid",
      refs: { inlineUiId: "card-1", component: "Stats" },
      error: { message: "no items" },
    });
    expect(inInline).toContain("Stats in inline UI card-1 rejected props: no items");
    expect(inInline).toContain('same id "card-1"');
  });

  it("points action bar failures at load_action_bar", () => {
    const note = formatFeedbackNote({
      ...feedback("k"),
      category: "render_failed",
      refs: { actionBarId: "bar-1" },
    });
    expect(note).toContain("(action bar bar-1)");
    expect(note).toContain("load_action_bar");
  });
});
