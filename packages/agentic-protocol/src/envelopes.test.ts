import { describe, expect, it } from "vitest";
import {
  participantRefFromMetadata,
  pubsubAgenticEventToEnvelope,
  pubsubChannelEventToEnvelope,
} from "./index.js";

describe("canonical participant roles in wire envelopes", () => {
  it.each(["headless", "agent", "panel", "external"])(
    "keeps %s attribution consistent with the canonical subscription",
    (type) => {
      const id = "do:vibestudio/internal:EvalDO:programmatic-client";
      const metadata = { type, name: "Participant", handle: "participant" };
      const expected = participantRefFromMetadata(id, metadata);
      const wire = {
        pubsubId: 7,
        senderId: id,
        senderMetadata: metadata,
        ts: 1_790_978_000_000,
        payload: { actor: { id: "untrusted-claimed-identity" } },
      };
      expect(
        pubsubChannelEventToEnvelope("channel", "custom", wire).from,
      ).toEqual(expected);
      expect(pubsubAgenticEventToEnvelope("channel", wire).from).toEqual(
        expected,
      );
      expect(expected.id).toBe(id);
      expect(expected.kind).toBe(type === "headless" ? "external" : type);
    },
  );
});
