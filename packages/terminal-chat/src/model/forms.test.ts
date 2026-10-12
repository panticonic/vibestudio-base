import { describe, expect, it } from "vitest";
import type { FeedbackFormArgs } from "@workspace/pubsub";
import { stripAnsi } from "./ansi.js";
import { createForm, formReduce, formStops, renderForm, type FeedbackResult, type FormState } from "./forms.js";
import { KeyDecoder } from "./keys.js";

function drive(args: FeedbackFormArgs, ...chunks: string[]): { state: FormState; result?: FeedbackResult } {
  const decoder = new KeyDecoder();
  let state = createForm(args);
  let result: FeedbackResult | undefined;
  for (const chunk of chunks) {
    for (const event of decoder.push(chunk)) {
      const next = formReduce(state, args, event);
      state = next.state;
      result ??= next.result;
    }
  }
  return { state, ...(result ? { result } : {}) };
}

const TAB = "\t";
const ENTER = "\r";
const SPACE = " ";
const RIGHT = "\x1b[C";

describe("feedback_form in the terminal", () => {
  const args: FeedbackFormArgs = {
    title: "Deploy settings",
    fields: [
      { key: "name", type: "string", label: "Name", required: true },
      { key: "replicas", type: "number", label: "Replicas", default: 1 },
      { key: "public", type: "boolean", label: "Public" },
      { key: "region", type: "select", label: "Region", options: [{ value: "eu", label: "Europe" }, { value: "us", label: "US" }] },
      { key: "notes", type: "readonly", default: "Read me" },
    ],
  };

  it("lists focus stops for inputs and buttons, skipping display fields", () => {
    expect(formStops(createForm(args), args).map((s) => (s.kind === "field" ? s.key : s.kind))).toEqual([
      "name",
      "replicas",
      "public",
      "region",
      "submit",
      "cancel",
    ]);
  });

  it("validates required fields before submitting", () => {
    const { state, result } = drive(args, "\x13"); // Ctrl-S
    expect(result).toBeUndefined();
    expect(state.error).toBe('Required field "Name" is missing');
  });

  it("edits text, numbers, booleans and choices, then submits typed values", () => {
    const { result } = drive(args, "web", TAB, "\x7f3", TAB, SPACE, TAB, RIGHT, SPACE, "\x13");
    expect(result).toEqual({ type: "submit", value: { name: "web", replicas: 3, public: true, region: "us", notes: "Read me" } });
  });

  it("rejects a number field that is not a number", () => {
    const { state, result } = drive(args, "web", TAB, "x", "\x13");
    expect(result).toBeUndefined();
    expect(state.error).toBe('"Replicas" must be a number');
  });

  it("cancels with Esc", () => {
    expect(drive(args, "\x1b").result).toEqual({ type: "cancel" });
  });

  it("folds an 'Other…' free-text choice into the submitted value", () => {
    const choice: FeedbackFormArgs = {
      title: "Pick",
      fields: [{ key: "answer", type: "select", options: [{ value: "a", label: "A" }] }],
    };
    const { result } = drive(choice, RIGHT, SPACE, TAB, "my own", "\x13");
    expect(result).toEqual({ type: "submit", value: { answer: "my own" } });
  });

  it("submits on select for button groups", () => {
    const buttons: FeedbackFormArgs = {
      title: "Allow?",
      hideSubmit: true,
      fields: [{ key: "decision", type: "buttonGroup", submitOnSelect: true, buttons: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] }],
    };
    expect(drive(buttons, RIGHT, ENTER).result).toEqual({ type: "submit", value: { decision: "no" } });
  });

  it("toggles multi-select options with Space", () => {
    const multi: FeedbackFormArgs = {
      title: "Which?",
      fields: [{ key: "pick", type: "multiSelect", allowFreeText: false, options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] }],
    };
    expect(drive(multi, SPACE, RIGHT, SPACE, "\x13").result).toEqual({ type: "submit", value: { pick: ["a", "b"] } });
  });

  it("hides fields whose visibleWhen does not hold", () => {
    const conditional: FeedbackFormArgs = {
      title: "More",
      fields: [
        { key: "more", type: "boolean", label: "More options" },
        { key: "detail", type: "string", label: "Detail", visibleWhen: { field: "more", operator: "eq", value: true } },
      ],
    };
    expect(stripAnsi(renderForm(createForm(conditional), conditional, 60).lines.join("\n"))).not.toContain("Detail");
    const shown = drive(conditional, SPACE).state;
    expect(stripAnsi(renderForm(shown, conditional, 60).lines.join("\n"))).toContain("Detail");
  });

  it("renders the form with labels, required markers, choices and buttons", () => {
    const text = renderForm(createForm(args), args, 60).lines.map(stripAnsi);
    expect(text[0]).toBe("Deploy settings");
    expect(text).toContain("❯ Name *");
    expect(text.some((line) => line.includes("( ) Europe"))).toBe(true);
    expect(text.some((line) => line.includes("Read me"))).toBe(true);
    expect(text.some((line) => line.includes("[ Submit ]") || line.includes(" Submit "))).toBe(true);
  });
});
