/** What to do about a failed template inspection, fetch, or publication. */
export type TemplateRemedy =
  | "connect-credential"
  | "stop-integrity"
  | "retry-later"
  | "reinspect-authoring"
  | "fix-authoring-dependency"
  | "check-publication-outcome"
  | "unrecognized";

/** The kind of template an inspection describes, as the template registry names kinds. */
export type TemplateRole =
  | "base"
  | "personal"
  | "system"
  | "development"
  | "catalog";

/** A dependency a template declares on another template. */
export type TemplateDependency = {
  url: string;
  track?: string;
  commit?: string;
};

/** The result of the templates extension's `inspect`. */
export type TemplateInspection = {
  /** The exact immutable source that was inspected. */
  pin: { url: string; ref: string; commit: string };
  /** The template's own name and one-sentence description; absent when it declares none. */
  presentation?: { name?: string; description?: string };
  /** The repository paths the template contains, such as "panels/chat" or "packages/feeds". */
  repositories: string[];
  /** The templates it is built on; empty for a template that stands alone. */
  dependencies: TemplateDependency[];
};

/** A template at a glance. */
export type TemplateSummary = {
  name: string;
  description: string | null;
  role: TemplateRole;
  /** The first 12 characters of the inspected commit. */
  commit: string;
  /** The URLs of the templates it depends on. */
  dependsOn: string[];
  /** How many repositories it holds under each top-level folder: { panels: 3, workers: 2 }. */
  parts: Record<string, number>;
};

export type TemplateHostReceipt = {
  epoch: number;
  targetEpoch: number;
  minimumAppVersion: string | null;
  minimumMet: boolean;
  matchingTargetAvailable: boolean;
  supportedSourceSchema: boolean;
};
export type Compatibility =
  | "same-epoch"
  | "matching-host-required"
  | "minimum-version-required"
  | "schema-unsupported"
  | "epoch-handoff";
export type TemplateWorkspaceInput = {
  kind: "workspace";
  goal: string;
  source: "host-snapshot" | "git" | "chooser-link";
  pin: string | null;
  snapshotCaptured: boolean;
  host: TemplateHostReceipt;
};
export type TemplateUpdateInput = {
  kind: "update";
  goal: string;
  intent: "monitor" | "prepare" | "publish";
  installedWatch: "active" | "paused" | "retired" | "missing";
  host: TemplateHostReceipt;
  targetPin: string;
  review: null | {
    operationId: string;
    targetPin: string;
    conflicts: number;
    semanticReview: boolean;
    checks: "passed" | "failed" | "pending";
    current: boolean;
    approved: boolean;
  };
};
export type TemplatePublicationInput = {
  kind: "publication";
  goal: string;
  inspectedFingerprint: string;
  currentFingerprint: string;
  missingParts: string[];
  destination: string | null;
  version: string | null;
  receipt: null | {
    operationId: string;
    url: string;
    commit: string;
    snapshot: string;
    matches: boolean;
  };
};
export type TemplateTransferInput = {
  kind: "transfer";
  goal: string;
  audienceReviewed: boolean;
  audienceCurrent: boolean;
  headCurrent: boolean;
  fileCount: number;
  bytes: number;
  selectable: boolean;
  existingRepo: boolean;
  receipt: null | {
    operationId: string;
    remaining: number;
    committed: boolean;
  };
};
export type TemplateLifecycleRequest =
  | { kind: "inspect"; goal: string; inspection: TemplateInspection }
  | { kind: "recover"; goal: string; error: string }
  | TemplateWorkspaceInput
  | TemplateUpdateInput
  | TemplatePublicationInput
  | TemplateTransferInput;
export type TemplateDecision =
  | {
      kind: "workspace";
      next:
        | "review-link"
        | "capture-snapshot"
        | "inspect-pin"
        | "resolve-compatibility"
        | "ready-to-create";
      compatibility: Compatibility;
      basis: string | null;
    }
  | {
      kind: "update";
      next:
        | "use-installed-watch"
        | "resume-installed-watch"
        | "watch-retired"
        | "check-provisioning"
        | "resolve-compatibility"
        | "prepare-review"
        | "resume-review"
        | "resolve-conflicts"
        | "validate-candidate"
        | "await-approval"
        | "ready-to-publish";
      compatibility: Compatibility;
      basis: string;
    }
  | {
      kind: "publication";
      next:
        | "reinspect"
        | "include-required-parts"
        | "request-target"
        | "ready-to-publish"
        | "published"
        | "reconcile-receipt";
      basis: string;
    }
  | {
      kind: "transfer";
      next:
        | "refine-selection"
        | "review-audience"
        | "refresh-head"
        | "ready-to-copy"
        | "continue-merge"
        | "locally-copied";
      basis: string | null;
    };
export type TemplateLifecycleReport =
  | { kind: "inspect"; summary: TemplateSummary }
  | { kind: "recover"; remedy: TemplateRemedy }
  | TemplateDecision;
