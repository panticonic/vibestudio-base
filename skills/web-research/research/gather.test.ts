import { beforeEach, expect, it, vi } from "vitest";
const web = vi.hoisted(() => ({ search: vi.fn(), fetch: vi.fn(), read: vi.fn() }));
vi.mock("natlang:services", () => ({ web }));
import gather from "./researchBrief/gather.js";
beforeEach(() => vi.resetAllMocks());
it("reads direct source candidates without requiring a search result", async () => {
  web.fetch.mockResolvedValue({ url: "https://authority.example/record", title: "Original record", head: "Original evidence", truncated: false });
  const result = await gather(["https://authority.example/record"]);
  expect(result.pages[0]?.text).toBe("Original evidence");
  expect(web.search).not.toHaveBeenCalled();
  expect(web.fetch).toHaveBeenCalledWith({ url: "https://authority.example/record", session: "public" });
});
it("keeps trying supplied candidates after failures and exposes unprocessed sources", async () => {
  web.fetch.mockImplementation(async ({ url }: { url: string }) => {
    if (url.endsWith("missing")) throw new Error("Source unavailable");
    return { url, title: url, head: "Checked page", truncated: false };
  });
  const urls = ["missing", "one", "two", "three", "four"].map(path => `https://authority.example/${path}`);
  const result = await gather(urls);
  expect(result.pages.map(page => page.url)).toEqual(urls.slice(1, 4));
  expect(result.notRead).toEqual([
    { url: urls[0], reason: "Source unavailable" },
    { url: urls[4], reason: "Not read in this bounded page batch" },
  ]);
});
it("does not hide a discovery policy inside the I/O helper", async () => {
  expect(await gather([])).toEqual({ pages: [], notRead: [] });
  expect(web.search).not.toHaveBeenCalled();
});
