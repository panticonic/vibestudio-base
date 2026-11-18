import { z } from "zod";

const scope = {
  role: z.enum(["candidate", "baseline"]),
  revision: z.string().min(1),
};
const compilerIssue = z
  .object({
    source: z.string(),
    line: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
    code: z.string(),
    message: z.string(),
  })
  .strict();
const callable = z
  .object({
    source: z.string(),
    parameters: z.array(z.string()),
    returns: z.string(),
  })
  .strict();
export const authoringCompilerMethods = {
  inspect: {
    args: z.tuple([scope.role]),
    returns: z.discriminatedUnion("state", [
      z
        .object({
          ...scope,
          state: z.literal("compiled"),
          functions: z.array(callable),
          services: z.array(z.string()),
        })
        .strict(),
      z
        .object({
          ...scope,
          state: z.literal("rejected"),
          diagnostics: z.array(compilerIssue).min(1),
        })
        .strict(),
    ]),
  },
} as const;
