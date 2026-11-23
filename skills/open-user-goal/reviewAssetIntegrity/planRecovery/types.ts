import type { AssetVersion } from "../../types.js";
export type AssetIdentityCheck = {
  key: string;
  path: string;
  output: string;
  id: string | null;
  digest: string | null;
  mode: number | null;
  identityMatches: boolean;
  issues: string[];
};
export type AssetVersionIdentity = {
  version: AssetVersion;
  release: "verified" | "review" | "blocked";
  manifestIdentityMatches: boolean;
  assets: AssetIdentityCheck[];
};
