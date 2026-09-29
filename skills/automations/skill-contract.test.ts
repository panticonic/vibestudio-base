import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function docs(): string {
  return ["SKILL.md", "API.md"]
    .map((name) => readFileSync(new URL(name, import.meta.url), "utf8"))
    .join("\n");
}

describe("Automations skill contract", () => {
  it("teaches immediate launch and a durable inspector instead of a proposal flow", () => {
    const value = docs();
    expect(value).toContain("call `launch_automation` directly");
    expect(value).toContain(
      "continues with the current agent in that conversation by default",
    );
    expect(value).toContain("one hour or less");
    expect(value).toContain("ask whether they want the existing conversation");
    expect(value).toContain("creates an active automation immediately");
    expect(value).toContain("controller, not an approval gate");
    expect(value).not.toMatch(
      /reviewed closure|proposal transition|approve automation/iu,
    );
  });

  it("uses native owner-scoped control instead of eval discovery or redundant confirmation", () => {
    const value = docs();
    expect(value).toContain("`control_automation` directly");
    expect(value).toContain("mean reversible `pause`");
    expect(value).toContain("Do not discover the missions service");
    expect(value).toContain("not routed through eval or a redundant approval card");
  });

  it("keeps semantic operations separate from host-derived authority", () => {
    const value = docs();
    expect(value).toContain("launch-time acquisition plans");
    expect(value).toContain("never authors capability rows");
    expect(value).toContain("mission:<id>@<revisionDigest>");
    expect(value).toContain(
      "Channel IDs are routing facts, never authority subjects",
    );
    expect(value).toContain(
      "A continuing automation is an ordinary wake-up of this existing agent",
    );
    expect(value).not.toContain("MissionPermission");
    expect(value).not.toContain("toolExposure");
  });

  it("documents pre-acquisition with ordinary runtime approval fallback", () => {
    const value = docs();
    expect(value).toContain("durable acquisition");
    expect(value).toContain("ordinary acquisition");
    expect(value).toContain(
      "do not force automation eval into `pregranted-only`",
    );
    expect(value).toContain(
      "Pause and resume therefore\npreserve isolated mission grants",
    );
  });

  it("documents exact scheduling and resumable run phases", () => {
    const value = docs();
    expect(value).toContain('kind: "schedule"');
    expect(value).toContain('kind: "cron"');
    expect(value).toContain('timezone: "America/New_York"');
    expect(value).toContain('protocol: "automation-completion.v1"');
    expect(value).toContain('"executing"');
    expect(value).toContain(
      "The authority plan records launch-time acquisition intent;\nit does not allow or deny runtime calls.",
    );
    expect(value).toContain(
      "resumes existing nonterminal runs before admitting newly due runs",
    );
  });

  it("preserves the requested effect in future-turn prompt actions", () => {
    const value = docs();
    expect(value).toContain(
      "A prompt action is an instruction for the future agent turn, not a message payload",
    );
    expect(value).toContain(
      "a prompt containing only the notification's text merely asks the agent to say that text",
    );
  });
});
