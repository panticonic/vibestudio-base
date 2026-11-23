import { expect, it, vi } from "vitest";
import { bindAuthorityReview } from "./workflow.js";
const { preflight } = vi.hoisted(() => ({
  preflight: vi.fn(async (input: unknown) => ({
    decision: "open",
    leaves: [],
    input,
  })),
}));
vi.mock("@vibestudio/shared/typedRpcServiceClient", () => ({
  createTypedRpcServiceClient: () => ({ preflight }),
}));
vi.mock("@workspace/runtime", () => ({ rpc: {} }));
it("allows concurrent assigned authority observations in any order and repeats, without admitting foreign operations", async () => {
  const operations = [
    {
      id: "first",
      label: "First",
      service: "vcs",
      method: "status",
      args: [{ contextId: "owned" }],
    },
    {
      id: "second",
      label: "Second",
      service: "externalOpen",
      method: "openExternal",
      args: ["https://example.org/owned"],
    },
  ];
  const bound = bindAuthorityReview({
    goal: "Review both without dispatching either",
    operations,
    ceiling: [],
  });
  const read = bound.services.assignedAuthorityRead.preflight;
  const values = await Promise.all([
    read("second"),
    read("first"),
    read("second"),
  ]);
  expect(values.map((value) => value.operationId)).toEqual([
    "second",
    "first",
    "second",
  ]);
  expect(preflight.mock.calls.map(([input]) => input)).toEqual(
    [operations[1], operations[0], operations[1]].map(
      ({ service, method, args }) => ({ service, method, args }),
    ),
  );
  const count = preflight.mock.calls.length;
  await expect(read("foreign")).rejects.toThrow("assigned operation");
  expect(preflight).toHaveBeenCalledTimes(count);
});
