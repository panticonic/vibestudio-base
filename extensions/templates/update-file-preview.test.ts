import { describe, expect, it } from "vitest";
import {
  binaryTemplateUpdatePreview,
  previewTemplateUpdateContent,
} from "./update-file-preview.js";

describe("template update file previews", () => {
  it("uses the byte limit identically for immutable blobs and working text", () => {
    const exactLimit = "é".repeat(64 * 1024);
    const overLimit = exactLimit + "p";
    expect(previewTemplateUpdateContent(exactLimit)).toBe(exactLimit);
    expect(
      previewTemplateUpdateContent(new TextEncoder().encode(exactLimit)),
    ).toBe(exactLimit);
    expect(previewTemplateUpdateContent(overLimit)).toBe(
      "[File exceeds the 128 KiB preview limit]",
    );
    expect(
      previewTemplateUpdateContent(new TextEncoder().encode(overLimit)),
    ).toBe("[File exceeds the 128 KiB preview limit]");
  });

  it("preserves the exact byte slice and declines binary data", () => {
    const buffer = Uint8Array.of(0, 65, 66, 0);
    expect(previewTemplateUpdateContent(buffer.subarray(1, 3))).toBe("AB");
    expect(previewTemplateUpdateContent(buffer)).toBe(
      binaryTemplateUpdatePreview,
    );
    expect(previewTemplateUpdateContent("A\0B")).toBe(
      binaryTemplateUpdatePreview,
    );
    expect(previewTemplateUpdateContent(Uint8Array.of(0xc3, 0x28))).toBe(
      binaryTemplateUpdatePreview,
    );
  });
});
