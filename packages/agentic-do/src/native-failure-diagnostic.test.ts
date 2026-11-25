import { expect, it } from "vitest";
import { nativeFailureDiagnostic } from "./native-failure-diagnostic.js";

it("retains both the original invocation and failed persistence causes in native reports", () => {
  const invocation = new Error("Result admission failed");
  const persistence = new Error("Storage commit failed", {
    cause: new Error("SQLITE_TOOBIG"),
  });
  const failure = new AggregateError(
    [invocation, persistence],
    "Invocation failure could not be committed",
  );
  expect(nativeFailureDiagnostic(failure)).toEqual({
    name: "AggregateError",
    errors: [{ name: "Error" }, { name: "Error", cause: { name: "Error" } }],
  });
  expect(JSON.stringify(nativeFailureDiagnostic(failure))).not.toContain(
    "Storage commit failed",
  );
  invocation.cause = failure;
  expect(() => JSON.stringify(nativeFailureDiagnostic(failure))).not.toThrow();
});
