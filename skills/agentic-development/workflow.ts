import { vcs } from "@workspace/runtime";
import type {
  AgenticChangeRequest,
  AgenticSourceObservation,
  AgenticUnit,
} from "./natlang/types.js";

const sources = {
  "panels/chat": "SKILL.md",
  "packages/agentic-chat": "SKILL.md",
  "workers/agent-worker": "SKILL.md",
  "packages/agentic-do": "SKILL.md",
  "packages/agentic-protocol": "SKILL.md",
  "workers/pubsub-channel": "SKILL.md",
  "packages/agentic-core": "package.json",
  "packages/pubsub": "package.json",
} satisfies Record<AgenticUnit, "SKILL.md" | "package.json">;

export function bindAgenticChangePlan(assignment: AgenticChangeRequest) {
  const request = { ...assignment };
  const assignedContext = request.contextId;
  return {
    request,
    services: {
      agenticChangeSource: {
        async read(contextId: string): Promise<AgenticSourceObservation> {
          if (contextId !== assignedContext)
            throw new Error(
              "Read only the assigned agentic development context",
            );
          const { workingHead } = await vcs.status({ contextId });
          const units = Object.keys(sources) as AgenticUnit[];
          const repos = await Promise.all(
            units.map((repoPath) =>
              vcs.resolveRepository({ state: workingHead, repoPath }),
            ),
          );
          const files = await vcs.readFiles({
            state: workingHead,
            files: repos.flatMap((repo, index) =>
              repo
                ? [
                    {
                      repositoryId: repo.repositoryId,
                      file: {
                        kind: "path" as const,
                        path: sources[units[index]!],
                      },
                    },
                  ]
                : [],
            ),
          });
          const text = new Map(
            files.flatMap((file) =>
              file?.content.kind === "text"
                ? [[file.repoPath, file.content.text] as const]
                : [],
            ),
          );
          return {
            contextId,
            revision:
              workingHead.kind === "event"
                ? workingHead.eventId
                : workingHead.applicationId,
            guides: units.map((unit) => ({
              unit,
              excerpt: text.get(unit)?.slice(0, 1600) ?? null,
            })),
          };
        },
      },
    },
  };
}
