import { describe, it, expect } from "vitest";
import { transformCode } from "./transform";

describe("transformCode", () => {
  describe("syntax detection", () => {
    it("transforms TypeScript to CommonJS", async () => {
      const result = await transformCode(
        `const x: number = 42; export default x;`,
        { syntax: "typescript" }
      );

      // Sucrase outputs "exports. default = x" (with space after dot for default)
      expect(result.code).toContain("exports.");
      expect(result.code).toContain("default");
      expect(result.code).not.toContain(": number");
    });

    it("transforms TSX to CommonJS with JSX runtime", async () => {
      const result = await transformCode(
        `export default function App() { return <div>Hello</div>; }`,
        { syntax: "tsx" }
      );

      expect(result.code).toContain("exports.default");
      expect(result.code).toContain("jsx");
      expect(result.code).not.toContain("<div>");
    });

    it("keeps `await using` declarations for the runtime's native disposal", async () => {
      const result = await transformCode(
        `import { openPanel } from "@workspace/runtime";
await using owned = await openPanel("about/new", { parentId: null });
return owned.id;`,
        { syntax: "typescript" }
      );

      expect(result.code).toContain("await using owned =");
      expect(result.requires).toContain("@workspace/runtime");
    });

    it("transforms JSX to CommonJS", async () => {
      const result = await transformCode(
        `export default function App() { return <span>Hi</span>; }`,
        { syntax: "jsx" }
      );

      expect(result.code).toContain("exports.default");
      expect(result.code).toContain("jsx");
    });
  });

  describe("require extraction", () => {
    it("extracts single require", async () => {
      const result = await transformCode(
        `import React from "react"; export default React;`,
        { syntax: "typescript" }
      );

      expect(result.requires).toContain("react");
    });

    it("extracts multiple requires", async () => {
      const result = await transformCode(
        `import React from "react";
         import { Button } from "@radix-ui/themes";
         export default function() { return <Button />; }`,
        { syntax: "tsx" }
      );

      expect(result.requires).toContain("react");
      expect(result.requires).toContain("@radix-ui/themes");
    });

    it("extracts jsx-runtime require from TSX", async () => {
      const result = await transformCode(
        `export default function() { return <div />; }`,
        { syntax: "tsx" }
      );

      expect(result.requires).toContain("react/jsx-runtime");
      expect(result.requires).not.toContain("react/jsx-dev-runtime");
    });

    it("deduplicates requires", async () => {
      const result = await transformCode(
        `import { useState, useEffect } from "react";
         import { useCallback } from "react";
         console.log(useState, useEffect, useCallback);`,
        { syntax: "typescript" } // Use typescript to avoid jsx-runtime
      );

      const reactCount = result.requires.filter((r) => r === "react").length;
      expect(reactCount).toBe(1);
    });

    it("discovers literal calls with JavaScript grammar instead of import-looking text", async () => {
      const result = await transformCode(`
        // require("comment-only")
        const description = 'require("string-only")';
        const peer = require /* host peer */ ("re\\u0061ct");
        return peer;
      `, { syntax: "typescript" });
      expect(result.requires).toEqual(["react"]);
    });

    it("returns empty array when no imports", async () => {
      const result = await transformCode(
        `const x = 42; export default x;`,
        { syntax: "typescript" }
      );

      expect(result.requires).toEqual([]);
    });
  });

  describe("ESM to CJS conversion", () => {
    it("converts named exports", async () => {
      const result = await transformCode(
        `export const foo = 1; export const bar = 2;`,
        { syntax: "typescript" }
      );

      expect(result.code).toContain("exports.foo");
      expect(result.code).toContain("exports.bar");
    });

    it("converts default exports", async () => {
      const result = await transformCode(
        `export default 42;`,
        { syntax: "typescript" }
      );

      // Sucrase outputs "exports. default = 42" (space after dot)
      expect(result.code).toContain("exports.");
      expect(result.code).toContain("default");
      expect(result.code).toContain("42");
    });

    it("converts named imports to require", async () => {
      const result = await transformCode(
        `import { useState } from "react"; console.log(useState);`,
        { syntax: "typescript" }
      );

      // Sucrase uses single quotes
      expect(result.code).toContain("require('react')");
    });
  });

  describe("error handling", () => {
    it("throws on syntax errors", async () => {
      await expect(
        transformCode(`const x = {`, { syntax: "typescript" })
      ).rejects.toThrow();
    });

    it("throws on invalid JSX", async () => {
      await expect(
        transformCode(`const x = <div><span></div>;`, { syntax: "tsx" })
      ).rejects.toThrow();
    });
  });
});
