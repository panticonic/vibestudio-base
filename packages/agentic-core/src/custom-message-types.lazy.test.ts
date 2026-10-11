import { expect, it, vi } from "vitest";
import { compileMessageTypeModule, foldCustomMessageState, validateCustomState } from "./custom-message-types.js";

const compiler = vi.hoisted(() => ({ loaded: 0, failure: new Error("renderer compiler unavailable") }));
vi.mock("@workspace/eval", () => {
  compiler.loaded += 1;
  return { compileModule: async () => { throw compiler.failure; } };
});

it("folds and validates cards without loading the renderer compiler, and propagates compiler failure", async () => {
  expect(compiler.loaded).toBe(0);
  expect(foldCustomMessageState("initial", [{ update: "next", seq: 1 }])).toBe("next");
  expect(validateCustomState({ type: "object" }, {})).toBeNull();
  expect(compiler.loaded).toBe(0);
  await expect(compileMessageTypeModule("export default {};")).rejects.toBe(compiler.failure);
  expect(compiler.loaded).toBe(1);
});
