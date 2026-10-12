import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { MethodDefinition } from "@workspace/pubsub";
import { ChatMethodRegistry, composeChatMethods } from "./methods.js";

const method = (name: string): MethodDefinition => ({
  description: name,
  parameters: z.object({}),
  execute: async () => name,
});

describe("ChatMethodRegistry", () => {
  it("composes providers in registration order and reads them per join", () => {
    const registry = new ChatMethodRegistry();
    let advertise = false;
    registry.register("a", () => ({ alpha: method("alpha") }));
    registry.register("b", () => (advertise ? { beta: method("beta") } : undefined));
    expect(Object.keys(registry.compose())).toEqual(["alpha"]);
    advertise = true;
    expect(Object.keys(registry.compose())).toEqual(["alpha", "beta"]);
  });

  it("replaces a provider by key and unregisters only the exact provider", () => {
    const registry = new ChatMethodRegistry();
    const offFirst = registry.register("a", () => ({ first: method("first") }));
    registry.register("a", () => ({ second: method("second") }));
    offFirst();
    expect(Object.keys(registry.compose())).toEqual(["second"]);
  });

  it("rejects a method claimed by two owners", () => {
    expect(() =>
      composeChatMethods({ dup: method("one") }, undefined, { dup: method("two") })
    ).toThrow('AgenticChat method "dup" has multiple owners');
  });
});
