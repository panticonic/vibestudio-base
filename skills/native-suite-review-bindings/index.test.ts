import { beforeEach, expect, it, vi } from "vitest";
import matchesSuiteReceipt from "../native-suite-review/reviewTestSuite/reviewResult/checkReceipt/matchesSuiteReceipt.js";
import { bindSuiteReview } from "./index.js";

const { call, verifyUnit, openPanel } = vi.hoisted(() => ({
  call: vi.fn(),
  verifyUnit: vi.fn(),
  openPanel: vi.fn(),
}));
vi.mock("@workspace/runtime", () => ({
  contextId: "context:suite",
  rpc: { call },
  openPanel,
}));
vi.mock("@workspace/harness/unit-verification", () => ({ verifyUnit }));

const seed = {
  goal: "Check the authored suite",
  target: "packages/test-runtime",
  suite: "native-contract",
  file: "src/example.test.ts",
  testName: null,
};
const state = {
  target: seed.target,
  suite: seed.suite,
  runtime: "native",
  stateHash: "original",
};
beforeEach(() => {
  vi.resetAllMocks();
  call.mockResolvedValue(state);
});

it("resolves a native declaration in inspect mode without invoking the verifier", async () => {
  const { request, services } = bindSuiteReview({ ...seed, mode: "inspect" });
  await expect(services.testSuitePlanRead.resolve("another")).rejects.toThrow(
    "assigned",
  );
  const plan = await services.testSuitePlanRead.resolve(request.operationId);
  expect(plan).toEqual({ ...state, contextId: "context:suite" });
  await expect(
    services.testSuiteVerificationRun.run(request.operationId, plan.stateHash),
  ).rejects.toThrow("caller-assigned");
  expect(verifyUnit).not.toHaveBeenCalled();
});

it("stops a name-preserving suite change before dispatch", async () => {
  const { request, services } = bindSuiteReview({ ...seed, mode: "verify" });
  const plan = await services.testSuitePlanRead.resolve(request.operationId);
  call.mockResolvedValueOnce({
    ...state,
    runtime: "workerd",
    stateHash: "new",
  });
  await expect(
    services.testSuiteVerificationRun.run(request.operationId, plan.stateHash),
  ).resolves.toMatchObject({
    current: false,
    status: "state-changed",
  });
  expect(verifyUnit).not.toHaveBeenCalled();
});

it("runs the exact filter once and preserves a current identity-checked receipt", async () => {
  verifyUnit.mockResolvedValue({
    operation: "test",
    status: "passed",
    report: { passed: 2, failed: 0, details: [] },
    receipt: {
      ...state,
      operation: "test",
      contextId: "context:suite",
      ref: "ctx:context:suite",
      reportDigest: "report",
      executionDigest: "execution",
      artifactKey: "artifact",
    },
  });
  const { request, services } = bindSuiteReview({ ...seed, mode: "verify" });
  const plan = await services.testSuitePlanRead.resolve(request.operationId);
  await expect(
    services.testSuiteVerificationRun.run(request.operationId, plan.stateHash),
  ).resolves.toMatchObject({
    current: true,
    status: "passed",
    passed: 2,
    receipt: { ...state, operation: "test", contextId: "context:suite", ref: "ctx:context:suite" },
    reportDigest: "report",
    executionDigest: "execution",
  });
  expect(verifyUnit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ contextId: "context:suite" }),
    {
      operation: "test",
      target: seed.target,
      suite: seed.suite,
      file: seed.file,
    },
  );
  await expect(
    services.testSuiteVerificationRun.run(request.operationId, plan.stateHash),
  ).rejects.toThrow("once");
});

it("matches a verification receipt only to its own declared execution plan", () => {
  const plan = { ...state, runtime: "native" as const, contextId: "context:suite" };
  const receipt = { ...plan, operation: "test" as const, ref: "ctx:context:suite" };
  expect(matchesSuiteReceipt(plan, receipt)).toBe(true);
  expect(matchesSuiteReceipt(plan, null)).toBe(false);
  for (const change of [
    { operation: "build" as const },
    { runtime: "workerd" as const },
    { suite: "other-suite" },
    { target: "packages/other" },
    { contextId: "context:other" },
    { ref: "ctx:context:other" },
    { stateHash: "superseded" },
  ]) {
    expect(matchesSuiteReceipt(plan, { ...receipt, ...change })).toBe(false);
  }
});
