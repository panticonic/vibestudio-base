import type {
  UnitFinding,
  UnitReview,
} from "../workspace-unit-design/types.ts";

function sameFinding(expected: UnitFinding, received: UnitFinding): boolean {
  return (
    expected.decision === received.decision &&
    expected.finding === received.finding &&
    Array.isArray(received.evidenceIds) &&
    expected.evidenceIds.length === received.evidenceIds.length &&
    expected.evidenceIds.every(
      (id, index) => id === received.evidenceIds[index],
    )
  );
}

export function verifyWorkspaceUnitReview(
  expected: UnitReview,
  received: UnitReview,
): boolean {
  if (!received || !sameFinding(expected, received)) return false;
  if (!expected.components) return received.components === undefined;
  return (
    Array.isArray(received.components) &&
    expected.components.length === received.components.length &&
    expected.components.every((component, index) => {
      const actual = received.components?.[index];
      return (
        actual !== undefined &&
        actual !== null &&
        sameFinding(component, actual)
      );
    })
  );
}
