import { z } from "zod";

export const scratchHandoffReadMethods = {
  read: {
    args: z.tuple([z.string()]),
    returns: z.object({ id: z.string(), lines: z.array(z.string()) }).strict().nullable(),
  },
} as const;

export const scratchHandoffWriteMethods = {
  stage: {
    args: z.tuple([z.string()]),
    returns: z.object({ path: z.string(), bytes: z.number().int() }).strict().nullable(),
  },
} as const;
