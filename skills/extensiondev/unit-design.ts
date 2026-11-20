import { vcs } from "@workspace/runtime";
import {
  extensionUnitManifestDescriptor,
  readAndValidateUnitManifest,
  UnitManifestError,
} from "@vibestudio/shared/unitManifest";
import type {
  ExtensionManifestEvidence,
  LiveExtensionDesignEvidence,
  LiveExtensionDesignRequest,
} from "../workspace-unit-design/types.js";

type State = Awaited<ReturnType<typeof vcs.status>>["workingHead"];

export function bindExtensionDesign(input: {
  contextId: string;
  source: string;
  name: string;
  goal: string;
}) {
  const { contextId, source, name, goal } = input;
  const operationId = crypto.randomUUID();
  const request: LiveExtensionDesignRequest = { kind: "extension-design-live", goal, operationId };
  let used = false;

  async function read(state: State, side: "working" | "published"): Promise<ExtensionManifestEvidence> {
    const repository = await vcs.resolveRepository({ state, repoPath: source });
    const file = repository && await vcs.readFile({
      state, repositoryId: repository.repositoryId, file: { kind: "path", path: "package.json" },
    });
    if (file?.content.kind !== "text")
      return { kind: "manifest", source, candidateDigest: "", receipt: null };
    const text = file.content.text;
    let errorCode: string | null = null;
    try {
      readAndValidateUnitManifest(
        extensionUnitManifestDescriptor, `${source}/package.json`, { unitName: name }, () => text,
      );
    } catch (error) {
      if (!(error instanceof UnitManifestError)) throw error;
      errorCode = error.code;
    }
    if (errorCode !== "MANIFEST_PARSE" && JSON.parse(text)?.name !== name)
      throw new Error("The assigned repository contains a different extension");
    const candidateDigest = file.contentHash;
    return {
      kind: "manifest", source, candidateDigest,
      receipt: { id: `${operationId}:${side}`, unit: source, candidateDigest, errorCode },
    };
  }

  return {
    request,
    services: {
      extensionDesignRead: {
        async inspect(id: string): Promise<LiveExtensionDesignEvidence> {
          if (id !== operationId || used)
            throw new Error("Inspect only the assigned extension manifests once");
          used = true;
          const { workingHead, mainEventId } = await vcs.status({ contextId });
          const [working, published] = await Promise.all([
            read(workingHead, "working"),
            read({ kind: "event", eventId: mainEventId }, "published"),
          ]);
          return {
            contextId,
            workingRevision: workingHead.kind === "event" ? workingHead.eventId : workingHead.applicationId,
            mainRevision: mainEventId, working, published,
          };
        },
      },
    },
  };
}
