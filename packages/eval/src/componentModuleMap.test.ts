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

  it("serves a file source's local modules from the same map", async () => {
    const files: Record<string, string> = {
      "ui/card.tsx": `import { label } from "@host/kit"; import { name } from "./name"; export default function Card() { return label(name); }`,
      "ui/name.ts": `export const name = "local";`,
    };
    const moduleMap: Record<string, unknown> = {
      "@host/kit": { label: (name: string) => `Hello, ${name}` },
    };
    const result = await compileComponent<() => string>(files["ui/card.tsx"]!, {
      moduleMap,
      sourcePath: "ui/card.tsx",
      loadSourceFile: async (path) => {
        const file = files[path];
        if (file === undefined) throw Object.assign(new Error(path), { code: "ENOENT" });
        return file;
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.Component!()).toBe("Hello, local");
    expect((globalThis as Record<string, unknown>)["__vibestudioModuleMap__"]).toBeUndefined();
  });
});
