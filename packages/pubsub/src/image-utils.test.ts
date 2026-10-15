import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64 } from "@vibestudio/rpc";
import {
  base64ToUint8Array,
  buildClaudeContentBlocks,
  buildOpenAIContents,
  uint8ArrayToBase64,
} from "./image-utils";

describe("image attachment base64 codec", () => {
  it("preserves the public names as aliases of the canonical RPC codec", () => {
    expect(uint8ArrayToBase64).toBe(bytesToBase64);
    expect(base64ToUint8Array).toBe(base64ToBytes);
  });

  it("retains binary wire bytes including zero and high-bit bytes", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 254, 255]);
    expect(uint8ArrayToBase64(bytes)).toBe("AAF/gP7/");
    expect(base64ToUint8Array("AAF/gP7/")).toEqual(bytes);
    expect(uint8ArrayToBase64(new Uint8Array())).toBe("");
    expect(base64ToUint8Array("")).toEqual(new Uint8Array());
  });

  it("round-trips attachments beyond a single codec chunk", () => {
    const bytes = Uint8Array.from(
      { length: 131_073 },
      (_, index) => index % 256,
    );
    expect(base64ToUint8Array(uint8ArrayToBase64(bytes))).toEqual(bytes);
  });

  it("uses the canonical encoding in both provider content formats", () => {
    const attachments = [
      {
        id: "image-1",
        data: new Uint8Array([0, 1, 127, 128, 254, 255]),
        mimeType: "image/png",
      },
    ];
    expect(buildClaudeContentBlocks(undefined, attachments)).toEqual([
      {
        type: "image",
        source: { type: "base64", media_type: "image/png", data: "AAF/gP7/" },
      },
    ]);
    expect(buildOpenAIContents(undefined, attachments)).toEqual([
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,AAF/gP7/", detail: "auto" },
      },
    ]);
  });
});
