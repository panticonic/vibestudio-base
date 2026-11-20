export type PackageField = "runtime-dependency" | "contract-export" | "native-suite";
export type ReviewScope = {
  source: string; field: PackageField; key: string;
  workingRevision: string; workingDigest: string; baselineDigest: string;
  grant: "restore" | "inspect" | "suspended";
};
export type PackageAssignment = { operationId: string; goal: string; target: string; source: string; field: PackageField; key: string; scope: ReviewScope };
export type SuiteRequest = { operationId: string; goal: string; target: string; suite: string; file: null; testName: null; mode: "inspect" };
export type PackageValue = {
  dependency: string | null; devDependency: string | null; peerDependency: string | null;
  contractExport: unknown; suite: { name: string; runtime: "native" | "workerd" | "browser"; include: string[] } | null;
};
export type PackageObservation = {
  operationId: string; target: string; source: string; mainRevision: string; workingRevision: string;
  name: string; baselineName: string; workingDigest: string; baselineDigest: string;
  receiver: { protocol: string; source: string; name: string; className: string | null; targetId: string | null } | null;
  catalog: { source: string; name: string; kind: string } | null;
  baselineValue: PackageValue; workingValue: PackageValue;
  declaredReceiverMatches: boolean; scopeMatches: boolean; targetFieldMatches: boolean;
  suiteRequest: SuiteRequest | null;
};
export type PackageDecision = "preserve-current" | "hold-foreign-package" | "hold-review-scope" | "hold-authorization" | "restore-approved-field";
export type PackageRestore = { status: "restored" | "state-changed" | "not-authorized"; observation: PackageObservation };
