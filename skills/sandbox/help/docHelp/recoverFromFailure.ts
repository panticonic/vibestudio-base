/**
 * Turn a rejected tool or service call into its cause and next step. Typed fields decide the cause when the error has
 * them; otherwise the executor reads the message. The documentation that answers the error is quoted exactly.
 */
import cause from "./cause.nl";
import locateDoc from "./locateDoc.js";
import nextStep from "./nextStep.js";
import typedCause from "./typedCause.js";
import type { FailedCall, Found, Recovery } from "../types.js";

/** The part of a message the executor and the doc search read. */
const MESSAGE_LIMIT = 600;

export default async function recoverFromFailure(failure: FailedCall): Promise<Recovery> {
  const message = failure.error.message.slice(0, MESSAGE_LIMIT);
  const typed = typedCause(failure);
  const [decided, located] = await Promise.all([
    typed ? Promise.resolve(typed.cause) : cause(failure.call, message),
    locateDoc(`${failure.call}: ${message}`),
  ]);
  return {
    cause: decided,
    by: typed ? "typed" : "model",
    next: nextStep(decided),
    ...(typed?.remediation ? { remediation: typed.remediation } : {}),
    docs: located.found.filter((found: Found) => found.fit === "answers"),
  };
}
