import { describe, expect, it } from "vitest";
import { quickfireRpcMethods } from "./service";

describe("quickfire client RPC contract", () => {
  it("retains the complete existing wire method names", () => {
    expect(
      Object.entries(quickfireRpcMethods).map(([key, method]) => [
        key,
        method.name,
      ]),
    ).toEqual([
      ["sessionFor", "sessionFor"],
      ["clear", "clear"],
      ["promote", "promote"],
      ["list", "list"],
      ["ask", "ask"],
    ]);
  });

  it("keeps the client descriptor table immutable", () => {
    expect(Object.isFrozen(quickfireRpcMethods)).toBe(true);
    expect(Object.values(quickfireRpcMethods).every(Object.isFrozen)).toBe(
      true,
    );
  });
});
