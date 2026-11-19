export type VcsDeliveryRequest = {
  operationId: string;
  goal: string;
  repository: string;
  path: string;
};

export type VcsDeliveryState =
  | { kind: "event"; eventId: string }
  | { kind: "application"; applicationId: string };

export type VcsDeliveryVersion = {
  fileId: string;
  hash: string;
  mode: number;
  excerpt: string | null;
  truncated: boolean;
};

export type VcsDeliveryIntegration = {
  source:
    | { kind: "event"; eventId: string }
    | { kind: "external-delta"; deltaId: string };
  remaining: number;
  conflicts: number;
  concluded: boolean;
  stale: boolean;
};

export type VcsDeliverySnapshot = {
  contextId: string;
  current: boolean;
  clean: boolean;
  relation: "at" | "ahead" | "behind" | "diverged";
  working: VcsDeliveryState;
  committed: VcsDeliveryState;
  protectedMain: VcsDeliveryState;
  integrations: VcsDeliveryIntegration[];
  file: {
    path: string;
    working: VcsDeliveryVersion | null;
    committed: VcsDeliveryVersion | null;
    protectedMain: VcsDeliveryVersion | null;
    hasLocalDifference: boolean;
    hasDeliveryDifference: boolean;
  };
};

export type VcsDeliveryLocalChain = {
  state: "clean" | "uncommitted";
  summary: string;
};

export type VcsDeliveryMainReview = {
  state: "current" | "integrate" | "decisions-open" | "conclusion-pending";
  summary: string;
};

export type VcsDeliveryChain = {
  local: VcsDeliveryLocalChain;
  main: VcsDeliveryMainReview;
};

export type VcsDeliveryChange = {
  effect: string;
  risks: string[];
  checks: string[];
};

export type VcsDeliveryStep =
  | "refresh"
  | "resolve-integration"
  | "integrate-main"
  | "conclude-integration"
  | "verify-then-commit"
  | "verify-then-publish"
  | "already-current";

export type VcsDeliveryReport = {
  snapshot: VcsDeliverySnapshot;
  chain: VcsDeliveryChain | null;
  review: VcsDeliveryChange | null;
  next: VcsDeliveryStep;
};
