import { localDeliverySend } from "natlang:services";
import type { LocalAttempt } from "../../types.js";

export default async function commitNote(basis: string, content: string): Promise<LocalAttempt> {
  return localDeliverySend.submit(basis, content);
}
