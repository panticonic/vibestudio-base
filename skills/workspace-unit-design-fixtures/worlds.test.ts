import { authorityMethods } from "@vibestudio/service-schemas/authority";
import { unitVerificationReceiptV1Schema } from "@vibestudio/service-schemas/build";
import { extensionStatusSchema } from "@vibestudio/service-schemas/extensions";
import {
  UnitManifestError,
  extensionUnitManifestDescriptor,
  validateUnitManifest,
} from "@vibestudio/shared/unitManifest";
import { expect, it } from "vitest";
import type { UnitReviewLeaf } from "../workspace-unit-design/types.ts";
import { verifyWorkspaceUnitReview } from "./oracle.js";
import { workspaceUnitDesignWorlds } from "./worlds.js";

it("gives each authored request a distinct identity and preserves compound source lineages", () => {
  const ids = workspaceUnitDesignWorlds.map(({ id }) => id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.length).toBeGreaterThanOrEqual(45);
  for (const world of workspaceUnitDesignWorlds) {
    if (world.request.kind === "composed") {
      expect(world.sourceGroups).toContain(world.sourceGroup);
      expect(world.sourceGroups?.length).toBe(world.request.work.length);
    }
  }
});

it.each(workspaceUnitDesignWorlds)(
  "$id has an exact outcome and rejects evidence substitution",
  ({ expected }) => {
    expect(verifyWorkspaceUnitReview(expected, structuredClone(expected))).toBe(
      true,
    );
    const wrongDecision = expected.decision === "ready" ? "waiting" : "ready";
    expect(
      verifyWorkspaceUnitReview(expected, {
        ...expected,
        decision: wrongDecision,
      }),
    ).toBe(false);
    expect(
      verifyWorkspaceUnitReview(expected, {
        ...expected,
        finding: `${expected.finding}-alias`,
      }),
    ).toBe(false);
    expect(
      verifyWorkspaceUnitReview(expected, {
        ...expected,
        evidenceIds: [...expected.evidenceIds.slice(0, -1), "other-receipt"],
      }),
    ).toBe(false);
    if (expected.components) {
      expect(
        verifyWorkspaceUnitReview(expected, {
          ...expected,
          components: [...expected.components].reverse(),
        }),
      ).toBe(false);
    }
  },
);

const manifestByOutcome = {
  "manifest-verified": {
    extension: {
      activationEvents: ["onInvoke"],
      methodAuthority: {
        listEntries: {
          website: {
            kind: "closed",
            reason: "The extension's workspace caller owns this read.",
          },
          effect: { kind: "open" },
        },
      },
    },
  },
  MANIFEST_KIND: { client: {} },
};

function receiptCases(request: UnitReviewLeaf): void {
  const evidence = request.evidence;
  if (
    evidence.kind === "manifest" &&
    evidence.receipt?.candidateDigest === evidence.candidateDigest
  ) {
    const code = evidence.receipt.errorCode;
    const manifest = code
      ? manifestByOutcome.MANIFEST_KIND
      : manifestByOutcome["manifest-verified"];
    let actualCode = null;
    try {
      validateUnitManifest(extensionUnitManifestDescriptor, manifest, {
        unitName: "@workspace-extensions/reading-list",
      });
    } catch (error) {
      if (!(error instanceof UnitManifestError)) throw error;
      actualCode = error.code;
    }
    expect(actualCode).toEqual(code);
  }

  if (evidence.kind === "activation" || evidence.kind === "canary") {
    for (const receipt of [
      evidence.build,
      evidence.kind === "canary" ? evidence.test : null,
    ]) {
      if (!receipt) continue;
      const { id, status, ...fields } = receipt;
      expect(id).toBeTruthy();
      expect(
        unitVerificationReceiptV1Schema.safeParse({
          protocol: "unit-verification-receipt.v1",
          ...fields,
          ...(status === null ? {} : { status }),
          reportDigest: "b".repeat(64),
        }).success,
      ).toBe(true);
    }
  }

  if (
    (evidence.kind === "activation" || evidence.kind === "method") &&
    evidence.status
  ) {
    const { id, pendingApproval, ...fields } = evidence.status;
    expect(id).toBeTruthy();
    expect(
      extensionStatusSchema.safeParse({
        ...fields,
        name: "@workspace-extensions/reading-list",
        displayName: "Reading list",
        version: "1.0.0",
        activeBundleKey: fields.activeEv ? "reading-list-bundle" : null,
        lastBuiltAt: null,
        pendingApproval: pendingApproval
          ? { kind: pendingApproval, submittedAt: 1 }
          : null,
        availableUpdate: null,
        identity: null,
        health: null,
        hasFetch: false,
        respawn: null,
      }).success,
    ).toBe(true);
  }

  if (evidence.kind === "preflight" && evidence.preflight) {
    const { id, decision, leaves } = evidence.preflight;
    const status = {
      allowed: "granted",
      acquirable: "acquirable",
      denied: "denied",
    }[decision];
    expect(id).toBeTruthy();
    expect(
      authorityMethods.preflight.returns.safeParse({
        decision,
        leaves: leaves.map(({ capability, resource, tier }) => ({
          capability,
          resourceKey: resource,
          status,
          tier,
        })),
      }).success,
    ).toBe(true);
  }
}

it.each(workspaceUnitDesignWorlds)(
  "$id uses the underlying host receipt contracts",
  ({ request }) => {
    for (const work of request.kind === "composed" ? request.work : [request])
      receiptCases(work);
  },
);
