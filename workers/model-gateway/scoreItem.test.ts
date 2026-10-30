import { describe, expect, it } from "vitest";
import { openAIChatMessages, scoreItem } from "./scoreItem.js";

describe("a scored decision", () => {
  it("renders Pi context as OpenAI chat messages and refuses what it cannot score", () => {
    expect(
      openAIChatMessages({
        systemPrompt: "Decide.",
        messages: [{ role: "user", content: "urgent?", timestamp: 1 }],
      }),
    ).toEqual([
      { role: "system", content: "Decide." },
      { role: "user", content: "urgent?" },
    ]);
    expect(() =>
      openAIChatMessages({
        messages: [],
        tools: [{ name: "t", description: "d", parameters: {} as never }],
      }),
    ).toThrow(/no tool declarations/u);
  });

  it("writes the replies as the continuations of the rendered conversation", () => {
    expect(
      scoreItem(
        { systemPrompt: "Decide.", messages: [{ role: "user", content: "urgent?", timestamp: 1 }] },
        ["urgent", "normal"],
      ),
    ).toEqual({
      messages: [
        { role: "system", content: "Decide." },
        { role: "user", content: "urgent?" },
      ],
      continuations: ["urgent", "normal"],
    });
  });
});
