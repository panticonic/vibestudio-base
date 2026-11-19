import { extensions, vcs } from "@workspace/runtime";
import type {
  ExtensionManifestView,
  ExtensionReleaseRequest,
  ExtensionRuntime,
  ExtensionSource,
} from "./natlang/types.js";

type State = Awaited<ReturnType<typeof vcs.status>>["workingHead"];

async function observeRevision(
  state: State,
  source: string,
  name: string,
): Promise<{ manifest: ExtensionManifestView | null; tree: string | null }> {
  const repository = await vcs.resolveRepository({ state, repoPath: source });
  if (!repository) return { manifest: null, tree: null };
  const repositoryId = repository.repositoryId;
  const file = await vcs.readFile({
    state,
    repositoryId,
    file: { kind: "path", path: "package.json" },
  });
  const rows: [path: string, mode: number, contentHash: string][] = [];
  let cursor: string | undefined;
  do {
    const page = await vcs.listFiles({
      state,
      repositoryId,
      cursor,
      limit: 200,
    });
    for (const { path, mode, contentHash } of page.files)
      rows.push([path, mode, contentHash]);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  rows.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(rows)),
  );
  const tree = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (file?.content.kind !== "text") return { manifest: null, tree };
  const data = JSON.parse(file.content.text);
  if (data.name !== name)
    throw new Error(
      "The extension manifest does not match the assigned canonical name",
    );
  const declaration = data.vibestudio?.extension;
  if (!declaration) return { manifest: null, tree };
  const [event] = declaration.activationEvents ?? [];
  return {
    tree,
    manifest: {
      hash: file.contentHash,
      activation:
        event === "*"
          ? "startup"
          : event === "onInvoke"
            ? "on-invoke"
            : "unknown",
      methods: Object.keys(declaration.methodAuthority ?? {}).sort(),
    },
  };
}

export function bindExtensionRelease(input: {
  contextId: string;
  name: string;
  source: string;
  method: string;
  goal: string;
}) {
  const { contextId, name, source, method, goal } = input;
  const operationId = crypto.randomUUID();
  const request: ExtensionReleaseRequest = { goal, operationId, method };
  let sourceObserved = false;
  let runtimeRead = false;
  return {
    request,
    services: {
      extensionReleaseRead: {
        async source(id: string): Promise<ExtensionSource> {
          if (id !== operationId)
            throw new Error("Read only the assigned extension manifest");
          const { workingHead, mainEventId } = await vcs.status({ contextId });
          const publishedState = {
            kind: "event",
            eventId: mainEventId,
          } as const;
          const publishedRead = observeRevision(publishedState, source, name);
          const [working, published] = await Promise.all([
            workingHead.kind === "event" && workingHead.eventId === mainEventId
              ? publishedRead
              : observeRevision(workingHead, source, name),
            publishedRead,
          ]);
          sourceObserved = true;
          return {
            operationId,
            contextId,
            name,
            source,
            workingRevision:
              workingHead.kind === "event"
                ? workingHead.eventId
                : workingHead.applicationId,
            mainRevision: mainEventId,
            working: working.manifest,
            published: published.manifest,
            workingTree: working.tree,
            publishedTree: published.tree,
          };
        },
        async runtime(id: string): Promise<ExtensionRuntime> {
          if (id !== operationId || !sourceObserved || runtimeRead)
            throw new Error(
              "Inspect only the assigned extension after observing its source",
            );
          runtimeRead = true;
          const status = await extensions.status(name);
          if (status.name !== name || status.source !== source)
            throw new Error("The runtime returned a different extension");
          return {
            operationId,
            name,
            source,
            status: status.status,
            activeEv: status.activeEv,
            identity: status.identity?.entityId ?? null,
            methods: [...status.methods],
            pendingApproval: status.pendingApproval?.kind ?? null,
            hasError: status.lastError !== null,
            dependencyUpdate: status.availableUpdate !== null,
          };
        },
      },
    },
  };
}
