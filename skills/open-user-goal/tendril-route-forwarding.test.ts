import { beforeEach, expect, it, vi } from "vitest";
const probe = vi.hoisted(() => vi.fn());
vi.mock("natlang:services", () => ({ tendrilRouteRead: { probe } }));
import project from "./reviewTendrilRoute/reviewSlot/probeSlot/project.js";
import type { TendrilRouteSnapshot } from "./types.js";
const board: TendrilRouteSnapshot = { id: "opaque-board", revision: "opaque-revision", title: "Board", room: "Room", audience: "Audience", edition: "current",
  channel: "channel", source: "source", stateRevision: 1, agent: "attached", retainAllowed: false,
  utterance: { text: "Review this instruction", via: "text" }, slots: [{ id: "opaque-slot", label: "View", device: "device", state: "current", functions: [] }] };
beforeEach(() => probe.mockReset());
it("forwards board and slot identities from their distinct typed records", async () => {
  const result = { status: "changed", revision: "fresh-revision" };
  probe.mockResolvedValue(result);
  expect(await project(board, board.slots[0]!)).toBe(result);
  expect(probe).toHaveBeenCalledWith("opaque-board", "opaque-slot", "opaque-revision");
});
it("rejects a slot borrowed from another board", async () => {
  await expect(project(board, { ...board.slots[0]!, id: "foreign-slot" })).rejects.toThrow("not in the observed board");
  expect(probe).not.toHaveBeenCalled();
});
