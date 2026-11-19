export type IntegrationRequest = { goal: string; operationId: string };
export type IntegrationUse = "fetch" | "publish" | "git-http" | "git-ssh";
export type IntegrationDestination = {
  id: string;
  purpose: string;
  use: IntegrationUse;
  required: boolean;
};
export type IntegrationPlan = {
  receipt: string;
  destinations: IntegrationDestination[];
};
export type IntegrationObservation = {
  id: string;
  receipt: string;
  state: "missing" | "unverified" | "active" | "expired" | "revoked";
  canRefresh: boolean | null;
};
export type DestinationDisposition =
  | "ready"
  | "setup-needed"
  | "renewal-needed"
  | "authorization-unverified";
export type DestinationReview = {
  observation: IntegrationObservation;
  disposition: DestinationDisposition;
};
export type IntegrationReport = {
  planReceipt: string;
  destinations: DestinationReview[];
  held: string[];
  status:
    | "ready"
    | "setup-needed"
    | "renewal-needed"
    | "authorization-unverified";
  guidance: string | null;
};
export type IntegrationCoverage = {
  status:
    | "ready"
    | "setup-needed"
    | "renewal-needed"
    | "authorization-unverified";
  guidance: string | null;
};
