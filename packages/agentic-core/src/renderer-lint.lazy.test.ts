import { expect, it, vi } from "vitest";
import { DEFAULT_HOST_MODULES, lintRendererSource } from "./renderer-lint.js";

const analyzer = vi.hoisted(() => ({
  loaded: 0,
  failure: new Error("renderer import analysis unavailable"),
}));
vi.mock("@vibestudio/module-imports", () => {
  analyzer.loaded += 1;
  return {
    analyzeModuleImports: () => {
      throw analyzer.failure;
    },
  };
});

it("exposes host modules without loading the parser and propagates analysis failure", async () => {
  expect(DEFAULT_HOST_MODULES).toContain("react");
  expect(analyzer.loaded).toBe(0);
  await expect(lintRendererSource("export default {};")).rejects.toBe(analyzer.failure);
  expect(analyzer.loaded).toBe(1);
});
