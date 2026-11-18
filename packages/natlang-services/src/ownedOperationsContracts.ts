import { z } from "zod";
export const roleSchema = z.enum(["impact", "recovery", "release"]);
export const assessmentSchema = z.object({ role: roleSchema, evidenceIds: z.array(z.string().min(1)),
  decision: z.enum(["ready", "blocked"]), reason: z.string().min(1) }).strict();
export const snapshotSchema = z.object({ revision: z.number().int().nonnegative(), checkpoints: z.array(
  z.object({ revision: z.number().int().positive(), assessment: assessmentSchema }).strict()) }).strict();
export const ownedHandleSchema = z.object({ id: z.string().min(1), contextId: z.string().min(1),
  targetId: z.string().min(1), role: roleSchema }).strict();
export const cleanupSchema = z.object({ retiredIds: z.array(z.string()), destroyedContextIds: z.array(z.string()) }).strict();
const checkpointWebsite = { kind: "closed" as const, reason: "Operational checkpoint storage is available only to installed owned callers." };
export const checkpointMethods = {
  snapshot: { website: checkpointWebsite, args: z.tuple([]), returns: snapshotSchema },
  append: { website: checkpointWebsite, args: z.tuple([z.number().int().nonnegative(), assessmentSchema]), returns: snapshotSchema },
} as const;
export const ownedOperationsMethods = {
  open: { args: z.tuple([roleSchema]), returns: ownedHandleSchema,
    description: "Create one actual caller-owned context and durable checkpoint worker for a semantic role. Retain its returned exact handle." },
  read: { args: z.tuple([ownedHandleSchema]), returns: snapshotSchema,
    description: "Fresh RPC read of an issued owned worker's durable checkpoints." },
  append: { args: z.tuple([ownedHandleSchema, z.number().int().nonnegative(), assessmentSchema]), returns: snapshotSchema,
    description: "Append an assessment for the worker's assigned role at its exact observed revision; conflict fails without an invented update." },
  restart: { args: z.tuple([ownedHandleSchema]), returns: snapshotSchema,
    description: "Restart the exact issued worker through runtime supervision and freshly reread its retained durable state." },
  close: { args: z.tuple([]), returns: cleanupSchema,
    description: "Retire only issued resources, destroy their owned contexts and independently confirm their absence. The caller also invokes this in finally." },
} as const;

export const ownedOperationsRequestSchema = z.discriminatedUnion("kind", [
 z.object({ kind: z.literal("incident-handoff"), goal: z.string().min(1), signals: z.array(z.object({id:z.string().min(1),text:z.string().min(1)}).strict()).min(1) }).strict(),
 z.object({ kind: z.literal("release-continuation"), goal: z.string().min(1), before: z.array(z.object({id:z.string().min(1),state:z.enum(["approved","pending","rejected"])}).strict()).min(1), after: z.array(z.object({id:z.string().min(1),state:z.enum(["approved","pending","rejected"])}).strict()).min(1) }).strict()
]);
