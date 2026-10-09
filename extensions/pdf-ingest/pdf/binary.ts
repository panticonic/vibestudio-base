import { createHash } from "node:crypto";

export function sha256Hex(data: Uint8Array | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function assertPdfBytes(data: Uint8Array): void {
  const header = Buffer.from(data.subarray(0, 8)).toString("latin1");
  if (!header.startsWith("%PDF-")) {
    throw new Error("pdf-ingest: input does not look like a PDF file");
  }
}
