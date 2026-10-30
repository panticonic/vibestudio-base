import type { AddresseeRow, Fit, Resolution } from "../types.js";

/**
 * One exact recipient only when exactly one row fits and no other row might: a message must never reach the wrong
 * person, and asking costs the user one line. Otherwise the ambiguity is returned with the rows that compete (or
 * the whole roster when nothing fits).
 */
export default function decide(
  rows: readonly AddresseeRow[],
  fits: readonly Fit[],
): Resolution {
  const yes = rows.filter((_, index) => fits[index] === "yes");
  const maybe = rows.filter((_, index) => fits[index] === "maybe");
  if (yes.length === 1 && maybe.length === 0)
    return { kind: "ref", ref: yes[0]!.ref, note: yes[0]!.note };
  const competing = [...yes, ...maybe];
  if (competing.length === 0)
    return { kind: "ambiguous", reason: "none", candidates: [...rows] };
  return { kind: "ambiguous", reason: "several", candidates: competing };
}
