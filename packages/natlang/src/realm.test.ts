import { describe, expect, it } from "vitest";
import { confinedRealm } from "./realm.js";
import { testNewFunction } from "./testSupport.js";

describe("confinedRealm", () => {
  const realm = () => confinedRealm(testNewFunction());

  it("runs a strict function body over its parameters", () => {
    expect(realm().call("return a + b;", ["a", "b"], [2, 3])).toBe(5);
  });

  it("gives code the allowlisted intrinsics and no fetch, process or host object", () => {
    const seen = realm().call(
      "return [typeof JSON.parse, typeof fetch, typeof process, typeof require, typeof globalThis.fetch];",
      [],
      []
    );
    expect(seen).toEqual(["function", "undefined", "undefined", "undefined", "undefined"]);
  });

  it("denies the constructor-chain route back to a compiler", () => {
    const attempts = realm().call(
      `const results = [];
       for (const reach of [
         () => ({}).constructor.constructor("return globalThis")(),
         () => (async () => {}).constructor("return 1")(),
         () => eval("1"),
       ]) {
         try { reach(); results.push("reached"); } catch (error) { results.push("denied"); }
       }
       return results;`,
      [],
      []
    );
    expect(attempts).toEqual(["denied", "denied", "denied"]);
  });

  it("gives every call its own global: nothing a call writes to globalThis outlives it", () => {
    const confined = realm();
    confined.call("globalThis.leak = 42; return globalThis.leak;", [], []);
    expect(confined.call("return typeof globalThis.leak;", [], [])).toBe("undefined");
  });

  it("cannot reach a binding that was not passed as a parameter", () => {
    expect(realm().call("return typeof secret;", ["visible"], [1])).toBe("undefined");
  });
});
