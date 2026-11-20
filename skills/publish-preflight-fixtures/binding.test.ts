import { readFile, writeFile } from "node:fs/promises";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  packageWebsite,
  verifyPublishedWebsite,
  type PublicationReceipt,
} from "@workspace/integrations/website";
import type {
  PublishBlocker,
  PublishPreflightReport,
  WebsiteReviewObservation,
} from "../publish-preflight/types.js";
import { createWebsiteReadback } from "../publish-preflight-bindings/index.js";
import {
  publicationRequest,
  publicationWorlds,
  verifyPublicationOutcome,
  type PublishWorld,
} from "./worlds.js";

async function fixture(world: PublishWorld) {
  const path = "site.js";
  const data = new TextEncoder().encode(
    `document.title = ${JSON.stringify(world.site)};`,
  );
  const extra = {
    path: "review-only.txt",
    role: "asset",
    contentType: "text/plain",
    encoding: "utf8",
    byteLength: 7,
    integrity: null,
  };
  const call = vi.fn(async () => ({
    buildKey: "build-private",
    sourceStateHash:
      world.gap === "source" ? "older-source" : "reviewed-source",
    artifacts: [
      {
        path,
        role: "primary",
        contentType: "text/javascript",
        encoding: "utf8",
        byteLength: data.length,
        integrity: null,
      },
      ...(world.gap === "extra" ? [extra] : []),
    ],
    website: { entryArtifact: path, declaration: { title: world.site } },
  }));
  const stream = vi.fn(
    async (_peer: unknown, _method: unknown, args: string[]) =>
      new Response(args[1] === path ? data : "private"),
  );
  const result = await packageWebsite(
    { call, stream } as unknown as Parameters<typeof packageWebsite>[0],
    world.site,
    "state:reviewed",
  );
  if (world.gap === "manifest")
    result.files = result.files.filter(
      (file) => file.path !== "vibestudio-build.json",
    );
  if (world.gap === "html")
    result.files = result.files.filter((file) => file.path !== "index.html");
  const requestedIntent = publicationRequest(world).intendedDestination;
  const target = { ...requestedIntent, destination: world.site };
  const url = "https://owned.example/";
  const receipt: PublicationReceipt | null = world.phase
    ? {
        ...target,
        phase: world.phase,
        operationId:
          world.gap === "operation" ? "operation-old" : "operation-review",
        artifactDigest:
          world.gap === "artifact" ? "sha256:another" : result.artifactDigest,
        destination: world.gap === "target" ? "outside-target" : world.site,
        url: world.phase === "submitted" ? url : undefined,
        deploymentId:
          world.phase === "submitted" ? "provider-issued" : undefined,
        updatedAt: "2025-07-03T09:00:00Z",
      }
    : null;
  const readyUrl =
    world.gap === "provider"
      ? null
      : world.gap === "public-url"
        ? "https://another.example/"
        : (receipt?.url ?? null);
  const verified =
    receipt?.url &&
    readyUrl === receipt.url &&
    world.gap !== "unverified" &&
    world.gap !== "artifact"
      ? await verifyPublishedWebsite(
          receipt,
          async () =>
            new Response(
              result.files.find(
                (file) => file.path === "vibestudio-build.json",
              )!.bytes as Uint8Array<ArrayBuffer>,
            ),
        )
      : null;
  const readback = createWebsiteReadback(
    {
      reviewedSourceHash: "reviewed-source",
      requestedIntent,
      reviewedIntent: target,
      panelId: "supplier-panel",
      panelRef: "state:reviewed",
      panelBuildKey: "reviewed-panel-build",
      approvedPaths: [path, "index.html", ".nojekyll", "vibestudio-build.json"],
      presentationProbes: [{ id: "public-heading", text: world.requiredLabel }],
      operationId: "operation-review",
    },
    {
      readPackage: async () => result,
      readPanel: async () => ({
        panel: {
          kind: "workspace",
          panelId: "supplier-panel",
          attemptId: "attempt-reviewed",
          buildKey: "reviewed-panel-build",
          runtimeEntityId: "render-runtime",
          requestedRef: "state:reviewed",
          title: world.site,
          source: world.site,
          contextId: "assigned",
          effectiveVersion: null,
          parentId: null,
          phase: "ready",
          attemptRef: { epoch: "boot", attemptId: "attempt-reviewed" },
          updatedAt: 12,
        },
        snapshot: {
          panelId: "supplier-panel",
          attemptId:
            world.gap === "panel" ? "earlier-attempt" : "attempt-reviewed",
          buildKey: "reviewed-panel-build",
          runtimeEntityId: "render-runtime",
          capturedAt: 15,
          document: {
            kind: "synth",
            structure: {},
            text:
              world.gap === "presentation"
                ? "Generic chart title"
                : world.requiredLabel,
          },
        },
      }),
      readPublication: async () =>
        receipt ? { receipt, readyUrl, verified } : null,
    },
  );
  return { call, stream, observed: await readback.observe() };
}

