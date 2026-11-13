/**
 * Tendril channel payloads and TendrilDO shapes (tendrils plan §5.1, §5.2).
 * Every value crossing the channel or the DO boundary is validated here.
 */
import { z } from "zod";

export const TENDRIL_EVENT = "tendril.event";
export const TENDRIL_RECORD = "tendril.record";
export const TENDRIL_STATE_SIGNAL = "tendril.state";
/** Serialized size bound for one event/record payload. */
export const TENDRIL_EVENT_MAX_BYTES = 64 * 1024;

export const BlobRefSchema = z.object({
  id: z.string().min(1),
  mimeType: z.string().min(1),
  name: z.string().optional(),
  size: z.number().int().nonnegative(),
});
export type BlobRef = z.infer<typeof BlobRefSchema>;

export const TendrilPresentationRefSchema = z.object({
  tendrilId: z.string().min(1),
  slotId: z.string().min(1),
  deviceId: z.string().nullable(),
});
export type TendrilPresentationRef = z.infer<typeof TendrilPresentationRefSchema>;

export const TendrilEventPayloadSchema = TendrilPresentationRefSchema.extend({
  cid: z.string().min(1),
  data: z.unknown(),
  blobs: z.array(BlobRefSchema).optional(),
}).superRefine((payload, ctx) => {
  const size = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (size > TENDRIL_EVENT_MAX_BYTES)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `tendril event is ${size} bytes; the limit is ${TENDRIL_EVENT_MAX_BYTES}. Upload large data with upload() and send the BlobRef.`,
    });
});
export type TendrilEventPayload = z.infer<typeof TendrilEventPayloadSchema>;

const PathSchema = z.array(z.string());
export const StateOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), path: PathSchema, value: z.unknown() }),
  z.object({ op: z.literal("delete"), path: PathSchema }),
]);
export type StateOp =
  | { op: "set"; path: string[]; value: unknown }
  | { op: "delete"; path: string[] };

export const TendrilStateSignalSchema = z.object({
  tendrilId: z.string().min(1),
  rev: z.number().int().nonnegative(),
  ops: z.array(StateOpSchema),
  by: z.string(),
});
export type TendrilStateSignal = {
  tendrilId: string;
  rev: number;
  ops: StateOp[];
  by: string;
};

export const TendrilInstructionMetadataSchema = z.object({
  tendril: TendrilPresentationRefSchema.extend({
    via: z.enum(["voice", "text"]),
  }),
});
export type TendrilInstructionMetadata = z.infer<typeof TendrilInstructionMetadataSchema>;

export const TendrilAboutSchema = z.object({
  purpose: z.string(),
  layout: z.string().optional(),
  source: z.string().optional(),
});
export type TendrilAbout = z.infer<typeof TendrilAboutSchema>;

export const TendrilFunctionDeclSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  parameters: z.record(z.unknown()).optional(),
  phrases: z.array(z.string()).optional(),
});
export type TendrilFunctionDecl = z.infer<typeof TendrilFunctionDeclSchema>;

export const TendrilPresentationSchema = z.object({
  slotId: z.string().min(1),
  deviceId: z.string().nullable(),
  label: z.string(),
});
export type TendrilPresentation = z.infer<typeof TendrilPresentationSchema>;

export const TendrilCreateInputSchema = z.object({
  source: z.string().min(1),
  channelId: z.string().min(1),
  contextId: z.string().min(1),
  name: z.string().min(1),
  about: TendrilAboutSchema.optional(),
});
export type TendrilCreateInput = z.infer<typeof TendrilCreateInputSchema>;

export interface TendrilDescription {
  tendrilId: string;
  source: string;
  channelId: string;
  contextId: string;
  name: string;
  about: TendrilAbout | null;
  presentations: TendrilPresentation[];
  functions: (TendrilFunctionDecl & { slotId: string })[];
  rev: number;
}

/** `ui.feedback` occurrence key for a runtime failure (plan §5.1). */
export async function tendrilFailureOccurrenceKey(
  buildKey: string,
  message: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(message),
  );
  const hex = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `tendril:${buildKey}:${hex.slice(0, 16)}`;
}
