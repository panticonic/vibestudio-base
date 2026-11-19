import { web } from "@workspace/runtime";

type AssignedResearchRequest = {
  goal: string;
  sources: string[];
  retrievedAt: number;
};

type FetchInput = Parameters<typeof web.fetch>[0];
type FetchResult = Awaited<ReturnType<typeof web.fetch>>;
type ReadInput = Parameters<typeof web.read>[0];

/** Bind a public research assignment without giving it search or browser-session authority. */
export function bindAssignedResearch(input: AssignedResearchRequest) {
  const request = structuredClone(input);
  const assigned = [...request.sources];
  if (
    !assigned.length ||
    assigned.length > 3 ||
    new Set(assigned).size !== assigned.length
  )
    throw new Error("Assign one to three distinct public URLs");
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
  let next = 0;
  let pending = false;
  return {
    request,
    services: {
      web: {
        async search(): ReturnType<typeof web.search> {
          throw new Error("Search is outside this assigned source list");
        },
        async fetch(options: FetchInput): Promise<FetchResult> {
          if (
            pending ||
            assigned[next] !== options.url ||
            options.session !== "public"
          )
            throw new Error("Read only the next assigned public URL");
          pending = true;
          next++;
          try {
            const receipt = await web.fetch(options);
            fetched.set(receipt.digest, receipt);
            return receipt;
          } finally {
            pending = false;
          }
        },
        async read(options: ReadInput): ReturnType<typeof web.read> {
          const receipt = fetched.get(options.digest);
          if (
            !receipt ||
            !receipt.truncated ||
            options.offset !== receipt.headBytes ||
            !options.limit ||
            options.limit > 9000
          )
            throw new Error(
              "Continue only the assigned public page at its returned offset",
            );
          return await web.read(options);
        },
      },
    },
  };
}
