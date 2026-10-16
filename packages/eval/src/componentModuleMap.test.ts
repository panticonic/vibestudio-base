import { describe, expect, it } from "vitest";
import { compileComponent } from "./index";

describe("compileComponent with a host module map", () => {
  it("resolves imports from the map it is given, not the realm's global map", async () => {
    const kit = { label: (name: string) => `Hello, ${name}` };
    const result = await compileComponent<(props: { name: string }) => string>(
      `import { label } from "@host/kit"; export default function Card({ name }) { return label(name); }`,
      { moduleMap: { "@host/kit": kit } }
    );
    expect(result.success).toBe(true);
    expect(result.Component!({ name: "terminal" })).toBe("Hello, terminal");
  });

  it("fails the compile for a module the host does not provide", async () => {
    const result = await compileComponent(
      `import { Chart } from "@host/missing"; export default function Card() { return Chart; }`,
      { moduleMap: {} }
    );
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("@host/missing");
  });
});
