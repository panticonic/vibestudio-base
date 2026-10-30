import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseLiteResults,
  searchDuckDuckGo,
  DuckDuckGoBlockedError,
  selectSearchProvider,
} from "./index.js";
import { extractPage, htmlToReadableMarkdown } from "./extract.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
function fixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

describe("parseLiteResults", () => {
  it("parses DuckDuckGo lite (table) result pages", () => {
    const results = parseLiteResults(fixture("ddg-lite-sample.html"), 10);
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results[0]).toMatchObject({
      title: "Example Domain",
      url: "https://example.com/",
    });
    expect(results[0]!.snippet).toContain("illustrative");
    expect(results[1]!.url).toBe("https://nodejs.org/");
    expect(results[2]!.url).toBe("https://tc39.es/proposals/");
  });

  it("parses DuckDuckGo html (div) result pages", () => {
    const results = parseLiteResults(fixture("ddg-html-sample.html"), 10);
    expect(results.length).toBe(2);
    expect(results[0]!.url).toBe("https://example.com/");
    expect(results[1]!.url).toBe("https://deno.land/");
    expect(results[1]!.snippet).toContain("Deno");
  });

  it("respects the limit", () => {
    const results = parseLiteResults(fixture("ddg-lite-sample.html"), 1);
    expect(results.length).toBe(1);
  });

  it("returns empty on an anomaly page", () => {
    const results = parseLiteResults(fixture("ddg-anomaly.html"), 10);
    expect(results).toEqual([]);
  });
});

describe("searchDuckDuckGo", () => {
  it("throws DuckDuckGoBlockedError on a 429 response", async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => "",
    }));
    await expect(
      searchDuckDuckGo("anything", 5, fetcher as never),
    ).rejects.toBeInstanceOf(DuckDuckGoBlockedError);
  });

  it("throws DuckDuckGoBlockedError on an anomaly page", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => fixture("ddg-anomaly.html"),
    }));
    await expect(
      searchDuckDuckGo("anything", 5, fetcher as never),
    ).rejects.toBeInstanceOf(DuckDuckGoBlockedError);
  });

  it("falls back to the html endpoint when lite returns empty", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("lite.duckduckgo.com")) {
        return {
          ok: true,
          status: 200,
          text: async () => "<html><body>no hits</body></html>",
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => fixture("ddg-html-sample.html"),
      };
    });
    const results = await searchDuckDuckGo("deno", 5, fetcher as never);
    expect(results.length).toBe(2);
    expect(calls.length).toBe(2);
    expect(calls[0]).toContain("lite.duckduckgo.com");
    expect(calls[1]).toContain("html.duckduckgo.com");
  });
});

describe("htmlToReadableMarkdown", () => {
  it("extracts readable content as markdown", () => {
    const out = htmlToReadableMarkdown(
      SAMPLE_PAGE_HTML,
      "https://example.com/spec",
    );
    expect(out.title).toBeTruthy();
    expect(out.markdown).toContain("Section 7");
    expect(out.markdown).toContain("This is a paragraph");
  });

  it("extractPage rejects streamed HTML beyond the configured byte limit", async () => {
    const canceled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("<html>"));
        controller.enqueue(
          new TextEncoder().encode("<body>oversized</body></html>"),
        );
      },
      cancel: canceled,
    });
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      url: "https://example.com/stream",
      headers: {
        get(name: string) {
          if (name.toLowerCase() === "content-type") return "text/html";
          return null;
        },
      },
      body,
      text: async () => "",
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    await expect(
      extractPage("https://example.com/stream", fetcher, undefined, {
        maxHtmlBytes: 8,
      }),
    ).rejects.toThrow(/HTML response body exceeds 8 byte limit/);
    expect(canceled).toHaveBeenCalled();
  });
});

describe("selectSearchProvider", () => {
  it("defaults to duckduckgo when no probe is provided", async () => {
    await expect(selectSearchProvider(undefined)).resolves.toBe("duckduckgo");
  });
  it("returns tavily when the probe reports a Tavily credential", async () => {
    await expect(
      selectSearchProvider(async (origin) => origin.includes("tavily.com")),
    ).resolves.toBe("tavily");
  });
  it("prefers tavily over brave when both credentials exist", async () => {
    await expect(selectSearchProvider(async () => true)).resolves.toBe(
      "tavily",
    );
  });
  it("falls back to brave then exa when tavily is absent", async () => {
    await expect(
      selectSearchProvider(
        async (origin) =>
          origin.includes("brave.com") || origin.includes("exa.ai"),
      ),
    ).resolves.toBe("brave");
    await expect(
      selectSearchProvider(async (origin) => origin.includes("exa.ai")),
    ).resolves.toBe("exa");
  });
  it("returns duckduckgo when no provider credential is present", async () => {
    await expect(selectSearchProvider(async () => false)).resolves.toBe(
      "duckduckgo",
    );
  });
});

const SAMPLE_PAGE_HTML = `
<!doctype html>
<html>
<head><title>Sample Spec</title></head>
<body>
  <nav>Site navigation, ignore me</nav>
  <article>
    <h1>Sample Spec</h1>
    <p>This is a paragraph of <strong>important</strong> content that Readability should preserve.</p>
    <h2>Section 7</h2>
    <p>Some more detail about <a href="https://example.com/details">the topic</a>.</p>
    <ul>
      <li>First bullet</li>
      <li>Second bullet</li>
    </ul>
    <p>And a closing line, this is a paragraph of regular text to give Readability enough to chew on so it does not bail out due to the charThreshold.</p>
    <p>Adding another paragraph here so the total text length is comfortably above the threshold and Readability is happy to extract the main content. The more text, the better the heuristics work.</p>
  </article>
  <footer>Site footer, ignore</footer>
</body>
</html>
`;
