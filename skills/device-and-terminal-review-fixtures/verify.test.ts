import { expect, it } from "vitest";
import { verifyDeviceAndTerminalWorld } from "./verify.js";
import { deviceAndTerminalWorlds } from "./worlds.js";

function idsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(idsOf);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) =>
    key === "id" && typeof item === "string" ? [item] : idsOf(item),
  );
}

it("uses unique scenario IDs and covers the four evidence branches", () => {
  expect(new Set(deviceAndTerminalWorlds.map(({ id }) => id)).size).toBe(
    deviceAndTerminalWorlds.length,
  );
  expect(
    new Set(deviceAndTerminalWorlds.map(({ request }) => request.kind)),
  ).toEqual(new Set(["phone", "tendril", "terminal", "terminal-app"]));
});

it.each(deviceAndTerminalWorlds)(
  "$id accepts attributed reference and alias, and rejects a foreign receipt",
  (world) => {
    const observedIds = [...new Set(idsOf(world.request))];
    const expectedIds = world.expected.findings.flatMap(
      (finding) => finding.evidenceIds,
    );
    expect(expectedIds.length).toBeGreaterThan(0);
    expect(expectedIds.every((id) => observedIds.includes(id))).toBe(true);
    expect(verifyDeviceAndTerminalWorld(world, world.expected).passed).toBe(
      true,
    );
    const wrong = structuredClone(world.expected);
    wrong.findings[0]!.evidenceIds[0] = "unrelated-receipt";
    expect(verifyDeviceAndTerminalWorld(world, wrong).passed).toBe(false);
    const aliases = new Map(
      observedIds.map((id, index) => [id, `alias-${index}`]),
    );
    const alias = JSON.parse(
      JSON.stringify(world, (_key, value: unknown) =>
        typeof value === "string" ? (aliases.get(value) ?? value) : value,
      ),
    ) as typeof world;
    expect(verifyDeviceAndTerminalWorld(alias, alias.expected).passed).toBe(
      true,
    );
    expect(verifyDeviceAndTerminalWorld(alias, world.expected).passed).toBe(
      false,
    );
  },
);
