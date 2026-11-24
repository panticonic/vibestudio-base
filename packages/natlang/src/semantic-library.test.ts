import { expect, it } from "vitest";
import { qualifyInstalledCodebase } from "../scripts/qualify-installed-codebase.ts";

const workspaces = ["base", "system", "personal", "google-workspace", "examples", "news", "spectrolite", "system-testing"];
it.each(workspaces)("compiles the exact installed source snapshot for %s and every assigned catalog entry", async workspace => {
  const proof = await qualifyInstalledCodebase(workspace);
  expect(proof.requiredEntries).toBeGreaterThan(0);
  expect(proof.snapshotReads).toBeGreaterThanOrEqual(proof.compiledCodebases);
}, 180_000);
