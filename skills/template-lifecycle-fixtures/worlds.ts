import type {
  Compatibility,
  TemplateHostReceipt,
  TemplateLifecycleReport,
  TemplateLifecycleRequest,
  TemplatePublicationInput,
  TemplateTransferInput,
  TemplateUpdateInput,
  TemplateWorkspaceInput,
} from "../templates/types.js";

export type TemplateWorld = {
  id: string;
  sourceGroup: string;
  request: TemplateLifecycleRequest;
  expected: TemplateLifecycleReport;
};

function task(
  id: string,
  group: string,
  request: TemplateLifecycleRequest,
  expected: TemplateLifecycleReport,
): TemplateWorld {
  return {
    id: `template-${id}`,
    sourceGroup: `vibestudio:templates:${group}`,
    request,
    expected,
  };
}

type Next<K extends TemplateLifecycleReport["kind"]> =
  Extract<TemplateLifecycleReport, { kind: K }> extends { next: infer N }
    ? N
    : never;
const compatible: TemplateHostReceipt = {
  epoch: 0,
  targetEpoch: 0,
  minimumAppVersion: "0.1.84",
  minimumMet: true,
  matchingTargetAvailable: true,
  supportedSourceSchema: true,
};
const host = (patch: Partial<TemplateHostReceipt> = {}) => ({
  ...compatible,
  ...patch,
});
const pin = "4a2b81e5c013";
const watch: TemplateUpdateInput["installedWatch"] = "active";
const review = {
  operationId: "review-rotation",
  targetPin: pin,
  conflicts: 0,
  semanticReview: true,
  checks: "passed" as const,
  current: true,
  approved: false,
};
const release = {
  operationId: "publish-assigned-5",
  url: "https://git.example.org/team/template",
  commit: "f013559d2",
  snapshot: "snap-d26f",
  matches: true,
};

function workspace(
  id: string,
  group: string,
  goal: string,
  patch: Partial<TemplateWorkspaceInput>,
  next: Next<"workspace">,
  compatibility: Compatibility = "same-epoch",
) {
  const request: TemplateWorkspaceInput = {
    kind: "workspace",
    goal,
    source: "git",
    pin,
    snapshotCaptured: false,
    host: compatible,
    ...patch,
  };
  return task(id, group, request, {
    kind: "workspace",
    next,
    compatibility,
    basis: request.pin,
  });
}
function update(
  id: string,
  group: string,
  goal: string,
  patch: Partial<TemplateUpdateInput>,
  next: Next<"update">,
  compatibility: Compatibility = "same-epoch",
  basis = pin,
) {
  const request: TemplateUpdateInput = {
    kind: "update",
    goal,
    intent: "prepare",
    installedWatch: watch,
    host: compatible,
    targetPin: pin,
    review: null,
    ...patch,
  };
  return task(id, group, request, {
    kind: "update",
    next,
    compatibility,
    basis,
  });
}
function publication(
  id: string,
  group: string,
  goal: string,
  patch: Partial<TemplatePublicationInput>,
  next: Next<"publication">,
) {
  const request: TemplatePublicationInput = {
    kind: "publication",
    goal,
    inspectedFingerprint: "fp-new",
    currentFingerprint: "fp-new",
    missingParts: [],
    destination: "https://git.example.org/team/template",
    version: "0.4.0",
    receipt: null,
    ...patch,
  };
  return task(id, group, request, {
    kind: "publication",
    next,
    basis: request.receipt?.operationId ?? request.currentFingerprint,
  });
}
function transfer(
  id: string,
  group: string,
  goal: string,
  patch: Partial<TemplateTransferInput>,
  next: Next<"transfer">,
) {
  const request: TemplateTransferInput = {
    kind: "transfer",
    goal,
    audienceReviewed: true,
    audienceCurrent: true,
    headCurrent: true,
    fileCount: 4,
    bytes: 4096,
    selectable: true,
    existingRepo: true,
    receipt: null,
    ...patch,
  };
  return task(id, group, request, {
    kind: "transfer",
    next,
    basis: request.receipt?.operationId ?? null,
  });
}

