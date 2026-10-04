import { expect, it } from "vitest";
import { nativeFailureDiagnostic } from "./native-failure-diagnostic.js";

it("retains both the original invocation and failed persistence causes in native reports", () => {
  const invocation = new Error("Result admission failed");
  const persistence = new Error("Storage commit failed", { cause: new Error("SQLITE_TOOBIG") });
  const failure = new AggregateError([invocation, persistence], "Invocation failure could not be committed");
  expect(nativeFailureDiagnostic(failure)).toEqual({ name: "AggregateError", message: failure.message,
    errors: [{ name: "Error", message: invocation.message }, { name: "Error", message: persistence.message,
      cause: { name: "Error", message: "SQLITE_TOOBIG" } }] });
  invocation.cause = failure;
  expect(() => JSON.stringify(nativeFailureDiagnostic(failure))).not.toThrow();
});
