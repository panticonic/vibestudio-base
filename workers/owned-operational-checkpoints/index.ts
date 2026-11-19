import { DurableObjectBase, rpc } from "@workspace/runtime/worker/kernel";
import { assessmentSchema } from "@workspace/natlang-services/ownedOperationsContracts";
import type { z } from "zod";
const access = { website: { kind: "closed" as const, reason: "Owned operational checkpoint state is accessed only by installed callers." },
  principals: ["host", "user", "code"] as const, effect: { kind: "open" as const }, tier: "open" as const };
export class OwnedCheckpointDO extends DurableObjectBase {
  static override schemaVersion = 1;
  protected override requiredTables() { return ["operational_checkpoints"]; }
  protected createTables() {
    this.sql.exec("CREATE TABLE IF NOT EXISTS operational_checkpoints (revision INTEGER PRIMARY KEY, assessment TEXT NOT NULL)");
  }
  @rpc({ ...access, sensitivity: "read" })
  snapshot() {
    this.ensureReady();
    const checkpoints = this.sql.exec<{ revision: number; assessment: string }>(
      "SELECT revision, assessment FROM operational_checkpoints ORDER BY revision").toArray()
      .map(row => ({ revision: row.revision, assessment: assessmentSchema.parse(JSON.parse(row.assessment)) }));
    return { revision: checkpoints.at(-1)?.revision ?? 0, checkpoints };
  }
  @rpc({ ...access, sensitivity: "write" })
  append(expectedRevision: number, value: z.infer<typeof assessmentSchema>) {
    const assessment = assessmentSchema.parse(value), current = this.snapshot();
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || current.revision !== expectedRevision)
      throw new Error("Checkpoint revision changed; reread this exact worker before continuing.");
    this.sql.exec("INSERT INTO operational_checkpoints(revision, assessment) VALUES (?, ?)", expectedRevision + 1, JSON.stringify(assessment));
    return this.snapshot();
  }
}
