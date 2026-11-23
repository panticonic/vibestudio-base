import type { AssetVersionRead } from "../../types.js";
import type { AssetVersionIdentity } from "./types.js";

/** Compare each file with its own edition's manifest and independent readback. */
export default function verifyVersion(read: AssetVersionRead): AssetVersionIdentity {
  const manifestIdentityMatches = read.manifest.bundle === read.version.bundle && read.manifest.edition === read.version.edition;
  const assets = read.manifest.assets.map(row => {
    const listed = read.files.filter(file => file.path === row.path);
    const file = listed.length === 1 ? listed[0]! : null;
    const inspected = file ? read.inspected.filter(value => value.id === file.id) : [];
    const observed = inspected.length === 1 ? inspected[0]! : null;
    const issues: string[] = [];
    if (!manifestIdentityMatches) issues.push("manifest belongs to another bundle or edition");
    if (read.manifest.assets.filter(value => value.key === row.key || value.path === row.path).length !== 1)
      issues.push("ambiguous manifest identity");
    if (!file) issues.push("missing or ambiguous listed file");
    if (!observed) issues.push("missing or ambiguous independent readback");
    if (file && (file.digest !== row.digest || file.mode !== row.mode)) issues.push("listed metadata differs from this manifest");
    if (observed && (observed.path !== row.path || observed.digest !== row.digest || observed.mode !== row.mode))
      issues.push("independent readback differs from this manifest");
    if (file && observed && (file.size !== observed.size || file.type !== observed.type)) issues.push("listed and readback metadata differ");
    return { key: row.key, path: row.path, output: row.output, id: file?.id ?? null,
      digest: observed?.digest ?? null, mode: observed?.mode ?? null, identityMatches: issues.length === 0, issues };
  });
  return { version: read.version, release: read.manifest.release, manifestIdentityMatches, assets };
}
