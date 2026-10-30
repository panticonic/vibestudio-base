import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { vcsErrorSchema } from "@vibestudio/service-schemas/vcs";
import { RECOVERABLE_CODES, typedRecovery } from "./typedRecovery.js";

const schemaCodes = vcsErrorSchema.options.map((option) => option.shape.code.value as string);

describe("typedRecovery", () => {
  it("covers every error code the VCS service returns", () => {
    expect(schemaCodes.filter((code) => !RECOVERABLE_CODES.includes(code as never))).toEqual([]);
  });

  it("agrees with the typed-recovery reference: every code is documented, and every documented code has an entry", () => {
    const reference = readFileSync(new URL("references/typed-recovery.md", import.meta.url), "utf8");
    const documented = new Set([...reference.matchAll(/^- `([A-Za-z]+)`/gmu)].map((match) => match[1]!));
    expect([...documented].filter((code) => !RECOVERABLE_CODES.includes(code as never))).toEqual([]);
    expect(RECOVERABLE_CODES.filter((code) => !reference.includes(`\`${code}\``))).toEqual([]);
  });

  it("reads the error's fields, not its message", () => {
    const step = typedRecovery({ code: "ScopeTooLarge", message: "ignored", scope: "compare page", maximum: 500 });
    expect(step).toMatchObject({ action: "page-or-narrow", stop: false, retry: "new-command-id" });
    expect(step.instruction).toContain("compare page");
    expect(step.instruction).toContain("500");
  });

  it("separates a conflicting revert from a conflicting merge", () => {
    const error = { code: "ConflictPresent", coordinates: [{}, {}] };
    expect(typedRecovery(error, { operation: "merge" }).action).toBe("resolve-conflicts");
    expect(typedRecovery(error, { operation: "revert" }).action).toBe("write-intended-result");
  });

  it("stops on authority and integrity failures", () => {
    expect(typedRecovery({ code: "Unauthorized" })).toMatchObject({ stop: true, retry: "none" });
    expect(typedRecovery({ code: "IntegrityFailure", handle: "h1" })).toMatchObject({ stop: true, retry: "none" });
  });

  it("allows an identical retry only for a pending host effect", () => {
    const retry = RECOVERABLE_CODES.filter(
      (code) => typedRecovery({ code }).retry === "same-command-id"
    );
    expect(retry).toEqual(["ExternalEffectFailed"]);
  });

  it("reports an unrecognized code instead of guessing", () => {
    expect(typedRecovery({ code: "Surprise" })).toMatchObject({ action: "report-unrecognized-code", stop: true });
  });
});
