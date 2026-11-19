import type { ChecklistChanges, ChecklistTarget, ItemKey } from "../types.js";

export function changes(
  target: ChecklistTarget,
  initial: ItemKey[],
): ChecklistChanges {
  return {
    check: target.checked.filter((key) => !initial.includes(key)),
    clear: target.unchecked.filter((key) => initial.includes(key)),
  };
}

export function matchesPlan(
  target: ChecklistTarget,
  initial: ItemKey[],
  keys: ItemKey[],
): boolean {
  const wanted = [...target.checked, ...target.unchecked];
  if (new Set(wanted).size !== wanted.length) return false;
  const { check, clear } = changes(target, initial);
  const expected = [...check, ...clear];
  return (
    keys.length === expected.length &&
    new Set(keys).size === keys.length &&
    expected.every((key) => keys.includes(key))
  );
}

export function matchesTarget(
  target: ChecklistTarget,
  initial: ItemKey[],
  final: ItemKey[],
): boolean {
  const expected = new Set([
    ...initial.filter((key) => !target.unchecked.includes(key)),
    ...target.checked,
  ]);
  return (
    final.length === expected.size &&
    expected.size === new Set(final).size &&
    final.every((key) => expected.has(key))
  );
}
