import { describe, expect, it } from "vitest";
import { summarize } from "./summarize.js";
import type { TemplateInspection } from "./types.js";

const inspection: TemplateInspection = {
  pin: { url: "git+https://github.com/acme/vibestudio-template-news.git", ref: "refs/tags/v0.1.0", commit: "5555555555eeeeeeeeee5555555555eeeeeeeeee" },
  presentation: { name: "News", description: " Collect feeds and brief the news. " },
  repositories: ["workers/news-agent", "packages/feeds", "panels/news", "packages/reader"],
  dependencies: [{ url: "git+https://github.com/panticonic/vibestudio-base.git" }],
};

describe("summarize", () => {
  it("counts repositories per folder and reads the rest from the inspection", () => {
    expect(summarize(inspection, "catalog")).toEqual({
      name: "News",
      description: "Collect feeds and brief the news.",
      role: "catalog",
      commit: "5555555555ee",
      dependsOn: ["git+https://github.com/panticonic/vibestudio-base.git"],
      parts: { packages: 2, panels: 1, workers: 1 },
    });
  });

  it("falls back to the URL stem when the template names itself nothing", () => {
    const { presentation: _presentation, ...bare } = inspection;
    expect(summarize(bare, "catalog")).toMatchObject({ name: "vibestudio-template-news", description: null });
  });
});
