import { z } from "zod";

const id = z.string().min(1);
const lead = z.object({ id, eventId: id, snippet: z.string() }).strict();

export const decisionRecallMethods = {
  search: { args: z.tuple([id]), returns: z.array(lead) },
} as const;
export const decisionSourceMethods = {
  read: {
    args: z.tuple([id]),
    returns: z
      .object({ eventId: id, path: id, contentHash: id, text: z.string() })
      .strict()
      .nullable(),
  },
} as const;