export const templateLifecycleWorlds: TemplateWorld[] = [
  workspace(
    "chooser-keeps-review",
    "chooser-intake",
    "The documentation link opens Add workspace with the cookbook repository selected. What still needs to happen?",
    { source: "chooser-link", pin: null },
    "review-link",
  ),
  workspace(
    "unborn-host-checkpoint",
    "host-snapshot",
    "Use my host folder with unsaved changes to seed a separate workspace. The picker returned no captured snapshot.",
    { source: "host-snapshot", pin: null },
    "capture-snapshot",
  ),
  workspace(
    "host-checkpoint-pin-needed",
    "host-snapshot",
    "The picker captured a local workspace with unpublished notes. Check what immutable basis is still missing.",
    { source: "host-snapshot", pin: null, snapshotCaptured: true },
    "inspect-pin",
  ),
  workspace(
    "host-checkpoint-ready",
    "host-snapshot",
    "Use the captured local checkpoint from the selected host path with its exact reviewed pin.",
    { source: "host-snapshot", snapshotCaptured: true },
    "ready-to-create",
  ),
  workspace(
    "git-head-is-not-pin",
    "git-intake",
    "I selected the Lab template repository, and its default branch can still move. Tell me the next step before creating the workspace.",
    { pin: null },
    "inspect-pin",
  ),
  workspace(
    "approved-git-checkpoint",
    "git-intake",
    "A pinned repository snapshot has been inspected with its dependency closure. What is ready?",
    {},
    "ready-to-create",
  ),
  workspace(
    "newer-template-lacks-host",
    "foreign-epoch",
    "This source advertises a newer system epoch. Assess whether the installed host can create the workspace.",
    { host: host({ targetEpoch: 1, matchingTargetAvailable: false }) },
    "resolve-compatibility",
    "matching-host-required",
  ),
  workspace(
    "newer-template-handoff",
    "foreign-epoch",
    "The supplied host selector shows the newer epoch is available. Check the remaining compatibility boundary from the current host.",
    { host: host({ targetEpoch: 1 }) },
    "resolve-compatibility",
    "epoch-handoff",
  ),
  workspace(
    "dependency-raised-floor",
    "minimum-host",
    "The final composed source says the image is below the highest inherited minimum version. What needs attention?",
    { host: host({ minimumMet: false }) },
    "resolve-compatibility",
    "minimum-version-required",
  ),
  workspace(
    "unsupported-schema-before-host",
    "schema-envelope",
    "A workspace source inspection reached the stable envelope, but its manifest cannot be interpreted by the selected host. Can it proceed?",
    {
      host: host({
        supportedSourceSchema: false,
        matchingTargetAvailable: false,
      }),
    },
    "resolve-compatibility",
    "schema-unsupported",
  ),
  update(
    "watch-existing-active",
    "watch-state",
    "Find how this workspace monitors updates while no chat panel is open.",
    { intent: "monitor" },
    "use-installed-watch",
  ),
  update(
    "watch-paused-preserves-revision",
    "watch-state",
    "I want to resume checking for updates. The installed six-hour monitor is paused.",
    { intent: "monitor", installedWatch: "paused" },
    "resume-installed-watch",
  ),
  update(
    "watch-retired-check-provisioning",
    "watch-state",
    "The monitor was retired. Is it checking for updates in the background?",
    { intent: "monitor", installedWatch: "retired" },
    "watch-retired",
  ),
  update(
    "watch-absent-after-bootstrap",
    "watch-state",
    "Check why the expected member-bound monitor is absent after setup. Do not install anything new.",
    { intent: "monitor", installedWatch: "missing" },
    "check-provisioning",
  ),
  update(
    "incompatible-target-still-visible",
    "watch-vs-apply",
    "Can I still inspect availability with the existing monitor if the update requires a newer app image?",
    { intent: "monitor", host: host({ minimumMet: false }) },
    "use-installed-watch",
    "minimum-version-required",
  ),
  update(
    "prepare-next-pin",
    "update-review",
    "Prepare a review for the new pinned workspace target. No candidate exists yet.",
    {},
    "prepare-review",
  ),
  update(
    "discard-stale-review-basis",
    "update-review",
    "Check a previously prepared review after its workspace head changed.",
    { review: { ...review, current: false } },
    "prepare-review",
  ),
  update(
    "keep-new-target-not-old-operation",
    "update-review",
    "We switched which upstream revision to review. The previous receipt refers to a different target.",
    { review: { ...review, targetPin: "prior-revision" } },
    "prepare-review",
  ),
  update(
    "conflicted-review",
    "merge-readback",
    "There are thirteen unresolved coordinates in the assigned review context. What is the next action?",
    { review: { ...review, conflicts: 13 } },
    "resolve-conflicts",
    "same-epoch",
    review.operationId,
  ),
  update(
    "clean-has-no-semantic-review",
    "merge-readback",
    "The merge produced no conflicts. No one checked whether the old behavior and incoming intent survived.",
    { review: { ...review, semanticReview: false } },
    "validate-candidate",
    "same-epoch",
    review.operationId,
  ),
  update(
    "conflict-free-test-failed",
    "merge-readback",
    "Semantic inspection succeeded but the original workspace smoke failed. Assess publication readiness.",
    {
      intent: "publish",
      review: { ...review, checks: "failed", approved: true },
    },
    "validate-candidate",
    "same-epoch",
    review.operationId,
  ),
  update(
    "approval-cannot-replace-pending-check",
    "merge-readback",
    "Publishing was approved, but the build checks are still pending. Decide which gate comes next.",
    {
      intent: "publish",
      review: { ...review, checks: "pending", approved: true },
    },
    "validate-candidate",
    "same-epoch",
    review.operationId,
  ),
  update(
    "prepare-operation-handoff",
    "update-intent",
    "I only asked to prepare the reviewed candidate. What should the handoff preserve?",
    { review },
    "resume-review",
    "same-epoch",
    review.operationId,
  ),
  update(
    "approval-for-exact-review",
    "update-intent",
    "Check whether the independently validated candidate can be published. Approval is missing.",
    { intent: "publish", review },
    "await-approval",
    "same-epoch",
    review.operationId,
  ),
  update(
    "deliberate-publish",
    "update-intent",
    "I approved publishing this exact validated review. What is next?",
    { intent: "publish", review: { ...review, approved: true } },
    "ready-to-publish",
    "same-epoch",
    review.operationId,
  ),
  update(
    "foreign-epoch-confirmed-candidate",
    "foreign-epoch-review",
    "The new epoch's host is available and the exact candidate passed review. Check the authorized handoff.",
    {
      intent: "publish",
      host: host({ targetEpoch: 1 }),
      review: { ...review, approved: true },
    },
    "ready-to-publish",
    "epoch-handoff",
    review.operationId,
  ),
  update(
    "foreign-epoch-downgrade-before-publish",
    "foreign-epoch-review",
    "The prepared candidate targets the previous host epoch, but no matching host is selectable. Is approval enough?",
    {
      intent: "publish",
      host: host({ epoch: 1, targetEpoch: 0, matchingTargetAvailable: false }),
      review: { ...review, approved: true },
    },
    "resolve-compatibility",
    "matching-host-required",
  ),
  publication(
    "changed-since-inspection",
    "authoring-fingerprint",
    "The workspace changed since the authoring inspection. We have a destination and selected version. Assess the next step.",
    { inspectedFingerprint: "fp-old" },
    "reinspect",
  ),
  publication(
    "missing-companion",
    "authoring-closure",
    "Inspect readiness to publish a new worker template whose analysis found a required local runtime companion.",
    { missingParts: ["workers/export-sidecar"] },
    "include-required-parts",
  ),
  publication(
    "missing-target",
    "authoring-destination",
    "The authoring inspection is complete but no one selected a destination. What is missing?",
    { destination: null },
    "request-target",
  ),
  publication(
    "missing-version",
    "authoring-destination",
    "Prepare an authoring publication using the selected repo. We have not set the new version.",
    { version: null },
    "request-target",
  ),
  publication(
    "ready-authoring",
    "authoring-destination",
    "Check whether the unchanged inspection, complete closure, destination and chosen version support a publication request.",
    {},
    "ready-to-publish",
  ),
  publication(
    "complete-release-readback",
    "publication-receipt",
    "Check whether the release succeeded. The requested operation returned its URL, commit and snapshot.",
    { receipt: release },
    "published",
  ),
  publication(
    "wrong-release-receipt",
    "publication-receipt",
    "The callback returned another release operation's receipt. Should this release be reported as published?",
    { receipt: { ...release, matches: false } },
    "reconcile-receipt",
  ),
  publication(
    "partial-release-receipt",
    "publication-receipt",
    "The transport returned a source URL and operation ID but did not return the published snapshot. What should I check?",
    { receipt: { ...release, snapshot: "" } },
    "reconcile-receipt",
  ),
  transfer(
    "review-audience-first",
    "transfer-audience",
    "I selected mixed source code for a shared destination. It has not been reviewed for its audience.",
    { audienceReviewed: false },
    "review-audience",
  ),
  transfer(
    "changed-audience-before-copy",
    "transfer-audience",
    "The private destination became shared after the preview. Can the reviewed bytes be copied yet?",
    { audienceCurrent: false },
    "review-audience",
  ),
  transfer(
    "destination-head-changed",
    "transfer-head",
    "The audience still matches, but another update moved the destination head. Assess the copy review.",
    { headCurrent: false },
    "refresh-head",
  ),
  transfer(
    "limits-inclusive",
    "transfer-limits",
    "The selected files are regular and exactly meet the reviewed count and size limits. What does the metadata permit?",
    { fileCount: 200, bytes: 4194304 },
    "ready-to-copy",
  ),
  transfer(
    "oversized-byte-count",
    "transfer-limits",
    "The source metadata shows a small selection above the maximum total bytes. Check before reading the content.",
    { bytes: 4194305 },
    "refine-selection",
  ),
  transfer(
    "too-many-tiny-files",
    "transfer-limits",
    "Review an extremely small byte total covering too many selected source files.",
    { fileCount: 201, bytes: 235 },
    "refine-selection",
  ),
  transfer(
    "unsupported-selection",
    "transfer-limits",
    "The selected paths include unsupported objects, although the file count is below the limit.",
    { selectable: false },
    "refine-selection",
  ),
  transfer(
    "bare-selection",
    "transfer-limits",
    "I cleared all checked files. Does the readback support preparing the copy?",
    { fileCount: 0, bytes: 0 },
    "refine-selection",
  ),
  transfer(
    "existing-merge-has-work",
    "transfer-readback",
    "The copied source appears in a review delta with conflict coordinates. Explain the remaining step.",
    { receipt: { operationId: "copy-delta", remaining: 2, committed: false } },
    "continue-merge",
  ),
  transfer(
    "merge-finished-uncommitted",
    "transfer-readback",
    "The copied files resolved cleanly, but the destination commit is absent. Is this a completed copy?",
    { receipt: { operationId: "copy-merge", remaining: 0, committed: false } },
    "continue-merge",
  ),
  transfer(
    "new-repo-local-no-push",
    "transfer-readback",
    "The new repository import reports a local commit. Determine whether the source copy finished.",
    {
      existingRepo: false,
      receipt: { operationId: "copy-new", remaining: 0, committed: true },
    },
    "locally-copied",
  ),
  task(
    "recover-private-source",
    "inspect-recovery",
    {
      kind: "recover",
      goal: "The private source provider refused template inspection. Identify the next recovery action from the error.",
      error: "Connect a Git credential for the private template source.",
    },
    { kind: "recover", remedy: "connect-credential" },
  ),
  task(
    "recover-wrong-snapshot",
    "inspect-recovery",
    {
      kind: "recover",
      goal: "Diagnose the downloaded source inspection before using it.",
      error:
        "The recorded SHA-256 snapshot does not match the pinned template manifest.",
    },
    { kind: "recover", remedy: "stop-integrity" },
  ),
  task(
    "recover-unreachable-source",
    "inspect-recovery",
    {
      kind: "recover",
      goal: "Determine what is supported after this outage.",
      error: "DNS resolution timed out while fetching the remote source.",
    },
    { kind: "recover", remedy: "retry-later" },
  ),
  task(
    "recover-stale-source",
    "inspect-recovery",
    {
      kind: "recover",
      goal: "A local edit interrupted publishing. Explain the next safe step.",
      error:
        "Authoring inspection became stale because workspace source changed.",
    },
    { kind: "recover", remedy: "reinspect-authoring" },
  ),
  task(
    "recover-interrupted-release",
    "inspect-recovery",
    {
      kind: "recover",
      goal: "How should I resume an interrupted release?",
      error: "Publication failed after the remote upload step had begun.",
    },
    { kind: "recover", remedy: "check-publication-outcome" },
  ),

  task(
    "inspect-foundation",
    "template-roles",
    {
      kind: "inspect",
      goal: "Summarize the immutable source that supplies the shared foundation and its package inventory.",
      inspection: {
        pin: {
          url: "https://git.example.org/org/foundation.git",
          ref: "v0.3.0",
          commit: "f5104c58bb747e62",
        },
        repositories: [
          "skills/workspace-dev",
          "panels/chat",
          "packages/runtime",
          "packages/codec",
          "workers/agent",
          "extensions/templates",
        ],
        dependencies: [],
      },
    },
    {
      kind: "inspect",
      summary: {
        name: "foundation",
        description: null,
        role: "base",
        commit: "f5104c58bb74",
        dependsOn: [],
        parts: { skills: 1, panels: 1, packages: 2, workers: 1, extensions: 1 },
      },
    },
  ),
  task(
    "inspect-testing-layer",
    "template-roles",
    {
      kind: "inspect",
      goal: "Decide what the checkpoint adds to the workspace and preserve its exact dependency in the summary.",
      inspection: {
        pin: {
          url: "https://git.example.org/org/test-harness",
          ref: "v0.9.1",
          commit: "bb430d7e47125597",
        },
        presentation: {
          name: "Acceptance",
          description: "  Dedicated fixtures and acceptance runs  ",
        },
        repositories: [
          "workers/system-test-runner",
          "skills/system-testing",
          "agents/test-agent",
        ],
        dependencies: [{ url: "https://git.example.org/org/foundation.git" }],
      },
    },
    {
      kind: "inspect",
      summary: {
        name: "Acceptance",
        description: "Dedicated fixtures and acceptance runs",
        role: "development",
        commit: "bb430d7e4712",
        dependsOn: ["https://git.example.org/org/foundation.git"],
        parts: { workers: 1, skills: 1, agents: 1 },
      },
    },
  ),
  task(
    "inspect-host-client-layer",
    "template-roles",
    {
      kind: "inspect",
      goal: "Summarize the source that brings desktop and phone clients with settings for the installed application.",
      inspection: {
        pin: {
          url: "https://git.example.org/org/system",
          ref: "v0.1.1",
          commit: "ce900ae4cc897ce2",
        },
        repositories: [
          "clients/desktop",
          "clients/mobile",
          "extensions/phone",
          "about/runtime",
        ],
        dependencies: [{ url: "https://git.example.org/org/base" }],
      },
    },
    {
      kind: "inspect",
      summary: {
        name: "system",
        description: null,
        role: "system",
        commit: "ce900ae4cc89",
        dependsOn: ["https://git.example.org/org/base"],
        parts: { clients: 2, extensions: 1, about: 1 },
      },
    },
  ),
  task(
    "inspect-owner-toolbox",
    "template-roles",
    {
      kind: "inspect",
      goal: "Classify this workspace setup layer and count its private user facilities.",
      inspection: {
        pin: {
          url: "https://git.example.org/org/user-tools",
          ref: "v2",
          commit: "5a46c676bb3908f3",
        },
        presentation: { name: "Owner tools" },
        repositories: [
          "skills/memory",
          "skills/onboarding",
          "packages/browser-data",
          "extensions/credentials",
        ],
        dependencies: [{ url: "https://git.example.org/org/base" }],
      },
    },
    {
      kind: "inspect",
      summary: {
        name: "Owner tools",
        description: null,
        role: "personal",
        commit: "5a46c676bb39",
        dependsOn: ["https://git.example.org/org/base"],
        parts: { skills: 2, packages: 1, extensions: 1 },
      },
    },
  ),
  task(
    "inspect-city-guide-catalog",
    "template-roles",
    {
      kind: "inspect",
      goal: "Determine whether the pinned city guide is a new workspace foundation or a topic-specific installable layer.",
      inspection: {
        pin: {
          url: "https://git.example.org/org/city-guide",
          ref: "main",
          commit: "c47b30e49cd839ba",
        },
        repositories: ["panels/itinerary", "panels/map", "workers/places"],
        dependencies: [
          { url: "https://git.example.org/org/base", track: "stable" },
        ],
      },
    },
    {
      kind: "inspect",
      summary: {
        name: "city-guide",
        description: null,
        role: "catalog",
        commit: "c47b30e49cd8",
        dependsOn: ["https://git.example.org/org/base"],
        parts: { panels: 2, workers: 1 },
      },
    },
  ),
];
