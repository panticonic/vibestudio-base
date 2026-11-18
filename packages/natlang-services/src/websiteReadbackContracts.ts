import { z } from "zod";

const flags = z.boolean();
const strings = z.array(z.string());
export const websiteReadbackMethods = {
  observe: {
    args: z.tuple([]),
    returns: z.object({
      artifact: z.object({
        referenceMatches: flags,
        manifestMatches: flags,
        hasHtml: flags,
        unapprovedFiles: strings,
        publicFiles: z.number(),
        artifactDigest: z.string(),
      }),
      presentation: z.object({
        matchesPanelAttempt: flags,
        missedProbes: strings,
        observedProbes: strings,
      }),
      publication: z
        .object({
          phase: z.enum([
            "prepared",
            "destination-ready",
            "uploaded",
            "submitted",
          ]),
          matchesIntent: flags,
          matchesArtifact: flags,
          matchesOperation: flags,
          observedReadyUrl: flags,
          verifiedPublicDigest: flags,
        })
        .nullable(),
      matchesRequest: flags,
    }),
  },
} as const;
