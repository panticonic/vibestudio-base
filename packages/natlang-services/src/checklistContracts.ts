import { z } from "zod";

const item = z.enum(["1", "2", "3"]);
const screen = z
  .object({
    sessionId: z.string().min(1),
    ptyId: z.string().min(1),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
    checked: z.array(item),
  })
  .strict();
export const checklistOpenMethods = {
  launch: { args: z.tuple([]), returns: screen },
} as const;
export const checklistKeysMethods = {
  toggle: { args: z.tuple([item]), returns: screen },
} as const;
export const checklistResumeMethods = {
  resume: { args: z.tuple([z.enum(["reattach", "restart"])]), returns: screen },
} as const;
