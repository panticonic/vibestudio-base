export type PanelMigrationAssignment = {
  id: string; goal: string; title: string; original: string; destination: string; repository: string;
  authority: { mode: "local" | "inspect"; destination: string; revision: string };
};
export type ConsumerLink = {
  id: string; value: string; carrier: "scheme" | "https" | null; source: string | null;
  scope: "working" | "historical" | "foreign" | "invalid"; compatible: boolean;
};
export type MigrationObservation = {
  id: string; workingRevision: string; mainRevision: string; repository: string; location: string | null;
  layout: "original" | "moved" | "parked" | "missing";
  destinationOwner: string | null; destinationPanel: boolean;
  compatiblePanel: boolean; actualSource: string | null; contractDigest: string | null;
  buildIdentity: "current" | "needs-alignment" | "unexpected"; manifestDigest: string; consumerDigest: string; consumerLinks: ConsumerLink[];
};
export type MigrationDecision = "hold-collision" | "hold-layout" | "hold-contract" | "hold-scope" |
  "inspect-only" | "keep-current" | "move-source" | "update-consumers" | "move-and-update" | "align-build" | "align-and-update";
export type MigrationReceipt = {
  status: "moved" | "aligned" | "updated" | "state-changed" | "not-authorized";
  workingRevision: string; observation: MigrationObservation;
  operation: { applicationId: string; changeIds: string[] } | null;
};
