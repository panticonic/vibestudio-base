import { packageWebsite, type WebsitePackage } from "@workspace/integrations/website";
import { contextId, rpc } from "@workspace/runtime";
import type {
  PublicationRevisionComparison,
  PublicationRevisionPackage,
  PublishIntent,
} from "../publish-preflight/types.js";

type Assignment = {
  goal: string;
  source: string;
  reviewed: WebsitePackage;
  reviewedIntent: PublishIntent;
  candidateIntent: PublishIntent;
};
const maximumPublicFiles = 64;

function describe(site: WebsitePackage, intent: PublishIntent): PublicationRevisionPackage {
  const sourceHash = site.privateReceipt.sourceStateHash;
  const files = site.files.map(({ path, sha256, bytes }) => ({
    path, digest: sha256, bytes: bytes.byteLength,
  }));
  if (!sourceHash || files.length > maximumPublicFiles ||
    new Set(files.map(({ path }) => path)).size !== files.length ||
    !files.some(({ path }) => path === site.entryArtifact))
    throw new Error("Review one sealed website package with a bounded public inventory");
  return { sourceHash, artifactDigest: site.artifactDigest, entry: site.entryArtifact, intent, files };
}

export function bindPublicationRevision(input: Assignment) {
  const { goal, source } = input;
  if (!contextId || !goal.trim() || !/^panels\/[^/]+$/u.test(source))
    throw new Error("Assign one website source in the current workspace context");
  const ref = `ctx:${contextId}` as const;
  const reviewed = describe(input.reviewed, structuredClone(input.reviewedIntent));
  const candidateIntent = structuredClone(input.candidateIntent);
  const request = { goal, operationId: crypto.randomUUID() };
  let receipt: Promise<PublicationRevisionComparison> | undefined;

  async function compare(): Promise<PublicationRevisionComparison> {
    const candidate = describe(await packageWebsite(rpc, source, ref), candidateIntent);
    const before = new Map(reviewed.files.map((file) => [file.path, file]));
    const after = new Map(candidate.files.map((file) => [file.path, file]));
    return {
      source, reviewed, candidate,
      change: {
        added: candidate.files.filter(({ path }) => !before.has(path)),
        removed: reviewed.files.filter(({ path }) => !after.has(path)),
        modified: candidate.files.flatMap((file) => {
          const previous = before.get(file.path);
          return previous && (previous.digest !== file.digest || previous.bytes !== file.bytes)
            ? [{ before: previous, after: file }] : [];
        }),
      },
    };
  }

  return {
    request,
    services: {
      publicationRevision: {
        async compare(id: string): Promise<PublicationRevisionComparison> {
          if (id !== request.operationId) throw new Error("Review only the caller's assigned package");
          return structuredClone(await (receipt ??= compare()));
        },
      },
    },
  };
}
