import { afterEach, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@workspace/runtime", () => ({
  contextId: "owned",
  extensions: { invoke },
}));
import { bindTerminalChecks } from "./workflow.js";

const limits = { timeoutMs: 5_000, maxOutputBytes: 1_024 };
const literal = {
  id: "first",
  purpose: "Capture the literal argument",
  prerequisites: [],
  intent: {
    kind: "argv" as const,
    executable: "/usr/bin/printf",
    args: ["%s", "one ; two"],
  },
  ...limits,
};
const dependent = {
  id: "dependent",
  purpose: "Inspect the result after the first check",
  prerequisites: ["first"],
  intent: { kind: "script" as const, script: "printf 'ok' | wc -c" },
  ...limits,
};
const clean = { exitCode: 0, stdout: "one ; two", stderr: "", durationMs: 10 };
afterEach(() => invoke.mockReset());

it("runs only the exact assigned arguments and gates dependents on actual complete output", async () => {
  const copy = structuredClone(literal);
  const { request, services } = bindTerminalChecks({
    goal: "Check boundaries",
    checks: [copy, dependent],
  });
  copy.intent.args[1] = "unassigned";
  await expect(
    services.terminalCheckRun.execute("foreign", "first"),
  ).rejects.toThrow(/assigned check/);
  const plan = await services.terminalCheckRead.observe(request.operationId);
  expect(plan.checks[0]).toEqual({
    id: "first",
    purpose: literal.purpose,
    prerequisites: [],
    mode: "argv",
  });
  await expect(
    services.terminalCheckRun.execute(plan.receipt, "dependent"),
  ).rejects.toThrow(/prerequisites/);
  invoke
    .mockResolvedValueOnce(clean)
    .mockResolvedValueOnce({ ...clean, stdout: "2\n" });
  await expect(
    services.terminalCheckRun.execute(plan.receipt, "first"),
  ).resolves.toMatchObject({
    status: "complete",
    stdout: "one ; two",
  });
  await expect(
    services.terminalCheckRun.execute(plan.receipt, "first"),
  ).rejects.toThrow(/unattempted/);
  await expect(
    services.terminalCheckRun.execute(plan.receipt, "dependent"),
  ).resolves.toMatchObject({
    status: "complete",
    stdout: "2\n",
  });
  expect(invoke).toHaveBeenNthCalledWith(1, "shell", "exec", [
    {
      intent: literal.intent,
      contextId: "owned",
      ...limits,
    },
  ]);
  expect(invoke).toHaveBeenNthCalledWith(2, "shell", "exec", [
    {
      intent: dependent.intent,
      contextId: "owned",
      ...limits,
    },
  ]);
});

it("holds dependent work after truncation and continues independent observations", async () => {
  const independent = { ...literal, id: "independent" };
  const { request, services } = bindTerminalChecks({
    goal: "Check outcomes",
    checks: [literal, dependent, independent],
  });
  const plan = await services.terminalCheckRead.observe(request.operationId);
  invoke
    .mockResolvedValueOnce({ ...clean, truncated: true })
    .mockRejectedValueOnce(new Error("native unavailable"));
  await expect(
    services.terminalCheckRun.execute(plan.receipt, "first"),
  ).resolves.toMatchObject({
    status: "complete",
    truncated: true,
  });
  await expect(
    services.terminalCheckRun.execute(plan.receipt, "dependent"),
  ).rejects.toThrow(/prerequisites/);
  await expect(
    services.terminalCheckRun.execute(plan.receipt, "independent"),
  ).resolves.toMatchObject({
    status: "unavailable",
    exitCode: null,
  });
  expect(invoke).toHaveBeenCalledTimes(2);
});

it("rejects a cyclic or unresolved plan before any native calls", () => {
  expect(() =>
    bindTerminalChecks({
      goal: "Invalid dependency",
      checks: [dependent, literal],
    }),
  ).toThrow(/earlier prerequisites/);
  expect(invoke).not.toHaveBeenCalled();
});
