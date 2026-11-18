import {
  testExecutionResultV1Schema,
  testFileResultSchema,
  unitBuildReportSchema,
  unitVerificationReceiptV1Schema,
  workspaceTestCompilationFailureSchema,
} from "@vibestudio/service-schemas/build";
import { z } from "zod";

const sourceFile = z.object({ path: z.string(), text: z.string() });
const edit = z.object({
  path: z.string(),
  before: z.string(),
  after: z.string(),
});
const diagnostic = unitBuildReportSchema.shape.diagnostics.element
  .strip()
  .pick({
    severity: true,
    source: true,
    file: true,
    line: true,
    column: true,
    message: true,
    compilerCode: true,
  });
const buildReport = unitBuildReportSchema
  .strip()
  .pick({
    stateHash: true,
    repoPath: true,
    status: true,
    builds: true,
  })
  .extend({ diagnostics: z.array(diagnostic) });
const receipt = unitVerificationReceiptV1Schema.strip().pick({
  protocol: true,
  operation: true,
  target: true,
  contextId: true,
  ref: true,
  stateHash: true,
  reportDigest: true,
  suite: true,
  runtime: true,
  artifactKey: true,
  executionDigest: true,
});
const testRunStatus = testExecutionResultV1Schema.shape.status;
const testEvidenceBase = z.object({
  operation: z.literal("test"),
  target: z.string(),
  receipt,
});
export const unitRepairTestEvidenceSchema = z.union([
  testEvidenceBase
    .extend({
      status: testRunStatus,
      report: z
        .object({
          status: testRunStatus,
          runtime: z.literal("workerd"),
          artifactKey: z.string(),
          executionDigest: z.string(),
          contextId: z.string(),
          target: z.string(),
          passed: z.number(),
          failed: z.number(),
          total: z.number(),
          details: z.array(testFileResultSchema),
        })
        .passthrough(),
      truncatedFiles: z.number(),
      truncatedErrors: z.number(),
    })
    .passthrough(),
  testEvidenceBase
    .extend({
      status: z.literal("compilation-failed"),
      report: workspaceTestCompilationFailureSchema
        .strip()
        .pick({ code: true })
        .extend({ diagnostics: z.array(diagnostic) }),
      truncatedDiagnostics: z.number(),
      truncatedDiagnosticText: z.number(),
    })
    .passthrough(),
]);
export const unitRepairEvidenceSchema = z.object({
  revision: z.string(),
  build: buildReport,
  tests: unitRepairTestEvidenceSchema.nullable(),
});
const revision = z
  .string()
  .describe("The exact working revision from the last observation.");

export const unitRepairMethods = {
  observe: {
    description:
      "Read a real compiler report at the assigned worker's current revision.",
    args: z.tuple([]),
    returns: unitRepairEvidenceSchema,
  },
  listSource: {
    description:
      "List files in the assigned worker repository at the supplied revision.",
    args: z.tuple([revision]),
    returns: z.array(z.string()),
  },
  readSource: {
    description:
      "Read exact text from the assigned worker repository at the supplied revision.",
    args: z.tuple([revision, z.array(z.string())]),
    returns: z.array(sourceFile),
  },
  apply: {
    description:
      "Apply the exact production source edits atomically at the expected revision.",
    args: z.tuple([revision, z.array(edit)]),
    returns: z.object({ revision: z.string() }),
  },
  build: {
    description:
      "Compile the assigned worker at the supplied revision and read its diagnostics.",
    args: z.tuple([revision]),
    returns: unitRepairEvidenceSchema,
  },
  test: {
    description:
      "Run the original manifest-selected workerd suite at the compiled revision and read the actual receipt.",
    args: z.tuple([revision]),
    returns: unitRepairEvidenceSchema,
  },
} as const;
