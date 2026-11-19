import type {
  WebFetchResult,
  WebReadResult,
  WebSearchQueryResult,
} from "@workspace/web-core";
import type { SearchReceipt, SourceReceipt } from "../research-intake/types.js";

export function projectSearchReadback(
  id: string,
  row: WebSearchQueryResult,
): SearchReceipt {
  return {
    id,
    query: row.query,
    urls: row.sources.map(({ url }) => url),
    outcome: row.error
      ? "failed"
      : row.sources.length > 0
        ? "results"
        : "empty",
  };
}

type SourceAssignment = Pick<
  SourceReceipt,
  | "id"
  | "requestedUrl"
  | "authority"
  | "browserApproved"
  | "publicationDate"
  | "eventDate"
>;

export function projectPageReadback(
  assignment: SourceAssignment,
  fetch: WebFetchResult,
  reads: readonly WebReadResult[],
): SourceReceipt {
  return {
    ...assignment,
    finalUrl: fetch.url,
    title: fetch.title,
    outcome: fetch.size === 0 ? "empty" : "fetched",
    session: fetch.session,
    digest: fetch.digest,
    size: fetch.size,
    head: fetch.head,
    headBytes: fetch.headBytes,
    truncated: fetch.truncated,
    reads: reads.map(({ digest, offset, limit, bytes, nextOffset, text }) => ({
      digest,
      offset,
      limit,
      bytes,
      nextOffset,
      text,
    })),
  };
}
