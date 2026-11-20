import { canonicalJson, sha256HexSyncText } from "@vibestudio/content-addressing";
import { createTestDO } from "@vibestudio/durable/test-utils";
import { expect, it, vi } from "vitest";
import { GadHistoryDO } from "./GadHistoryDO.js";
import * as historyState from "./doltWorkspaceState.js";

class ReplayHistoryFixture extends GadHistoryDO {
  installReplay(replay: { head: string }) {
    this.setStateValue("history-installed", replay.head);
    this.setStateValue("history-replay-receipt", canonicalJson(replay));
  }
}

it("records the sealed legacy generation only for the exact installed replay", async () => {
  const replay = {
    head: "a".repeat(40), eventId: "shared-tip", contexts: [], frozenPlanDigest: "b".repeat(64),
  };
  const seal = {
    receiptDigest: sha256HexSyncText(canonicalJson(replay)),
    generation: "b882b7f0-0e3a-4ec3-9f6d-30ea541b14e1",
  };
  const env = { __objectKey: "canonical" };
  const { instance, db } = await createTestDO(ReplayHistoryFixture, env);
  expect(() => instance.recordHistoryReplaySeal(seal)).toThrow("exact history replay receipt");
  instance.installReplay(replay);
  expect(instance.readHistoryReplayReceipt({ includeLegacySeal: true })).toEqual({ ...replay, legacySeal: null });
  expect(() => instance.recordHistoryReplaySeal({ ...seal, receiptDigest: "0".repeat(64) }))
    .toThrow("exact history replay receipt");
  expect(() => instance.recordHistoryReplaySeal({ ...seal, generation: "invalid" }))
    .toThrow("Invalid legacy history seal generation");
  expect(instance.recordHistoryReplaySeal(seal)).toEqual(seal);
  const { instance: reopened } = await createTestDO(ReplayHistoryFixture, env, { db });
  expect(reopened.readHistoryReplayReceipt()).toEqual(replay);
  expect(reopened.readHistoryReplayReceipt({ includeLegacySeal: true })).toEqual({ ...replay, legacySeal: seal });
  expect(reopened.recordHistoryReplaySeal(seal)).toEqual(seal);
  expect(() => reopened.recordHistoryReplaySeal({
    ...seal, generation: "c5cedebf-ee43-4473-b6e4-ca3375df8972",
  })).toThrow("different legacy history seal");
});

it("binds the original template initialization to the verified replay and persists it once", async () => {
  const replay = {
    head: "a".repeat(40),
    eventId: "shared-tip",
    contexts: [],
    frozenPlanDigest: "b".repeat(64),
  };
  const replayReceiptDigest = sha256HexSyncText(canonicalJson(replay));
  const receipt = {
    commandId: "workspace-source:root",
    pin: { url: "https://example.test/root.git", ref: "refs/tags/v1", commit: "1".repeat(40) },
    initializedEventId: "initial-event",
    initializedStateHash: `state:${"3".repeat(64)}`,
  };
  const lookup = vi.spyOn(historyState, "workspaceCommitForRef");
  lookup.mockImplementation((_sql, head, state) =>
    head === replay.head && state.kind === "event" && state.eventId === receipt.initializedEventId
      ? "c".repeat(40)
      : null,
  );
  try {
    const env = { __objectKey: "canonical" };
    const { instance, db } = await createTestDO(ReplayHistoryFixture, env);
    instance.installReplay(replay);
    expect(instance.readHistoryReplayReceipt()).toEqual(replay);
    expect(instance.readHistoryReplayReceipt({ includeSourceInitialization: true }))
      .toEqual({ ...replay, sourceInitialization: null });
    expect(() => instance.rememberHistorySourceInitialization({ replayReceiptDigest: "0".repeat(64), receipt }))
      .toThrow("exact history replay receipt");
    expect(() => instance.rememberHistorySourceInitialization({
      replayReceiptDigest,
      receipt: { ...receipt, initializedEventId: "outside-event" },
    })).toThrow("outside the replayed history");
    instance.rememberHistorySourceInitialization({ replayReceiptDigest, receipt });
    const { instance: reopened } = await createTestDO(ReplayHistoryFixture, env, { db });
    expect(reopened.readHistoryReplayReceipt()).toEqual(replay);
    expect(reopened.readHistoryReplayReceipt({ includeSourceInitialization: true }))
      .toEqual({ ...replay, sourceInitialization: receipt });
    reopened.rememberHistorySourceInitialization({ replayReceiptDigest, receipt });
    expect(() => reopened.rememberHistorySourceInitialization({
      replayReceiptDigest,
      receipt: { ...receipt, pin: { ...receipt.pin, commit: "4".repeat(40) } },
    })).toThrow("different source initialization receipt");
  } finally {
    lookup.mockRestore();
  }
});
