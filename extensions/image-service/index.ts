import type {} from "@vibestudio/extension";
import { loadPhoton } from "./image/photon.js";
import { Buffer } from "node:buffer";
import { resizeImage, formatDimensionNote, type ImageResizeOptions } from "./image/image-resize.js";
import { convertImage } from "./image/image-convert.js";
import { detectMimeFromBytes } from "./image/mime.js";

function toUint8Array(value: Uint8Array | ArrayBuffer): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error("image-service: expected Uint8Array or ArrayBuffer");
}

/** Public API surface of this extension — the awaited return of {@link activate}. */
export type Api = Awaited<ReturnType<typeof activate>>;
declare module "@vibestudio/extension" {
  interface WorkspaceExtensions {
    "@workspace-extensions/image-service": Api;
  }
}

export async function activate(ctx: { log: { info(message: string): void } }) {
  ctx.log.info("image-service activating");
  return {
    async resize(rawData: Uint8Array | ArrayBuffer, mimeType: string, options?: ImageResizeOptions) {
      const data = toUint8Array(rawData);
      const result = await resizeImage(
        { type: "image", mimeType, data: Buffer.from(data).toString("base64") },
        options
      );
      const out: {
        data: string;
        mimeType: string;
        width: number;
        height: number;
        originalWidth: number;
        originalHeight: number;
        wasResized: boolean;
        dimensionNote?: string;
      } = {
        data: result.data,
        mimeType: result.mimeType,
        originalWidth: result.originalWidth,
        originalHeight: result.originalHeight,
        width: result.width,
        height: result.height,
        wasResized: result.wasResized,
      };
      const note = formatDimensionNote(result);
      if (note !== undefined) out.dimensionNote = note;
      return out;
    },

    async convert(rawData: Uint8Array | ArrayBuffer, sourceMimeType: string, targetMimeType: string) {
      const result = await convertImage(toUint8Array(rawData), sourceMimeType, targetMimeType);
      if (!result) {
        throw new Error(
          `image-service.convert: failed to convert ${sourceMimeType} to ${targetMimeType}`
        );
      }
      return {
        data: result.data,
        mimeType: result.mimeType,
      };
    },

    async getMetadata(rawData: Uint8Array | ArrayBuffer) {
      const bytes = toUint8Array(rawData);
      const mimeType = detectMimeFromBytes(bytes);
      if (!mimeType || !["image/png", "image/jpeg", "image/webp"].includes(mimeType))
        throw new Error("Unsupported image format");
      const photon = await loadPhoton();
      if (!photon) throw new Error("Image decoder is unavailable");
      const image = photon.PhotonImage.new_from_byteslice(bytes);
      try {
        return {
          mimeType,
          width: image.get_width(),
          height: image.get_height(),
          byteLength: bytes.byteLength,
        };
      } finally {
        image.free();
      }
    },
    async detectMimeType(rawData: Uint8Array | ArrayBuffer) {
      return detectMimeFromBytes(toUint8Array(rawData));
    },
  };
}
