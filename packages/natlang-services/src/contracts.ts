/**
 * Contracts for the services that have no service-schema table of their own:
 * the system-test inspection packet. They are zod so the declaration generator
 * reads them like every other contract.
 */
import { z } from "zod";

const systemTestInspectionSchema = z
  .object({
    runId: z.string(),
    status: z.enum(["running", "completed", "cancelled", "errored"]),
    error: z.string().optional(),
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
    errored: z.number(),
    toolFailureCount: z.number(),
    testsWithToolFailures: z.number(),
    skipped: z.number(),
    notInstalled: z.array(z.object({ name: z.string(), missingUnits: z.array(z.string()) })),
    durationMs: z.number(),
    failedTests: z.array(z.string()).describe("Names of the tests that failed or errored."),
    testsWithUnexpectedToolFailures: z.array(z.string()),
    config: z.record(z.string(), z.unknown()).describe("How the run was configured."),
    startedAt: z.string(),
    updatedAt: z.string().optional(),
    completedAt: z.string().optional(),
    provenance: z.record(z.string(), z.unknown()).describe("What source and model produced the run."),
    diagnostics: z
      .unknown()
      .describe(
        "The bounded failure packet: one diagnostic per failed test with its error, validator verdicts, tool failures, and recent messages. Pass testName to get one test's packet instead."
      ),
  })
  .describe("The run packet `pnpm system-test inspect RUN_ID --json` prints.");

export const systemTestsMethods = {
  inspect: {
    description:
      "Read the bounded inspection packet of a system-test run: its summary, configuration, provenance, and a diagnostic per failed test. With testName, return that one test's diagnostic instead. Read-only. runnerTargetId names the system-test runner that holds the run's record (the runner target the run was started on), and the runner gates who may read it.",
    args: z.tuple([
      z.string().describe("The system-test runner Durable Object target that holds the run."),
      z.string().describe("The run id."),
      z.string().optional().describe("One test's name, for that test's packet."),
    ]),
    returns: systemTestInspectionSchema.or(z.record(z.string(), z.unknown())),
  },
} as const;

export { systemTestInspectionSchema };

const repairObservation = z.object({
  revision: z.string(),
  generation: z.string(),
  phase: z.string(),
  controls: z.array(z.string()),
  console: z.array(z.string()),
  buildDiagnostics: z.array(z.string()),
});
const repairInteraction = z.object({
  steps: z.array(
    z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("click"),
        role: z.string(),
        name: z.string(),
      }),
      z.object({
        kind: z.literal("fill"),
        role: z.string(),
        name: z.string(),
        text: z.string(),
      }),
      z.object({
        kind: z.literal("inspect"),
        role: z.string(),
        name: z.string(),
      }),
    ]),
  ),
});
export const panelRepairMethods = {
  observe: {
    description: "Read source revision and exact rendered panel generation with real console evidence.",
    args: z.tuple([]),
    returns: repairObservation,
  },
  interact: {
    description:
      "Perform accessible role/name actions on the assigned generation and return observed browser evidence.",
    args: z.tuple([z.string(), repairInteraction]),
    returns: z.object({ observations: z.array(z.string()) }),
  },
  listSource: {
    description: "List all files in the assigned panel repository at the supplied current revision.",
    args: z.tuple([z.string()]),
    returns: z.array(z.string()),
  },
  readSource: {
    description: "Read existing text files in the assigned panel repository at the supplied revision.",
    args: z.tuple([z.string(), z.array(z.string())]),
    returns: z.array(z.object({ path: z.string(), text: z.string() })),
  },
  apply: {
    description: "Atomically apply exact before/after file edits using the expected working head. No publication.",
    args: z.tuple([z.string(), z.array(z.object({ path: z.string(), before: z.string(), after: z.string() }))]),
    returns: z.object({ revision: z.string() }),
  },
  build: {
    description: "Compile the assigned panel at this exact revision without publishing.",
    args: z.tuple([z.string()]),
    returns: z.object({
      revision: z.string(),
      passed: z.boolean(),
      diagnostics: z.array(z.string()),
    }),
  },
  rebuild: {
    description: "Compile the assigned panel at this exact revision without publishing.",
    args: z.tuple([z.string()]),
    returns: repairObservation,
  },
} as const;
