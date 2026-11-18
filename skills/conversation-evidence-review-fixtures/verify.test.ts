import { expect, it } from "vitest";
import { conversationEvidenceWorlds } from "./worlds.js";
import { verifyConversationEvidence } from "./verify.js";

it("requires the actual authorized context and accepts an equivalent task identity", () => {
  const world = conversationEvidenceWorlds.find(
    ({ id }) => id === "conversation-wrong-context-looks-right",
  )!;
  const report = {
    kind: "surface" as const,
    ready: false,
    basis: "chan-wrong-context-looks-right",
    blockers: ["context"],
  };
  expect(verifyConversationEvidence(world, report).passed).toBe(true);
  expect(
    verifyConversationEvidence(world, { ...report, ready: true, blockers: [] })
      .passed,
  ).toBe(false);
  expect(
    verifyConversationEvidence({ ...world, id: "alias" }, report).passed,
  ).toBe(true);
});
