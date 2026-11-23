/** Read explicit public source candidates chosen by the semantic research hierarchy. Exact I/O only. */
import { web } from "natlang:services";

/** A fetched page, as many characters of it as the passages will use. */
export type FetchedPage = { url: string; title: string; text: string };

/** Pages read at most, and characters kept of each: the passages are short enough for a small model's context. */
const PAGES = 3;
const CHARACTERS = 9000;

const isWebUrl = (url: string) => /^https?:\/\//i.test(url);

export default async function gather(
  sources: readonly string[],
): Promise<{
  pages: FetchedPage[];
  notRead: { url: string; reason: string }[];
}> {
  const urls = [...new Set(sources.filter(isWebUrl))];
  const notRead = sources.filter(url => !isWebUrl(url)).map(url => ({ url, reason: "not an http(s) URL" }));
  const pages: FetchedPage[] = [];
  for (const url of urls) {
    if (pages.length >= PAGES) {
      notRead.push({ url, reason: "Not read in this bounded page batch" });
      continue;
    }
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
