import { web } from "@workspace/runtime";
import { WEB_READ_DEFAULT_LIMIT, WEB_READ_MAX_LIMIT } from "@workspace/web-core/contract";

type AssignedResearchRequest = {
  goal: string;
  sources: string[];
  retrievedAt: number;
};

type FetchInput = Parameters<typeof web.fetch>[0];
type FetchResult = Awaited<ReturnType<typeof web.fetch>>;
type ReadInput = Parameters<typeof web.read>[0];

/** Bind a public research assignment without giving it search or browser-session authority. */
export function bindAssignedResearch(
  input: AssignedResearchRequest,
  transport: Pick<typeof web, "fetch" | "read"> = web,
) {
  const request = structuredClone(input);
  const assigned = new Set(request.sources);
  if (!assigned.size) throw new Error("Assign at least one public URL");
  for (const url of assigned) {
    const parsed = new URL(url);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new Error("Use public HTTP URLs without embedded credentials");
  }

  const fetched = new Map<string, FetchResult>();
  return {
    request,
    services: {
      web: {
        async search(): ReturnType<typeof web.search> {
          throw new Error("Search is outside this assigned source list");
        },
        async fetch(options: FetchInput): Promise<FetchResult> {
          if (!assigned.has(options.url) || (options.session ?? "public") !== "public")
            throw new Error("Read only assigned public URLs with the public session");
          const receipt = await transport.fetch({ ...options, session: "public" });
          if (receipt.session !== "public") throw new Error("Assigned source retrieval left the public session");
          fetched.set(receipt.digest, receipt);
          return receipt;
        },
        async read(options: ReadInput): ReturnType<typeof web.read> {
          const receipt = fetched.get(options.digest);
          const offset = options.offset ?? 0;
          const limit = options.limit ?? WEB_READ_DEFAULT_LIMIT;
          if (!receipt || !Number.isSafeInteger(offset) || offset < 0 || offset > receipt.size ||
              !Number.isSafeInteger(limit) || limit < 1 || limit > WEB_READ_MAX_LIMIT)
            throw new Error("Read a bounded byte range of an assigned page fetched in this invocation");
          return await transport.read({ ...options, offset, limit });
        },
      },
    },
  };
}