function referenceVerdict(
  world: PublishWorld,
  observed: WebsiteReviewObservation,
): PublishPreflightReport {
  const blockers: PublishBlocker[] = [];
  const showPhase =
    world.action === "check-existing" && /progress|timeline/u.test(world.goal);
  const compare = /Compare preview against production/u.test(world.goal);
  if (!observed.matchesRequest) {
    return {
      status: "blocked",
      blockers: ["different-request"],
      evidence: ["Different assigned destination"],
      visual: "Prose",
    };
  }
  const { artifact, presentation, publication } = observed;
  if (!artifact.referenceMatches) blockers.push("source-reference");
  if (!artifact.manifestMatches) blockers.push("public-manifest");
  if (!artifact.hasHtml) blockers.push("html-entry");
  if (artifact.unapprovedFiles.length) blockers.push("public-paths");
  if (!presentation.matchesPanelAttempt) blockers.push("stale-panel");
  else if (presentation.missedProbes.length)
    blockers.push("missing-presentation");
  if (
    publication &&
    (!publication.matchesArtifact ||
      !publication.matchesIntent ||
      !publication.matchesOperation)
  ) {
    blockers.push("different-publication");
  } else if (world.action === "check-existing") {
    if (!publication) blockers.push("missing-publication");
    else if (publication.phase !== "submitted" || !publication.observedReadyUrl)
      blockers.push("awaiting-provider");
    else if (!publication.verifiedPublicDigest) blockers.push("verify-public");
  }
  const status = !blockers.length
    ? world.action === "prepare"
      ? "ready-for-review"
      : "verified"
    : blockers.every(
          (value) => value === "awaiting-provider" || value === "verify-public",
        )
      ? "waiting"
      : "blocked";
  const next = world.action === "prepare" ? undefined
    : blockers.includes("different-publication") ? "hold-review"
    : !publication ? "recover-receipt"
    : publication.phase !== "submitted" ? "resume-operation"
    : !publication.observedReadyUrl ? "watch-provider"
    : !publication.verifiedPublicDigest ? "verify-public" : "complete";
  return {
    status,
    next,
    blockers,
    evidence: [artifact.artifactDigest],
    visual: compare
      ? "Compare"
      : showPhase
        ? "Timeline"
        : blockers.length > 1 || /checklist/u.test(world.goal)
          ? "Checklist"
          : "Prose",
  };
}

describe("Vibestudio publication preflight worlds", () => {
  const fixtures = new Map<string, Awaited<ReturnType<typeof fixture>>>();
  beforeAll(async () => {
    for (const world of publicationWorlds)
      fixtures.set(world.id, await fixture(world));
    const captured = Object.fromEntries(
      [...fixtures].map(([id, result]) => [id, result.observed]),
    );
    const output = process.env["VIBESTUDIO_PUBLICATION_OBSERVATIONS_OUT"];
    if (output) {
      await writeFile(output, JSON.stringify(captured, null, 2) + "\n");
    } else {
      const published = await readFile(
        new URL("./observations.json", import.meta.url),
        "utf8",
      );
      expect(captured).toEqual(JSON.parse(published));
    }
  });

  it.each(publicationWorlds)(
    "projects canonical package and readback receipts for $id",
    async (world) => {
      const { call, observed } = fixtures.get(world.id)!;
      expect(call).toHaveBeenCalledWith("main", expect.anything(), [
        world.site,
        "state:reviewed",
      ]);
      const reference = referenceVerdict(world, observed);
      expect(verifyPublicationOutcome(world, reference, observed)).toBe(true);
      if (world.expectedNext && world.expectedNext !== "resume-operation") {
        expect(verifyPublicationOutcome(world, { ...reference, next: "resume-operation" }, observed)).toBe(false);
      }
      expect(
        verifyPublicationOutcome(
          world,
          {
            ...reference,
            blockers: [...reference.blockers, "different-request"],
          },
          observed,
        ),
      ).toBe(false);
      expect(
        verifyPublicationOutcome(
          world,
          { ...reference, evidence: [] },
          observed,
        ),
      ).toBe(false);
      expect(JSON.stringify(observed)).not.toContain("build-private");
      expect(JSON.stringify(observed)).not.toContain("https://owned.example/");
    },
  );
});
