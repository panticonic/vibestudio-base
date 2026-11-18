import { z } from "zod";

const ref = z.string().min(1);
const attachOptions = z
  .object({
    replay: z.boolean(),
    response: z.enum(["inherit", "mentioned-strict"]),
    modelRef: ref.nullable(),
  })
  .strict();
const membership = z
  .object({
    goal: z.string(),
    channelId: ref,
    contextId: ref,
    handle: ref,
    action: z.enum(["attach", "detach", "inspect"]),
    options: attachOptions.nullable(),
  })
  .strict();
const roster = z
  .object({
    state: z.enum(["member", "absent", "conflict", "unavailable"]),
    participantId: ref.nullable(),
  })
  .strict();
const membershipReceipt = z
  .object({
    outcome: z.enum([
      "acknowledged",
      "already",
      "blocked",
      "rejected",
      "uncertain",
    ]),
    participantId: ref.nullable(),
  })
  .strict();

export const channelAgentReadMethods = {
  read: { args: z.tuple([membership]), returns: roster },
} as const;
export const channelAgentAttachMethods = {
  attach: {
    args: z.tuple([membership, attachOptions]),
    returns: membershipReceipt,
  },
} as const;
export const channelAgentDetachMethods = {
  detach: { args: z.tuple([membership]), returns: membershipReceipt },
} as const;

export const localModelTaskInventoryMethods = {
  inspect: {
    args: z.tuple([ref]),
    returns: z
      .object({
        ref,
        state: z.enum([
          "ready",
          "startable",
          "not-installed",
          "starting",
          "downloading",
          "error",
        ]),
        fit: z.enum(["full-gpu", "partial-offload", "cpu-only", "too-big"]),
        toolsCapable: z.boolean(),
        contextWindow: z.number(),
        progress: z.number().nullable(),
        errorMessage: z.string().nullable(),
      })
      .strict()
      .nullable(),
  },
} as const;

export const localModelTaskInstallMethods = {
  installOnce: {
    args: z.tuple([ref]),
    returns: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("installed"), ref, jobId: ref }).strict(),
      z.object({ kind: z.literal("validated-existing"), ref }).strict(),
      z.object({ kind: z.literal("state-changed"), ref }).strict(),
    ]),
  },
} as const;
