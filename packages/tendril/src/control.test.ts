// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { mountTendrilControl } from "./control.js";
import type { AgentStatus, Tendril } from "./page.js";

function fakeTendril() {
  let status: AgentStatus = { state: "idle", withheld: 0 };
  const listeners = new Set<(s: AgentStatus) => void>();
  const calls: { name: string; args: unknown }[] = [];
  const instructions: { text: string; via: string }[] = [];
  const tendril = {
    agent: {
      status: () => status,
      on(fn: (s: AgentStatus) => void) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
    functions: () => [{ name: "stop", description: "Stop", phrases: ["stop the timer", "stop"] }],
    async call(name: string, args: unknown) {
      calls.push({ name, args });
    },
    async instruct(text: string, via: string) {
      instructions.push({ text, via });
    },
  } as unknown as Tendril;
  return {
    tendril,
    calls,
    instructions,
    set(next: AgentStatus) {
      status = next;
      for (const fn of listeners) fn(next);
    },
  };
}

describe("mountTendrilControl", () => {
  it("shows the agent's state and what was held back", () => {
    const f = fakeTendril();
    const control = mountTendrilControl(f.tendril);
    const root = document.querySelector("[data-tendril-control]")!.shadowRoot!;
    expect(root.querySelector(".status")!.textContent).toBe("Agent is idle");
    f.set({ state: "working", withheld: 2 });
    expect(root.querySelector(".status")!.textContent).toBe("Agent is working…");
    const note = root.querySelector(".note") as HTMLElement;
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain("2 updates from this page");
    control.remove();
    expect(document.querySelector("[data-tendril-control]")).toBeNull();
  });

  it("runs a matching page function locally and sends anything else to the agent", async () => {
    const f = fakeTendril();
    const control = mountTendrilControl(f.tendril);
    expect(await control.submit("please stop the timer")).toBe("function");
    expect(f.calls.map((c) => c.name)).toEqual(["stop"]);
    expect(await control.submit("make the map bigger", "voice")).toBe("agent");
    expect(f.instructions).toEqual([{ text: "make the map bigger", via: "voice" }]);
    control.remove();
  });
});
