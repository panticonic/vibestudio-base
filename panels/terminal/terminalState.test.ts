import { applyStateArgsMergePatch } from "@vibestudio/shared/panelStateArgs";
import { JsonObjectSchema } from "@vibestudio/shared/wireValues";
import { describe, expect, it } from "vitest";
import {
  defaultTerminalState,
  loadTerminalState,
  terminalStatePatch,
  TERMINAL_STATE_SCHEMA_VERSION,
} from "./terminalState.js";
import type { TerminalState } from "./types.js";

describe("terminal exact state", () => {
  it("creates defaults only when the panel has no persisted state", () => {
    expect(loadTerminalState(null)).toEqual(defaultTerminalState());
  });

  it("loads the current exact schema without rewriting it", () => {
    const current = {
      ...defaultTerminalState(),
      panelTitle: "Build terminal",
      tree: { kind: "leaf" as const, sessionId: "session-1" },
      focusedSessionId: "session-1",
      perSession: {
        "session-1": {
          cwd: "/repo",
          originalArgv: ["pnpm", "dev"],
          readCursor: 12,
          lastSeenAt: 34,
        },
      },
      scratchBuffers: [{ bufferId: "scratch-1", text: "echo hi", createdAt: 1, updatedAt: 2 }],
      scratchActiveBufferId: "scratch-1",
    };

    expect(loadTerminalState(current)).toEqual(current);
  });

  it("persists JSON-safe layout snapshots and removes obsolete split and session fields", () => {
    const survivor = { kind: "leaf" as const, sessionId: "survivor" };
    const previous: TerminalState = {
      ...defaultTerminalState(),
      tree: {
        kind: "split",
        direction: "row",
        ratio: 0.5,
        a: survivor,
        b: { kind: "leaf", sessionId: "closed" },
      },
      focusedSessionId: "survivor",
      zoomedSessionId: "closed",
      perSession: { closed: { cwd: "/repo", readCursor: 0, lastSeenAt: 1 } },
    };
    const saved = JsonObjectSchema.parse(terminalStatePatch({}, previous));
    const next: TerminalState = {
      ...defaultTerminalState(),
      tree: survivor,
      focusedSessionId: "survivor",
      perSession: {
        survivor: { label: undefined, cwd: "/repo", readCursor: 0, lastSeenAt: 1 },
      },
    };
    const patch = JsonObjectSchema.parse(terminalStatePatch(saved, next));
    const persisted = applyStateArgsMergePatch(saved, patch);

    expect(persisted).not.toHaveProperty("zoomedSessionId");
    expect(persisted).not.toHaveProperty("perSession.closed");
    expect(persisted.tree).toEqual(survivor);
    expect(loadTerminalState(persisted)).toEqual(next);
  });

  it("does not restore transient scratch visibility", () => {
    const current = { ...defaultTerminalState(), scratchOpen: true };
    expect(loadTerminalState(current)).toEqual({ ...current, scratchOpen: false });
  });

  it("reopens the state written during a live session update", () => {
    const state: TerminalState = {
      ...defaultTerminalState(),
      panelTitle: "  Build   terminal  ",
      focusedSessionId: "first",
      tree: {
        kind: "split",
        direction: "row",
        ratio: 0.9,
        a: { kind: "leaf", sessionId: "first" },
        b: { kind: "leaf", sessionId: "second" },
      },
      perSession: { first: { cwd: "", readCursor: 12, lastSeenAt: 34 } },
    };
    const patch = JsonObjectSchema.parse(terminalStatePatch({}, state));
    const reopened = loadTerminalState(applyStateArgsMergePatch({}, patch));
    expect(reopened).toMatchObject({
      panelTitle: "Build terminal",
      focusedSessionId: "first",
      tree: state.tree,
      perSession: { first: { cwd: ".", readCursor: 12, lastSeenAt: 34 } },
    });
  });

  it("starts empty panels", () => {
    expect(loadTerminalState({})).toEqual(defaultTerminalState());
  });

  it.each([false, 0, "", []])("rejects non-object persisted state", (state) => {
    expect(() => loadTerminalState(state)).toThrow(/schema version/);
  });

  it.each([
    { ...defaultTerminalState(), schemaVersion: TERMINAL_STATE_SCHEMA_VERSION + 1 },
    { ...defaultTerminalState(), schemaVersion: TERMINAL_STATE_SCHEMA_VERSION - 1 },
    { ...defaultTerminalState(), fontSize: Number.NaN },
    { ...defaultTerminalState(), panelTitle: "  rewritten  " },
    { ...defaultTerminalState(), unexpected: "stale" },
    { ...defaultTerminalState(), scratchActiveBufferId: "missing" },
  ])("rejects non-current, malformed, or rewritten state", (state) => {
    expect(() => loadTerminalState(state)).toThrow(/current exact schema|schema version/);
  });
});
