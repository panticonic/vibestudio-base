import { z } from "zod";

export const automationLifecycleReadMethods = {
  observe: {
    args: z.tuple([z.string()]),
    returns: z
      .object({
        missionId: z.string(),
        revisionDigest: z.string(),
        state: z.enum(["active", "paused", "completed", "retired"]),
      })
      .strict()
      .nullable(),
  },
} as const;
export const automationLifecycleChangeMethods = {
  apply: {
    args: z.tuple([z.string(), z.string(), z.enum(["pause", "resume"])]),
    returns: z.enum(["acknowledged", "already", "blocked", "uncertain"]),
  },
} as const;
