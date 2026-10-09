import { base64ToBytes, bytesToBase64 } from "@vibestudio/rpc";

const utf8Decoder = new TextDecoder();
const utf8Encoder = new TextEncoder();

export function decodeUtf8(bytes: Uint8Array): string {
  return utf8Decoder.decode(bytes);
}

export function encodeUtf8(text: string): Uint8Array {
  return utf8Encoder.encode(text);
}

export function utf8ByteLength(text: string): number {
  return encodeUtf8(text).byteLength;
}

export function canonicalBase64Bytes(value: string): { base64: string; bytes: Uint8Array } {
  const bytes = base64ToBytes(value);
  return { base64: bytesToBase64(bytes), bytes };
}

export { base64ToBytes, bytesToBase64 };
