/** The fixed sequence: list the roster, judge each row against the utterance, decide. Only the judgment is natural language. */
import { addressees } from "natlang:services";
import rowFit from "./rowFit.nl";
import decide from "./decide.js";
import type { AddresseeRow, Resolution } from "../types.js";

export default async function resolve(utterance: string): Promise<Resolution> {
  const rows: AddresseeRow[] = await addressees.list();
  const fits = await Promise.all(rows.map((row) => rowFit(utterance, row)));
  return decide(rows, fits);
}
