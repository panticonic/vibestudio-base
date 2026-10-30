/** Read the pages that may answer the question: the user's own sources, or the first search results. Exact I/O only. */
import { web } from "natlang:services";

/** A fetched page, as many characters of it as the passages will use. */
export type FetchedPage = { url: string; title: string; text: string };

/** Pages read at most, and characters kept of each: the passages are short enough for a small model's context. */
const PAGES = 3;
const CHARACTERS = 9000;

const isWebUrl = (url: string) => /^https?:\/\//i.test(url);

/** The URLs to read: the sources given, otherwise the first distinct results of searching the question. */
async function candidates(
  question: string,
  sources: readonly string[],
): Promise<{ urls: string[]; notRead: { url: string; reason: string }[] }> {
  if (sources.length > 0)
    return {
      urls: sources.filter(isWebUrl).slice(0, PAGES),
      notRead: sources
        .filter((url) => !isWebUrl(url))
        .map((url) => ({ url, reason: "not an http(s) URL" })),
    };
  const found = await web.search({ queries: [question.slice(0, 200)] });
  const answer = found.results[0];
  if (!answer || answer.error)
    return {
      urls: [],
      notRead: [
        {
          url: "search",
          reason: answer?.error ?? "the search returned no result",
        },
      ],
    };
  return {
    urls: [
      ...new Set(answer.sources.map((source) => source.url).filter(isWebUrl)),
    ].slice(0, PAGES),
    notRead: [],
  };
}

export default async function gather(
  question: string,
  sources: readonly string[],
): Promise<{
  pages: FetchedPage[];
  notRead: { url: string; reason: string }[];
}> {
  const { urls, notRead } = await candidates(question, sources);
  const pages: FetchedPage[] = [];
  for (const url of urls) {
    try {
      const page = await web.fetch({ url, session: "public" });
      let text = page.head;
      if (page.truncated && text.length < CHARACTERS) {
        const more = await web.read({
          digest: page.digest,
          offset: page.headBytes,
          limit: CHARACTERS - text.length,
        });
        text += more.text;
      }
      pages.push({
        url: page.url,
        title: page.title,
        text: text.slice(0, CHARACTERS),
      });
    } catch (error) {
      notRead.push({
        url,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { pages, notRead };
}
