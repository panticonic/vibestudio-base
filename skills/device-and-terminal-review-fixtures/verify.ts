import type { DeviceAndTerminalWorld } from "./worlds.js";

function record(input: unknown): Record<string, unknown> | null {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

/** Evaluate findings and receipt identity independently of the program. */
export function verifyDeviceAndTerminalWorld(
  world: DeviceAndTerminalWorld,
  candidate: unknown,
) {
  const body = record(candidate);
  const rows = body?.["findings"];
  const sameCount =
    Array.isArray(rows) && rows.length === world.expected.findings.length;
  const checks = {
    status: body?.["status"] === world.expected.status,
    findings:
      sameCount &&
      world.expected.findings.every(
        (finding, index) => record(rows[index])?.["code"] === finding.code,
      ),
    evidence:
      sameCount &&
      world.expected.findings.every((finding, index) => {
        const ids = record(rows[index])?.["evidenceIds"];
        return (
          Array.isArray(ids) &&
          new Set(ids).size === ids.length &&
          finding.evidenceIds.length === ids.length &&
          finding.evidenceIds.every((id, position) => ids[position] === id)
        );
      }),
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}
