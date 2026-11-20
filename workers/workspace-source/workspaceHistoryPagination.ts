import { canonicalJson, sha256Hex } from "@vibestudio/content-addressing";
import { SemanticVcsError } from "./semanticVcsErrors.js";
import {
  base64ToBytes as bytesFromBase64,
  bytesToBase64 as base64FromBytes,
} from "@vibestudio/rpc";

type Row = Record<string, unknown>;

export const MAX_WORKING_APPLICATIONS = 10_000;

export const MAX_ANCESTRY_EDGES = 100_000;

type SemanticCursorPayload = Readonly<{
  kind: string;
  position: Row;
}>;

const base64UrlFromBytes = (value: Uint8Array): string =>
  base64FromBytes(value)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");

const bytesFromBase64Url = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) {
    throw new Error("invalid base64url");
  }
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  return bytesFromBase64(
    `${value.replaceAll("-", "+").replaceAll("_", "/")}${padding}`,
  );
};

export const semanticCursor = (
  kind: string,
  basis: Row,
  position: Row,
): string => {
  // The resumable position must cross the tool boundary, but the often-large
  // typed basis need not. Bind that exact basis into the digest so a compact
  // cursor still fails closed when either the request or token changes.
  const payload = { kind, position } satisfies SemanticCursorPayload;
  const payloadBytes = new TextEncoder().encode(canonicalJson(payload));
  const digest = sha256Hex(
    new TextEncoder().encode(canonicalJson({ basis, ...payload })),
  );
  return `semantic-page-v2.${digest}.${base64UrlFromBytes(payloadBytes)}`;
};

export const parseSemanticCursor = (
  cursor: string | undefined,
  kind: string,
  basis: Row,
): Row | null => {
  if (!cursor) return null;
  const match = /^semantic-page-v2\.([0-9a-f]{64})\.([A-Za-z0-9_-]+)$/u.exec(
    cursor,
  );
  if (!match) {
    throw new SemanticVcsError("InvalidReference", `Invalid ${kind} cursor`);
  }
  try {
    const payloadBytes = bytesFromBase64Url(match[2]!);
    const payload = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes),
    ) as SemanticCursorPayload | undefined;
    if (
      !payload ||
      payload.kind !== kind ||
      !payload.position ||
      typeof payload.position !== "object"
    ) {
      throw new Error("basis mismatch");
    }
    const canonicalPayload = base64UrlFromBytes(
      new TextEncoder().encode(
        canonicalJson({ kind: payload.kind, position: payload.position }),
      ),
    );
    if (canonicalPayload !== match[2]) throw new Error("non-canonical payload");
    const digest = sha256Hex(
      new TextEncoder().encode(
        canonicalJson({
          basis,
          kind: payload.kind,
          position: payload.position,
        }),
      ),
    );
    if (digest !== match[1]) throw new Error("digest mismatch");
    return payload.position;
  } catch {
    throw new SemanticVcsError(
      "InvalidReference",
      `${kind} cursor does not match its exact basis`,
    );
  }
};
