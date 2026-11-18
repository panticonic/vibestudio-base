import { z } from "zod";

const offer = z
  .object({
    installedCommit: z.string(),
    incomingCommit: z.string().nullable(),
    checkedAt: z.number(),
    workspaceAppVersion: z.string(),
    currentAppVersion: z.string(),
    targetAppVersion: z.string().nullable(),
    minimumAppVersion: z.string().nullable(),
    hostUnavailable: z.boolean(),
    status: z.enum([
      "current",
      "available",
      "different-epoch",
      "requires-app-update",
      "error",
    ]),
  })
  .strict();

const review = z
  .object({
    operationId: z.string(),
    contextId: z.string(),
    mainEventId: z.string(),
    incomingCommit: z.string(),
    state: z.enum(["review", "published"]),
    repositories: z.array(
      z
        .object({
          repoPath: z.string(),
          kind: z.enum(["added", "changed", "removed"]),
        })
        .strict(),
    ),
    conflicts: z.array(
      z
        .object({
          repoPath: z.string(),
          deltaId: z.string(),
          kind: z.enum(["file", "repository"]),
          id: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export const templateOfferMethods = {
  read: { args: z.tuple([]), returns: offer.nullable() },
} as const;
export const templateCandidatePrepareMethods = {
  prepare: {
    args: z.tuple([]),
    returns: z.union([
      z.object({ outcome: z.literal("acknowledged"), review }).strict(),
      z
        .object({
          outcome: z.enum(["offer-changed", "unconfirmed"]),
          review: z.null(),
        })
        .strict(),
    ]),
  },
} as const;
export const templateCandidateReviewMethods = {
  read: {
    args: z.tuple([]),
    returns: z
      .object({ review, mainEventId: z.string().nullable() })
      .strict()
      .nullable(),
  },
} as const;
