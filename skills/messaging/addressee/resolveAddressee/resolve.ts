/**
 * Resolve a named recipient to the exact ref `notify` takes: the row the utterance names in so many words, never a
 * guess between rows it names equally well, and the whole roster back when it names none. Measured on the executor
 * (DECOMPOSITION.md), a small model picking among the rows named the wrong recipient, so no model is asked.
 */
import { addressees } from "natlang:services";
import lexical from "./lexical.js";
import type { AddresseeRow, Resolution } from "../types.js";

export default async function resolve(utterance: string): Promise<Resolution> {
  const rows: AddresseeRow[] = await addressees.list();
  const named = lexical(utterance, rows);
  if (named.length === 1)
    return {
      kind: "ref",
      ref: rows[named[0]!]!.ref,
      note: rows[named[0]!]!.note,
    };
  if (named.length > 1)
    return {
      kind: "ambiguous",
      reason: "several",
      candidates: named.map((index) => rows[index]!),
    };
  return { kind: "ambiguous", reason: "none", candidates: rows };
}
