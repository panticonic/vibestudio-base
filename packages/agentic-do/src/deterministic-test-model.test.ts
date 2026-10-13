import { describe, expect, it } from "vitest";
import { createModels, Type, type Context } from "@panticonic/pi-ai";
import {
  TEST_MODEL_ID,
  TEST_MODEL_PROVIDER_ID,
} from "@workspace/model-catalog/catalog";
import { createDeterministicTestProvider } from "./deterministic-test-model.js";

function modelSet(script?: unknown) {
  const models = createModels();
  models.setProvider(createDeterministicTestProvider(script));
  const model = models.getModel(TEST_MODEL_PROVIDER_ID, TEST_MODEL_ID);
  if (!model) throw new Error("Deterministic test model was not registered");
  return { models, model };
}

function context(
  messages: Context["messages"],
): Context {
  return { messages };
}

describe("deterministic test model provider", () => {
  it("uses scripted tool calls and waits for successful Pi tool results", async () => {
    const { models, model } = modelSet({
      rules: [
        {
          match: "Save (?<path>.+)",
          steps: [
            { tool: "write", arguments: { path: "{{path}}", content: "hello" } },
            { tool: "read", arguments: { path: "{{path}}" } },
          ],
          reply: "Saved {{path}}",
        },
      ],
    });
    const system = {
      role: "system" as const,
      content: "",
      toolsAdded: [
        { name: "write", description: "Write", parameters: Type.Object({}) },
        { name: "read", description: "Read", parameters: Type.Object({}) },
      ],
      timestamp: 1,
    };
    const user = { role: "user" as const, content: "Save notes/a.txt", timestamp: 2 };
    const first = await models.complete(model, context([system, user]), {
      sessionId: "task-one",
    });
    expect(first.content).toMatchObject([
      {
        type: "toolCall",
        id: "vibestudio-test:task-one:2:rule:0:step:0",
        name: "write",
        arguments: { path: "notes/a.txt", content: "hello" },
      },
    ]);

    const afterWrite = await models.complete(
      model,
      context([
        system,
        user,
        first,
        {
          role: "toolResult",
          toolCallId: first.content[0]?.type === "toolCall" ? first.content[0]?.id ?? "" : "",
          toolName: "write",
          content: [{ type: "text", text: "written" }],
          isError: false,
          timestamp: 3,
        },
      ]),
      { sessionId: "task-one" },
    );
    expect(afterWrite.content).toMatchObject([
      {
        type: "toolCall",
        id: "vibestudio-test:task-one:2:rule:0:step:1",
        name: "read",
        arguments: { path: "notes/a.txt" },
      },
    ]);

    const completed = await models.complete(
      model,
      context([
        system,
        user,
        first,
        {
          role: "toolResult",
          toolCallId: first.content[0]?.type === "toolCall" ? first.content[0]?.id ?? "" : "",
          toolName: "write",
          content: [{ type: "text", text: "written" }],
          isError: false,
          timestamp: 3,
        },
        afterWrite,
        {
          role: "toolResult",
          toolCallId:
            afterWrite.content[0]?.type === "toolCall"
              ? afterWrite.content[0]?.id ?? ""
              : "",
          toolName: "read",
          content: [{ type: "text", text: "hello" }],
          isError: false,
          timestamp: 4,
        },
      ]),
      { sessionId: "task-one" },
    );
    expect(completed.content).toEqual([
      { type: "text", text: "Saved notes/a.txt" },
    ]);
  });

  it("follows the opening turn through read and the real inline_ui tool using its stable id", async () => {
    const { models, model } = modelSet();
    const system = {
      role: "system" as const,
      content:
        "## Opening turn\nRead `skills/onboarding/SKILL.md`, then render `skills/onboarding/SetupHub.tsx` with `inline_ui` using the stable ID `setup-overview`.\n## Other",
      toolsAdded: [
        { name: "read", description: "Read", parameters: Type.Object({}) },
        { name: "inline_ui", description: "Render", parameters: Type.Object({}) },
      ],
      timestamp: 1,
    };
    const user = { role: "user" as const, content: "Start onboarding", timestamp: 2 };
    const read = await models.complete(model, context([system, user]), {
      sessionId: "opening-task",
    });
    expect(read.content[0]).toMatchObject({
      type: "toolCall",
      name: "read",
      arguments: { path: "skills/onboarding/SKILL.md" },
    });
    const readCall = read.content[0];
    if (readCall?.type !== "toolCall") throw new Error("Expected opening read tool call");
    const inline = await models.complete(
      model,
      context([
        system,
        user,
        read,
        {
          role: "toolResult",
          toolCallId: readCall.id,
          toolName: "read",
          content: [{ type: "text", text: "Setup guidance" }],
          isError: false,
          timestamp: 3,
        },
      ]),
      { sessionId: "opening-task" },
    );
    expect(inline.content[0]).toMatchObject({
      type: "toolCall",
      name: "inline_ui",
      arguments: {
        path: "skills/onboarding/SetupHub.tsx",
        id: "setup-overview",
        props: {},
      },
    });
    const inlineCall = inline.content[0];
    if (inlineCall?.type !== "toolCall")
      throw new Error("Expected opening inline_ui tool call");
    const final = await models.complete(
      model,
      context([
        system,
        user,
        read,
        {
          role: "toolResult",
          toolCallId: readCall.id,
          toolName: "read",
          content: [{ type: "text", text: "Setup guidance" }],
          isError: false,
          timestamp: 3,
        },
        inline,
        {
          role: "toolResult",
          toolCallId: inlineCall.id,
          toolName: "inline_ui",
          content: [{ type: "text", text: "Rendered" }],
          isError: false,
          timestamp: 4,
        },
      ]),
      { sessionId: "opening-task" },
    );
    expect(final.content).toEqual([
      { type: "text", text: "E2E model response: initial agent turn completed." },
    ]);
  });
});
