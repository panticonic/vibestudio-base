import { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";
import { sha256Hex } from "@vibestudio/content-addressing";

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

function paeth(left: number, above: number, diagonal: number) {
  const estimate = left + above - diagonal;
  const leftError = Math.abs(estimate - left);
  const aboveError = Math.abs(estimate - above);
  const diagonalError = Math.abs(estimate - diagonal);
  if (leftError <= aboveError && leftError <= diagonalError) return left;
  return aboveError <= diagonalError ? above : diagonal;
}

const filters = [
  () => 0,
  (left: number) => left,
  (_left: number, above: number) => above,
  (left: number, above: number) => (left + above) >> 1,
  paeth,
];

/** Measure visible marks against the white PDF canvas, using original raster coordinates. */
export function inspectPdfRaster(data: Uint8Array) {
  if (!(data instanceof Uint8Array)) throw new Error("The PDF renderer did not return retained image bytes.");
  if (data.length < 45 || !pngSignature.every((byte, index) => data[index] === byte))
    throw new Error("The retained PDF page is not a PNG image.");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const channels = new Map([[0, 1], [2, 3], [4, 2], [6, 4]]).get(data[25]!);
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452 ||
    !width || !height || width * height > 4_000_000 ||
    data[24] !== 8 || !channels || data[26] || data[27] || data[28])
    throw new Error("The retained PDF raster has an unsupported pixel encoding.");
  const compressed: Uint8Array[] = [];
  let ended = false;
  for (let offset = 8; offset + 12 <= data.length; ) {
    const length = view.getUint32(offset);
    const type = view.getUint32(offset + 4);
    const end = offset + 12 + length;
    if (end > data.length) throw new Error("The retained PDF raster is truncated.");
    if (type === 0x49444154) compressed.push(data.subarray(offset + 8, end - 4));
    if (type === 0x49454e44) {
      ended = length === 0 && end === data.length;
      break;
    }
    offset = end;
  }
  if (!ended || !compressed.length) throw new Error("The retained PDF raster lacks complete image data.");
  const stride = width * channels;
  const pixelBytes = (stride + 1) * height;
  const raw = inflateSync(Buffer.concat(compressed), { maxOutputLength: pixelBytes });
  if (raw.length !== pixelBytes) throw new Error("The PDF raster lacks its declared pixels.");
  const current = new Uint8Array(stride);
  const above = new Uint8Array(stride);
  const alpha = channels % 2 === 0;
  const colors = alpha ? channels - 1 : channels;
  let inkPixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = filters[raw[start]!];
    if (!filter) throw new Error("The PDF raster has an invalid row filter.");
    for (let index = 0; index < stride; index++) {
      const left = current[index - channels] ?? 0;
      const diagonal = above[index - channels] ?? 0;
      const up = above[index]!;
      current[index] = raw[start + 1 + index]! + filter(left, up, diagonal);
    }
    for (let x = 0; x < width; x++) {
      const pixel = x * channels;
      if (alpha && current[pixel + colors] === 0) continue;
      let visible = false;
      for (let channel = 0; channel < colors; channel++) visible ||= current[pixel + channel] !== 255;
      if (!visible) continue;
      inkPixels++;
      minX = Math.min(x, minX);
      minY = Math.min(y, minY);
      maxX = Math.max(x, maxX);
      maxY = Math.max(y, maxY);
    }
    above.set(current);
  }
  return {
    imageDigest: sha256Hex(data),
    width,
    height,
    inkPixels,
    inkBounds: inkPixels ? [minX, minY, maxX + 1, maxY + 1] : null,
  };
}
