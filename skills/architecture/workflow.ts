import { WorkspaceServiceExportSchema } from "@vibestudio/workspace-contracts/workspaceConfigSchema";
import { vcs, workers } from "@workspace/runtime";
import type {
  ArchitectureDeclaration,
  ArchitectureRequest,
  ArchitectureRoute,
} from "./natlang/types.js";

type State = Awaited<ReturnType<typeof vcs.status>>["workingHead"];

export function bindArchitectureReview(input: {
  contextId: string;
  protocol: string;
  objectKey?: string;
  goal: string;
  concern: ArchitectureRequest["concern"];
  proposedOwner: ArchitectureRequest["proposedOwner"];
}) {
  const { contextId, protocol, objectKey, goal, concern, proposedOwner } =
    input;
  const operationId = crypto.randomUUID();
  const request: ArchitectureRequest = {
    goal,
    operationId,
    concern,
    proposedOwner,
  };
  let snapshot: { state: State; route: ArchitectureRoute } | undefined;
  let pending = false;
  return {
    request,
    services: {
      architectureProviderRead: {
        async resolve(id: string): Promise<ArchitectureRoute> {
          if (id !== operationId || pending || snapshot)
            throw new Error("Resolve only the assigned workspace service");
          pending = true;
          try {
            const { workingHead } = await vcs.status({ contextId });
            const resolved = await workers.resolveService(
              protocol,
              objectKey ?? null,
            );
            const after = await vcs.status({ contextId });
            if (
              JSON.stringify(workingHead) !== JSON.stringify(after.workingHead)
            )
              throw new Error(
                "The workspace revision changed during service resolution",
              );
            if (!resolved.protocols.includes(protocol))
              throw new Error(
                "The returned receiver did not expose the assigned protocol",
              );
            const route: ArchitectureRoute = {
              receipt: operationId + ":provider",
              contextId,
              protocol,
              revision:
                workingHead.kind === "event"
                  ? workingHead.eventId
                  : workingHead.applicationId,
              name: resolved.name,
              source: resolved.source,
              receiver:
                resolved.kind === "durable-object"
                  ? {
                      kind: "durable-object",
                      className: resolved.className,
                      address: resolved.targetId,
                      creatorScoped: resolved.context === "creator",
                    }
                  : {
                      kind: "worker",
                      className: null,
                      address: resolved.routePath,
                      creatorScoped: false,
                    },
            };
            snapshot = { state: workingHead, route };
            return route;
          } finally {
            pending = false;
          }
        },
        async declaration(
          receipt: string,
        ): Promise<ArchitectureDeclaration | null> {
          if (!snapshot || receipt !== snapshot.route.receipt)
            throw new Error("Read only the observed provider declaration");
          const { state, route } = snapshot;
          const repository = await vcs.resolveRepository({
            state,
            repoPath: route.source,
          });
          if (!repository) return null;
          const file = await vcs.readFile({
            state,
            repositoryId: repository.repositoryId,
            file: { kind: "path", path: "package.json" },
          });
          if (file?.content.kind !== "text") return null;
          const services: unknown = JSON.parse(file.content.text).vibestudio
            ?.services;
          if (!Array.isArray(services)) return null;
          const matches = services.filter(
            (entry) => entry?.name === route.name,
          );
          if (matches.length !== 1) return null;
          const parsed = WorkspaceServiceExportSchema.safeParse(matches[0]);
          if (!parsed.success) return null;
          const value = parsed.data;
          return {
            routeReceipt: receipt,
            source: route.source,
            revision: route.revision,
            hash: file.contentHash,
            name: value.name,
            protocols: value.protocols ?? [],
            className:
              "durableObject" in value ? value.durableObject.className : null,
            creatorScoped:
              "durableObject" in value &&
              value.durableObject.context === "creator",
          };
        },
      },
    },
  };
}
