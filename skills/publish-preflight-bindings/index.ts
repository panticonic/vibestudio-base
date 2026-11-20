import type { PanelHandle } from "@workspace/runtime/panel";
import type {
  PublicationReceipt,
  VerifiedPublication,
  WebsitePackage,
} from "@workspace/integrations/website";
import type {
  PublishIntent,
  WebsiteReviewObservation,
} from "../publish-preflight/types.js";
export type { PublicationNext } from "../publish-preflight/types.js";

type PanelEvidence = {
  panel: Awaited<ReturnType<PanelHandle["observe"]>>;
  snapshot: Awaited<ReturnType<PanelHandle["snapshot"]>>;
};

type WebsiteReviewAssignment = {
  reviewedSourceHash: string;
  requestedIntent: PublishIntent;
  reviewedIntent: PublishIntent;
  panelId: string;
  panelRef: string;
  panelBuildKey: string;
  approvedPaths: string[];
  presentationProbes: { id: string; text: string }[];
  operationId: string | null;
};

type WebsiteReviewSources = {
  readPackage(): Promise<WebsitePackage>;
  readPanel(): Promise<PanelEvidence>;
  readPublication(): Promise<{
    receipt: PublicationReceipt;
    readyUrl: string | null;
    verified: VerifiedPublication | null;
  } | null>;
};

async function manifestMatches(artifact: WebsitePackage): Promise<boolean> {
  const manifestFile = artifact.files.find(
    ({ path }) => path === "vibestudio-build.json",
  );
  if (!manifestFile || artifact.artifactDigest !== `sha256:${artifact.buildId}`)
    return false;
  const publicFiles = artifact.files.filter((file) => file !== manifestFile);
  const byPath = new Map(publicFiles.map((file) => [file.path, file]));
  if (byPath.size !== publicFiles.length || byPath.has(manifestFile.path))
    return false;
  for (const file of artifact.files) {
    const hash = await crypto.subtle.digest(
      "SHA-256",
      Uint8Array.from(file.bytes),
    );
    const actual = Array.from(new Uint8Array(hash), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    if (actual !== file.sha256) return false;
  }
  try {
    const manifest: unknown = JSON.parse(
      new TextDecoder().decode(manifestFile.bytes),
    );
    if (
      typeof manifest !== "object" ||
      manifest === null ||
      !("version" in manifest) ||
      manifest.version !== 1 ||
      !("buildId" in manifest) ||
      manifest.buildId !== artifact.buildId ||
      !("entry" in manifest) ||
      manifest.entry !== artifact.entryArtifact ||
      !byPath.has(artifact.entryArtifact) ||
      !("files" in manifest) ||
      !Array.isArray(manifest.files) ||
      manifest.files.length !== byPath.size ||
      Object.keys(manifest).length !== 4
    )
      return false;
    return manifest.files.every((entry: unknown) => {
      if (
        typeof entry !== "object" ||
        entry === null ||
        !("path" in entry) ||
        typeof entry.path !== "string" ||
        !("sha256" in entry) ||
        !("size" in entry) ||
        Object.keys(entry).length !== 3
      )
        return false;
      const actual = byPath.get(entry.path);
      if (
        !actual ||
        actual.sha256 !== entry.sha256 ||
        actual.bytes.byteLength !== entry.size
      )
        return false;
      byPath.delete(entry.path);
      return true;
    });
  } catch {
    return false;
  }
}

function sameIntent(first: PublishIntent, second: PublishIntent): boolean {
  return (
    first.provider === second.provider &&
    first.destination === second.destination &&
    first.environment === second.environment
  );
}

export function createWebsiteReadback(
  input: WebsiteReviewAssignment,
  sources: WebsiteReviewSources,
) {
  const assignment = structuredClone(input);
  return {
    async observe(): Promise<WebsiteReviewObservation> {
      const [artifact, { panel, snapshot }, publication] = await Promise.all([
        sources.readPackage(),
        sources.readPanel(),
        sources.readPublication(),
      ]);
      const approved = new Set(assignment.approvedPaths);
      const current =
        panel.kind === "workspace" &&
        panel.phase === "ready" &&
        panel.panelId === assignment.panelId &&
        snapshot.panelId === panel.panelId &&
        panel.requestedRef === assignment.panelRef &&
        panel.buildKey !== null &&
        panel.buildKey === assignment.panelBuildKey &&
        snapshot.buildKey === panel.buildKey &&
        snapshot.attemptId === panel.attemptId &&
        snapshot.runtimeEntityId === panel.runtimeEntityId;
      const observed = assignment.presentationProbes.filter(
        ({ text }) => current && snapshot.document.text.includes(text),
      );
      const receipt = publication?.receipt;
      const verified = publication?.verified;
      return {
        matchesRequest: sameIntent(
          assignment.requestedIntent,
          assignment.reviewedIntent,
        ),
        artifact: {
          referenceMatches:
            artifact.privateReceipt.sourceStateHash ===
            assignment.reviewedSourceHash,
          manifestMatches: await manifestMatches(artifact),
          hasHtml: artifact.files.some(
            (file) =>
              file.path === "index.html" &&
              file.contentType.startsWith("text/html") &&
              file.bytes.byteLength > 0,
          ),
          unapprovedFiles: artifact.files
            .filter(({ path }) => !approved.has(path))
            .map(({ path }) => path),
          publicFiles: artifact.files.length,
          artifactDigest: artifact.artifactDigest,
        },
        presentation: {
          matchesPanelAttempt: current,
          missedProbes: assignment.presentationProbes
            .filter((probe) => !observed.includes(probe))
            .map(({ id }) => id),
          observedProbes: observed.map(({ id }) => id),
        },
        publication: receipt
          ? {
              phase: receipt.phase,
              matchesIntent: sameIntent(receipt, assignment.reviewedIntent),
              matchesArtifact:
                receipt.artifactDigest === artifact.artifactDigest,
              matchesOperation:
                assignment.operationId !== null &&
                receipt.operationId === assignment.operationId,
              observedReadyUrl: Boolean(
                receipt.url && publication?.readyUrl === receipt.url,
              ),
              verifiedPublicDigest: Boolean(
                verified &&
                receipt.phase === "submitted" &&
                verified.url &&
                receipt.url === verified.url &&
                verified.deploymentId === receipt.deploymentId &&
                verified.operationId === receipt.operationId &&
                sameIntent(verified, receipt) &&
                verified.artifactDigest === receipt.artifactDigest &&
                receipt.artifactDigest === artifact.artifactDigest &&
                Number.isFinite(Date.parse(verified.verifiedAt)),
              ),
            }
          : null,
      };
    },
  };
}
