import { isDeepStrictEqual } from "node:util";
import { bindTemplateCandidate } from "../template-candidate-bindings/index.js";
import type { TemplateUpdateReview } from "@vibestudio/service-schemas/templates";
import type { CandidateReport } from "../template-candidate/types.js";
import type { CandidateWorld } from "./worlds.js";

export function createTemplateCandidateFixture(world: CandidateWorld) {
  const operations: string[] = [];
  const { sourceUrl, commandId, incomingCommit } = world.request;
  const installed = "main:review-baseline";
  const acknowledgment: TemplateUpdateReview = {
    operationId: commandId,
    contextId: "template-update-assigned-context",
    mainEventId: installed,
    sourceUrl,
    status: "review",
    target: world.next?.target ?? {
      url: sourceUrl,
      ref: "refs/heads/main",
      commit: incomingCommit,
    },
    repositories: [
      { repoPath: "panels/preview", kind: "changed" },
      { repoPath: "workers/notification", kind: "added" },
    ],
    conflicts: [],
  };

  const observed = structuredClone(acknowledgment);
  if (world.outcome === "wrong-context") observed.contextId = "another-context";
  if (world.outcome === "published") observed.status = "published";
  if (world.outcome === "conflicts") {
    observed.conflicts.push({
      deltaId: "release-delta",
      repoPath: "panels/preview",
      coordinate: {
        status: "conflict",
        coordinate: { kind: "file", id: "local-preview-contract", paths: {} },
        aspects: [
          {
            aspect: "content",
            status: "conflict",
            base: "base",
            ours: "local",
            theirs: "incoming",
          },
        ],
        attribution: { ours: [], theirs: [] },
        resolutions: ["ours", "theirs"],
        summary: "The preview contract changed on both sides.",
      },
    });
  }

  let discoveries = 0;
  let prepared = false;
  const bindings = bindTemplateCandidate(
    {
      async updateStatus() {
        operations.push("discovery");
        const selected = discoveries++ ? world.next : world.initial;
        return {
          workspaceEpoch: 0,
          workspaceAppVersion: "0.1.106",
          currentAppVersion: "0.1.106",
          checks: selected ? [structuredClone(selected)] : [],
        };
      },
      async prepareUpdate(input) {
        operations.push("prepare");
        if (
          !isDeepStrictEqual(input, {
            commandId,
            sourceUrl,
            target: world.next?.target,
          })
        ) {
          operations.push("incorrect-target");
          throw new Error("Expected the exact reviewed and authorized pin.");
        }
        prepared = true;
        if (world.outcome === "lost")
          throw new Error("Preparation acknowledgment lost.");
        return structuredClone(acknowledgment);
      },
      async reviewUpdate(input) {
        operations.push("review");
        if (!prepared || input.operationId !== commandId) {
          operations.push("incorrect-review");
          throw new Error("Expected the prepared operation.");
        }
        if (world.outcome === "review-offline")
          throw new Error("Review endpoint unavailable.");
        return structuredClone(observed);
      },
    },
    async () => {
      operations.push("main");
      if (world.outcome === "main-offline")
        throw new Error("Protected main is unavailable.");
      return world.outcome === "stale-base" || world.outcome === "published"
        ? "main:advanced"
        : installed;
    },
    world.request,
  );

  return {
    bindings,
    verify(value: unknown) {
      const report = value as CandidateReport | null;
      if (
        !report ||
        report.status !== world.status ||
        !isDeepStrictEqual(operations, world.operations) ||
        report.operationId !== (world.outcome ? commandId : null)
      )
        return false;
      const check = world.initial;
      const offer = check && {
        installedCommit: check.source.commit,
        incomingCommit: check.target?.commit ?? null,
        checkedAt: check.checkedAt,
        workspaceAppVersion: "0.1.106",
        currentAppVersion: "0.1.106",
        targetAppVersion: check.targetAppVersion ?? null,
        minimumAppVersion: check.targetMinimumAppVersion ?? null,
        hostUnavailable: Boolean(check.hostError),
        status: check.status,
      };
      if (!isDeepStrictEqual(report.offer, offer)) return false;
      if (
        ![
          "validate-candidate",
          "resolve-conflicts",
          "already-published",
        ].includes(world.status)
      )
        return report.candidate === null;
      return isDeepStrictEqual(report.candidate, {
        operationId: commandId,
        contextId: observed.contextId,
        mainEventId: installed,
        incomingCommit,
        state: observed.status,
        repositories: observed.repositories,
        conflicts:
          world.outcome === "conflicts"
            ? [
                {
                  deltaId: "release-delta",
                  repoPath: "panels/preview",
                  kind: "file",
                  id: "local-preview-contract",
                },
              ]
            : [],
      });
    },
  };
}
