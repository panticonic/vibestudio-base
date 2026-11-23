import { expect, it } from "vitest";
import verifyVersion from "./reviewAssetIntegrity/planRecovery/verifyVersion.js";
import type { AssetVersionRead } from "./types.js";
function version(edition: "archive" | "approved", digest: string): AssetVersionRead {
  const file = { id: "opaque-file", path: "payload.bin", digest, mode: 420, size: 5, type: "bytes" as const };
  return { version: { id: edition, edition, bundle: "Bundle", dossier: "manifest" }, files: [file],
    manifest: { bundle: "Bundle", edition, release: "verified", assets: [{ key: "asset", path: file.path, digest, mode: file.mode, output: "copy.bin" }] },
    inspected: [{ ...file, manifest: null }] };
}
it("validates each edition independently without inventing cross-edition equality", () => {
  const archive = verifyVersion(version("archive", "older-digest"));
  const approved = verifyVersion(version("approved", "newer-digest"));
  expect(archive.assets[0]?.identityMatches).toBe(true);
  expect(approved.assets[0]?.identityMatches).toBe(true);
  expect(archive.version.edition).toBe("archive");
  expect(approved.version.edition).toBe("approved");
  expect(archive.assets[0]?.digest).not.toBe(approved.assets[0]?.digest);
});
it("rejects contradictions inside an edition and preserves edition identity", () => {
  const changed = version("approved", "approved-digest");
  changed.inspected[0]!.digest = "different-readback";
  expect(verifyVersion(changed).assets[0]?.identityMatches).toBe(false);
  const wrongEdition = version("approved", "approved-digest");
  wrongEdition.manifest.edition = "archive";
  expect(verifyVersion(wrongEdition).manifestIdentityMatches).toBe(false);
  expect(verifyVersion(wrongEdition).assets[0]?.identityMatches).toBe(false);
});
