import { describe, expect, it } from "vitest";
import { presentActor } from "./actor.js";

describe("presentActor", () => {
  it("names the local person You under any of their identities", () => {
    expect(presentActor({ kind: "panel", id: "panel:nav-term-1" }, ["terminal-chat-1", "panel:nav-term-1"])).toBe("You");
    expect(presentActor({ kind: "user", id: "x", participantId: "p-1" }, [null, "p-1"])).toBe("You");
  });

  it("prefers the display name, then describes the role, never a raw id", () => {
    expect(presentActor({ kind: "agent", id: "do:a:B:c", displayName: " Codex " }, [])).toBe("Codex");
    expect(presentActor({ kind: "agent", id: "do:a:B:c" }, [])).toBe("An agent");
    expect(presentActor({ kind: "system", id: "channel" }, [])).toBe("The system");
    expect(presentActor({ kind: "panel", id: "panel:other" }, ["me"])).toBe("Someone");
  });
});
