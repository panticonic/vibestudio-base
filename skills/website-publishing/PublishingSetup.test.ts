import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lintRendererSource } from "@workspace/agentic-core/renderer-lint";

describe("PublishingSetup", () => {
  it("uses only renderer-safe imports", async () => {
    const source = readFileSync(resolve(__dirname, "PublishingSetup.tsx"), "utf8");

    expect(await lintRendererSource(source)).toEqual([]);
  });
});
