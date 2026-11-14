/** The next step for each cause: what the sandbox and capabilities skills say to do, as data. */
import type { Cause } from "../types.js";

const NEXT: Record<Cause, string> = {
  "bad-arguments":
    "Read the method's contract (the docs_open tool, or help(\"<binding>\") in eval), correct the argument the error names, and call again.",
  "wrong-context":
    "Re-observe the context, branch or object the call targets, then call it where that object lives or after bringing the state it needs. Do not retry it unchanged.",
  "missing-authority":
    "Follow the error's remediation. Installed code that did not request the capability needs a narrow manifest request and review; a receiver or user refusal is final for this call. Do not retry it unchanged.",
  "needs-approval":
    "Let the call request the user's approval and wait for the decision; retry only after it resolves. Do not add preflights, retries or other transports to avoid the approval.",
  transient: "Re-observe the state and retry the same call once. If it fails the same way again, report it.",
  "platform-defect":
    "Do not work around it. Report the exact error and what you called (a problem report), and stop retrying.",
  unknown: "Read the error and the documentation below before calling again; do not retry it unchanged.",
};

export default function nextStep(cause: Cause): string {
  return NEXT[cause];
}
