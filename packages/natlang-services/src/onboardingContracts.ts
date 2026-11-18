import { z } from "zod";

export const onboardingReadMethods = {
  inspect: {
    args: z.tuple([]),
    returns: z
      .object({
        receipt: z.string().min(1),
        rows: z.array(
          z
            .object({
              id: z.string().min(1),
              state: z.enum([
                "connected",
                "connected-unverified",
                "configured",
                "using-defaults",
                "not-configured",
                "in-progress",
                "needs-attention",
                "unavailable",
                "unknown",
              ]),
              observed: z.boolean(),
            })
            .strict(),
        ),
        route: z
          .object({
            capabilityId: z.string().min(1),
            action: z.string().min(1),
            via: z.enum([
              "owner-skill",
              "about-page",
              "model-settings",
              "panel",
              "shell-navigation",
              "conversation",
            ]),
            destination: z.string().nullable(),
          })
          .strict()
          .nullable(),
      })
      .strict(),
  },
} as const;
