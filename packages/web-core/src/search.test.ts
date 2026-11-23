import { beforeEach, expect, it, vi } from "vitest";
import { searchStandard } from "./search.js";
import { searchDuckDuckGo } from "./duckduckgo.js";
import { searchTavily } from "./tavily.js";
import { searchBrave } from "./brave.js";
import { searchExa } from "./exa.js";
vi.mock("./duckduckgo.js", () => ({ searchDuckDuckGo: vi.fn() }));
vi.mock("./tavily.js", () => ({ searchTavily: vi.fn() }));
vi.mock("./brave.js", () => ({ searchBrave: vi.fn() }));
vi.mock("./exa.js", () => ({ searchExa: vi.fn() }));
const sources = [{ title: "Original record", url: "https://authority.example/record", snippet: "Read the source" }];
beforeEach(() => vi.resetAllMocks());

it("preserves successful queries when another query fails", async () => {
  vi.mocked(searchDuckDuckGo).mockImplementation(async query => {
    if (query === "failed") throw new Error("provider unavailable");
    return sources;
  });
  const result = await searchStandard({ now: () => 1 }, ["failed", "working"], fetch, undefined);
  expect(result.results[0]).toMatchObject({ query: "failed", sources: [], error: expect.stringContaining("provider unavailable") });
  expect(result.results[1]).toMatchObject({ query: "working", sources });
});

it("tries another authorized provider when the whole primary batch fails", async () => {
  vi.mocked(searchTavily).mockRejectedValue(new Error("HTTP 429"));
  vi.mocked(searchBrave).mockResolvedValue(sources);
  const result = await searchStandard({ now: () => 1, hasCredentialForOrigin: async origin => /tavily|brave/.test(origin) }, ["question"], fetch, undefined);
  expect(result.provider).toBe("brave");
  expect(result.results[0]?.sources).toEqual(sources);
  expect(searchExa).not.toHaveBeenCalled();
  expect(searchDuckDuckGo).not.toHaveBeenCalled();
});

it("does not send requests to providers without credentials and retains failure details", async () => {
  vi.mocked(searchDuckDuckGo).mockRejectedValue(new Error("automated requests blocked"));
  const result = await searchStandard({ now: () => 1, hasCredentialForOrigin: async () => false }, ["question"], fetch, undefined);
  expect(result.results[0]?.error).toContain("automated requests blocked");
  expect(searchTavily).not.toHaveBeenCalled();
  expect(searchBrave).not.toHaveBeenCalled();
  expect(searchExa).not.toHaveBeenCalled();
});

it("allows the caller to require the selected provider", async () => {
  vi.mocked(searchTavily).mockRejectedValue(new Error("HTTP 503"));
  const result = await searchStandard({ now: () => 1, fallbackProviders: false, hasCredentialForOrigin: async () => true }, ["question"], fetch, undefined);
  expect(result.provider).toBe("tavily");
  expect(result.results[0]?.error).toContain("HTTP 503");
  expect(searchBrave).not.toHaveBeenCalled();
});

it("preserves cancellation rather than retrying it as a provider failure", async () => {
  const controller = new AbortController();
  const reason = new Error("owner cancelled");
  vi.mocked(searchTavily).mockImplementation(async () => { controller.abort(reason); throw reason; });
  await expect(searchStandard({ now: () => 1, hasCredentialForOrigin: async () => true }, ["question"], fetch, controller.signal)).rejects.toBe(reason);
  expect(searchBrave).not.toHaveBeenCalled();
});
