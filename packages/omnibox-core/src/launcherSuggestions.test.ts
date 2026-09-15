import { describe, expect, it } from "vitest";
import {
  autocompleteForSuggestion,
  buildWebSearchSuggestions,
  isDeprecatedLauncherPrefix,
  rankHistorySuggestions,
  buildIdleLauncherSuggestions,
  buildLauncherSuggestions,
  groupLauncherSuggestions,
  isLikelyAgentPrompt,
  parseLauncherInput,
} from "./launcherSuggestions";

const panels = [
  { path: "panels/chat", title: "Chat" },
  { path: "panels/terminal", title: "Terminal" },
  { path: "about/history", title: "History" },
];
const history = [
  {
    id: 1,
    url: "https://example.com/docs",
    title: "Example Docs",
    visitCount: 12,
    typedCount: 3,
    lastVisit: 100,
    source: "history" as const,
  },
];

describe("launcher suggestions", () => {
  it("completes bare history hosts without adding a protocol or www", () => {
    const suggestion = {
      id: "history:web",
      kind: "history" as const,
      score: 1,
      browser: {
        url: "https://www.example.com/docs",
        source: "history" as const,
      },
    };
    expect(autocompleteForSuggestion("@exa", suggestion)).toEqual({
      value: "@example.com/docs",
      suffix: "mple.com/docs",
    });
    expect(autocompleteForSuggestion("www.exa", suggestion)?.value).toBe(
      "www.example.com/docs",
    );
    expect(
      autocompleteForSuggestion("https://www.exa", suggestion)?.value,
    ).toBe("https://www.example.com/docs");
    expect(autocompleteForSuggestion("docs", suggestion)).toBeNull();
  });

  it("uses modern visit times to break frequency ties", () => {
    const rows = [
      {
        url: "https://example.com/old",
        source: "history" as const,
        lastVisit: 1_700_000_000_000,
      },
      {
        url: "https://example.com/recent",
        source: "history" as const,
        lastVisit: 1_800_000_000_000,
      },
    ];
    expect(rankHistorySuggestions("example", rows)[0]?.browser.url).toBe(
      rows[1]?.url,
    );
  });

  it("offers configured search completions without treating providers as visited pages", () => {
    const rows = [
      {
        url: "https://search.test/?q=%s",
        source: "search-engine" as const,
        engineName: "My Search",
        keyword: "s",
        typedCount: 1,
        searchTemplate: "https://search.test/?q=%s",
      },
      {
        url: "https://search.test/?q=coffee%20beans",
        title: "coffee beans",
        completionQuery: "coffee",
        source: "search-suggestion" as const,
        searchTemplate: "https://search.test/?q=%s",
      },
    ];
    expect(rankHistorySuggestions("", rows)).toEqual([]);
    expect(buildWebSearchSuggestions("tea", rows).map((row) => row.query)).toEqual(["tea"]);
    expect(
      buildWebSearchSuggestions("coffee", rows).map((row) => [
        row.query,
        row.provider,
      ]),
    ).toEqual([
      ["coffee", "My Search"],
      ["coffee beans", "My Search"],
    ]);
    expect(buildWebSearchSuggestions("s cats & dogs", rows)[0]?.url).toBe(
      "https://search.test/?q=cats%20%26%20dogs",
    );
  });
  it("parses the unified go-to and chat scopes", () => {
    expect(parseLauncherInput("@ term")).toEqual({
      mode: "goto",
      prefix: "@",
      query: "term",
    });
    expect(parseLauncherInput("/ explain this")).toEqual({
      mode: "chat",
      prefix: "/",
      query: "explain this",
    });
    expect(parseLauncherInput("plain")).toEqual({
      mode: "all",
      prefix: "",
      query: "plain",
    });
  });

  it("keeps the retired panels-only prefix working as an alias of go-to", () => {
    const parsed = parseLauncherInput("> term");
    expect(parsed).toEqual({ mode: "goto", prefix: ">", query: "term" });
    // The prefix survives parsing precisely so the page can say it is retired.
    expect(isDeprecatedLauncherPrefix(parsed)).toBe(true);
    expect(isDeprecatedLauncherPrefix(parseLauncherInput("@term"))).toBe(false);
  });

  it("ranks panel and browser destinations in one usage-weighted list", () => {
    const suggestions = buildLauncherSuggestions({
      value: "",
      panels,
      panelUsage: {
        "panels/terminal": { count: 30, lastUsed: 200 },
        "about/history": { count: 2, lastUsed: 100 },
      },
      browserSuggestions: history,
      browserUrl: null,
    });
    expect(suggestions[0]?.id).toBe("panel:panels/terminal");
    expect(suggestions.some((item) => item.kind === "history")).toBe(true);
  });

  it("shows up to twenty suggestions by default", () => {
    const suggestions = buildLauncherSuggestions({
      value: "",
      panels: Array.from({ length: 25 }, (_, index) => ({
        path: `panels/app-${index}`,
        title: `App ${index}`,
      })),
      panelUsage: {},
      browserSuggestions: [],
      browserUrl: null,
    });

    expect(suggestions).toHaveLength(20);
  });

  it("shows about pages after workspace panels and before browser history", () => {
    const suggestions = buildIdleLauncherSuggestions({
      value: "",
      panels: [
        { path: "panels/chat", title: "Chat" },
        { path: "panels/terminal", title: "Terminal" },
      ],
      aboutPanels: [
        { path: "about/help", title: "Help" },
        { path: "about/history", title: "History" },
        { path: "about/permissions", title: "Permissions" },
      ],
      panelUsage: {
        "panels/chat": { count: 2, lastUsed: 200 },
        "panels/terminal": { count: 20, lastUsed: 100 },
        "about/help": { count: 4, lastUsed: 300 },
        "about/history": { count: 12, lastUsed: 100 },
        "about/permissions": { count: 1, lastUsed: 400 },
      },
      browserSuggestions: history,
      browserUrl: null,
    });

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual([
      "panel:panels/terminal",
      "panel:panels/chat",
      "panel:about/history",
      "panel:about/help",
      "panel:about/permissions",
      "history:https://example.com/docs",
    ]);
  });

  it("keeps about pages visible when the workspace has four panels", () => {
    const suggestions = buildIdleLauncherSuggestions({
      value: "",
      panels: Array.from({ length: 4 }, (_, index) => ({
        path: `panels/app-${index}`,
        title: `App ${index}`,
      })),
      aboutPanels: [{ path: "about/history", title: "History" }],
      panelUsage: { "about/history": { count: 10_000, lastUsed: 999 } },
      browserSuggestions: [],
      browserUrl: null,
    });

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual([
      "panel:panels/app-0",
      "panel:panels/app-1",
      "panel:panels/app-2",
      "panel:panels/app-3",
      "panel:about/history",
    ]);
  });

  it("prefers sentence-like chat unless a destination is an exact or prefix match", () => {
    expect(isLikelyAgentPrompt("Please investigate this issue for me")).toBe(
      true,
    );
    const prompt = buildLauncherSuggestions({
      value: "please investigate this issue",
      panels: [{ path: "panels/investigate", title: "Investigate" }],
      panelUsage: {},
      browserSuggestions: [],
      browserUrl: null,
    });
    expect(prompt[0]?.kind).toBe("chat");

    const weakSubstring = buildLauncherSuggestions({
      value: "please write a report",
      panels: [
        {
          path: "panels/report-tools",
          title: "Tools to please write a report",
        },
      ],
      panelUsage: { "panels/report-tools": { count: 10_000, lastUsed: 999 } },
      browserSuggestions: [],
      browserUrl: null,
    });
    expect(weakSubstring[0]?.kind).toBe("chat");

    const exact = buildLauncherSuggestions({
      value: "terminal",
      panels,
      panelUsage: {},
      browserSuggestions: [],
      browserUrl: null,
    });
    expect(exact[0]?.id).toBe("panel:panels/terminal");
  });

  it("limits explicit modes to their destination type", () => {
    const goTo = buildLauncherSuggestions({
      value: "@",
      panels,
      panelUsage: {},
      browserSuggestions: history,
      browserUrl: "https://typed.example/",
    });
    // Go-to includes new web destinations as well as previously visited ones.
    expect(new Set(goTo.map((item) => item.kind))).toEqual(
      new Set(["panel", "history", "url"]),
    );
    const aliased = buildLauncherSuggestions({
      value: ">",
      panels,
      panelUsage: {},
      browserSuggestions: history,
      browserUrl: null,
    });
    expect(new Set(aliased.map((item) => item.kind))).toEqual(
      new Set(["panel", "history"]),
    );
    const chatOnly = buildLauncherSuggestions({
      value: "/hello there",
      panels,
      panelUsage: {},
      browserSuggestions: history,
      browserUrl: null,
    });
    expect(chatOnly.map((item) => item.kind)).toEqual(["chat"]);
  });

  it("ranks history the same way whether it is reached through the launcher or a palette", () => {
    const throughLauncher = buildLauncherSuggestions({
      value: "@example",
      panels: [],
      panelUsage: {},
      browserSuggestions: history,
      browserUrl: null,
    });
    const throughPalette = rankHistorySuggestions("example", history);
    expect(throughPalette).toEqual(
      throughLauncher.filter((item) => item.kind === "history"),
    );
    expect(rankHistorySuggestions("example", history, 1)).toHaveLength(1);
  });

  it("offers inline completion for a selected prefix destination", () => {
    const suggestion = buildLauncherSuggestions({
      value: "@term",
      panels,
      panelUsage: {},
      browserSuggestions: [],
      browserUrl: null,
    })[0];
    expect(autocompleteForSuggestion("@term", suggestion)).toEqual({
      value: "@Terminal",
      suffix: "inal",
    });
  });

  it("groups by kind in best-rank order and preserves the flattened walk order", () => {
    const ranked = [
      { kind: "url" as const },
      { kind: "panel" as const },
      { kind: "history" as const },
      { kind: "panel" as const },
    ];
    const groups = groupLauncherSuggestions(ranked);
    expect(groups.map((group) => group.kind)).toEqual([
      "url",
      "panel",
      "history",
    ]);
    expect(groups.map((group) => group.label)).toEqual([
      "Web address",
      "Panels",
      "Recent pages",
    ]);
    expect(groups.flatMap((group) => group.items)).toEqual([
      ranked[0],
      ranked[1],
      ranked[3],
      ranked[2],
    ]);
  });

  it("leads with the requested group order when there is no query to rank against", () => {
    const groups = groupLauncherSuggestions(
      [{ kind: "history" as const }, { kind: "panel" as const }],
      ["panel", "history"],
    );
    expect(groups.map((group) => group.kind)).toEqual(["panel", "history"]);
  });
});
