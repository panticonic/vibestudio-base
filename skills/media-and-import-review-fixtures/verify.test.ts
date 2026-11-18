import { describe, expect, it } from "vitest";
import {
  projectGitStatus,
  projectPdfReadback,
  projectSpeechReadback,
} from "./project.js";
import { verifyMediaImportWorld } from "./verify.js";
import { mediaImportWorlds } from "./worlds.js";

function get(id: string) {
  const world = mediaImportWorlds.find(
    (item) => item.id === `media-import-${id}`,
  );
  if (!world) throw new Error(id);
  return world;
}
function answer(world: ReturnType<typeof get>) {
  return {
    findings: world.expected.map((entry) => ({
      ...entry,
      detail:
        world.request.speech?.evidence?.error ?? "From the supplied receipts.",
    })),
  };
}

describe("Media and import evidence", () => {
  it("verifies every authored reference and keeps case IDs unique", () => {
    expect(new Set(mediaImportWorlds.map(({ id }) => id)).size).toBe(33);
    for (const world of mediaImportWorlds)
      expect(verifyMediaImportWorld(world, answer(world)), world.id).toBe(true);
  });

  it("rejects alternative wording in the verbatim transcript field", () => {
    const world = get("verbatim-multiwindow-result");
    const report = answer(world);
    report.findings[0]!.transcript = "Talk to Marta.";
    expect(verifyMediaImportWorld(world, report)).toBe(false);
  });

  it("requires the original worker error even when the model knows the status", () => {
    const world = get("original-engine-failure");
    const report = answer(world);
    report.findings[0]!.detail = "Some engine did not finish.";
    expect(verifyMediaImportWorld(world, report)).toBe(false);
  });

  it("preserves historical and current remote observations separately", () => {
    const status = projectGitStatus("observe", {
      repoPath: "projects/ledger",
      autoPush: true,
      state: "fetch-failed",
      lastSuccessfulObservationAt: 41300,
      remote: "origin",
      branch: "main",
    });
    expect(status).toMatchObject({
      state: "fetch-failed",
      observedAt: null,
      lastSuccessfulObservationAt: 41300,
      remoteBranchExists: null,
    });
  });

  it("distinguishes selected PDF probe pages from real extracted page evidence", () => {
    const projected = projectPdfReadback("probe", {
      document: {
        digest: "owned",
        pageCount: 3,
        encrypted: false,
        metadata: {},
        scannedHint: true,
      },
      selectedPages: [2, 3],
      engines: [],
      warnings: [],
    });
    expect(projected.selectedPages).toEqual([2, 3]);
    expect(projected.pages).toEqual([]);
  });

  it("does not treat speech progress as a transcript or discard the terminal state", () => {
    const projected = projectSpeechReadback(
      {
        id: "receipt",
        operationId: "owned",
        generation: "verified",
        format: "pcm_f32le",
        sampleRate: 16000,
        channels: 1,
        inputBytes: 16000,
        terminal: "cancelled",
        error: null,
      },
      [{ type: "progress", message: "Input joined" }],
    );
    expect(projected.terminal).toBe("cancelled");
    expect(projected.events).toEqual([
      { type: "progress", message: "Input joined" },
    ]);
  });
});
