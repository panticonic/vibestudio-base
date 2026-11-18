import { z } from "zod";
import { vcsMergeCoordinateRefSchema } from "@vibestudio/service-schemas/vcs";
const file = z.object({ path: z.string(), text: z.string() });
const snapshot = z.object({
  head: z.string(),
  source: z.string(),
  currentIntent: z.array(z.string()),
  sourceIntent: z.array(z.string()),
  coordinates: z.array(vcsMergeCoordinateRefSchema),
  remaining: z.array(vcsMergeCoordinateRefSchema),
  files: z.array(file),
  evidence: z.array(z.string()),
});
const edit = z.object({
  path: z.string(),
  before: z.string(),
  after: z.string(),
});
const decision = z.object({
  coordinate: vcsMergeCoordinateRefSchema,
  resolution: z.enum(["composed", "theirs", "ours", "current"]),
  rationale: z.string().min(1),
});
export const workspaceIntegrationMethods = {
  observe: {
    description:
      "Read actual current/source comparison, assigned files and intent evidence for the fixed source/context.",
    args: z.tuple([]),
    returns: snapshot,
  },
  apply: {
    description:
      "Apply exact assigned-file edits in one expected-head VCS command. It does not publish or perform a merge.",
    args: z.tuple([z.string(), z.array(edit)]),
    returns: z.object({ head: z.string() }),
  },
  merge: {
    description:
      "Resolve explicit offered coordinates of the fixed source at the observed current head; preserve actual partial effects on error.",
    args: z.tuple([z.string(), z.array(decision)]),
    returns: z.object({ head: z.string() }),
  },
} as const;
