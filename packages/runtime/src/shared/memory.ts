/**
 * Workspace memory recall: the one implementation behind the agent
 * `memory_recall` tool and the eval `memory` binding. It searches completed
 * trajectory messages, text files at committed workspace events, and commit
 * summaries through the workspace GAD store, under the caller's own authority
 * (`workspace.graph.read`).
 */
import { z } from "zod";
import type { RpcCaller } from "@vibestudio/rpc";
import type { gadRpcMethods } from "@vibestudio/service-schemas/clients/gadServiceClient";
import type { DurableObjectServiceClient } from "@vibestudio/shared/workspaceServiceRpc";

export const MEMORY_RECALL_MAX_LIMIT = 50;

const memoryKindSchema = z.enum(["message", "file", "commit"]);

const memoryRecallInputSchema = z.object({
  query: z.string().min(1).describe("Search terms."),
  kinds: z
    .array(memoryKindSchema)
    .optional()
    .describe(
      "Only these kinds. Commit summaries retain decisions whose text has left current files."
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MEMORY_RECALL_MAX_LIMIT)
    .optional()
    .describe(`Maximum results (default 10, at most ${MEMORY_RECALL_MAX_LIMIT}).`),
});
export type MemoryRecallInput = z.infer<typeof memoryRecallInputSchema>;

const memoryRecallResultSchema = z.object({
  kind: z.string().describe("message, file, or commit."),
  snippet: z.string().describe("The matching text."),
  where: z
    .string()
    .describe("Where it came from: the file path, the authoring participant, or the event id."),
  appendedAt: z.string().nullable().describe("When it was recorded (ISO time)."),
  path: z.string().nullable().describe("Workspace path for file results."),
  eventId: z.string().nullable().describe("The event the text was found at."),
  logId: z.string().nullable(),
  head: z.string().nullable(),
  contentHash: z.string().nullable(),
  score: z.number().nullable().describe("Relevance score; higher is better."),
});
export type MemoryRecallResultRow = z.infer<typeof memoryRecallResultSchema>;

const memoryRecallOutputSchema = z.object({
  results: z.array(memoryRecallResultSchema),
});
export type MemoryRecallResult = z.infer<typeof memoryRecallOutputSchema>;

/** Method contracts in the shape the declaration generator and runtime catalog read. */
export const memoryMethods = {
  recall: {
    description:
      "Search workspace memory: past conversation messages, committed file content, and commit summaries. Returns snippets with provenance (who, when, where). Recall helps find things; it does not prove them. Verify against the source records the provenance points to. Uncommitted working changes are not searched.",
    args: z.tuple([memoryRecallInputSchema]),
    returns: memoryRecallOutputSchema,
  },
} as const;

export const MEMORY_METHOD_NAMES = ["recall"] as const;

export interface MemoryClient {
  recall(input: MemoryRecallInput): Promise<MemoryRecallResult>;
}

export function createMemoryClient(rpc: RpcCaller): MemoryClient {
  let servicePromise: Promise<DurableObjectServiceClient<typeof gadRpcMethods>> | undefined;
  const service = () =>
    (servicePromise ??= import("@vibestudio/service-schemas/clients/gadServiceClient").then(
      ({ createGadServiceClient }) => createGadServiceClient(rpc)
    ));
  return {
    async recall(input) {
      const query = typeof input?.query === "string" ? input.query.trim() : "";
      if (!query) throw new Error("memory.recall requires a non-empty query");
      const recalled = await (
        await service()
      ).call("recallMemory", {
        query,
        kinds: input.kinds ?? null,
        limit: input.limit ?? null,
      });
      return {
        results: recalled.results.map((row) => ({
          kind: row.kind,
          snippet: row.snippet,
          where: recallOrigin(row),
          appendedAt: row.appendedAt,
          path: row.path,
          eventId: row.eventId,
          logId: row.logId,
          head: row.head,
          contentHash: row.contentHash,
          score: row.score,
        })),
      };
    },
  };
}

function recallOrigin(row: {
  path: string | null;
  eventId: string | null;
  actor: unknown;
}): string {
  if (row.path) return row.path;
  const actor = row.actor;
  if (actor && typeof actor === "object" && "id" in actor) return String((actor as { id: unknown }).id);
  return row.eventId ?? "unknown";
}

/** The text an agent reads for a recall: one `[kind] where @ time` block per result. */
export function formatMemoryRecall(results: readonly MemoryRecallResultRow[]): string {
  if (results.length === 0) return "No memory matched the query.";
  return results
    .map((result) => {
      const when = result.appendedAt ? ` @ ${result.appendedAt}` : "";
      return `[${result.kind}] ${result.where}${when}\n${result.snippet}`;
    })
    .join("\n\n");
}
