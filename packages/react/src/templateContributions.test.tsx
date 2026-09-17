// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Theme } from "@radix-ui/themes";
import type { TemplatesClient } from "@vibestudio/service-schemas/templates";
import { TemplateContributions } from "./templateContributions";
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    clear: () => values.clear(),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("resumes a reviewed contribution without disturbing a pending incoming update", async () => {
  const pin = {
    url: "https://example.test/base.git",
    ref: "refs/heads/main",
    commit: "a".repeat(40),
  };
  const plan = {
    source: pin,
    parts: ["panels/example"],
    mainEventId: "event:one",
    fingerprint: `v1-sha256:${"b".repeat(64)}`,
  };
  const request = { commandId: "update:pending", sourceUrl: pin.url };
  localStorage.setItem(
    "template-maintenance:test",
    JSON.stringify({ request }),
  );
  const client = {
    inspectContribution: vi.fn().mockResolvedValue(plan),
    suggestContribution: vi
      .fn()
      .mockResolvedValue({ outcome: "pushed", branch: "contribution:one" }),
  };
  const mount = () =>
    render(
      <Theme>
        <TemplateContributions
          client={client as unknown as TemplatesClient}
          workspaceId="test"
          sources={[
            {
              pin,
              relationship: "direct",
              repositories: ["meta", "panels/example"],
              dependencies: [],
              presentation: { name: "Base" },
            },
          ]}
        />
      </Theme>,
    );
  mount();
  fireEvent.click(screen.getByRole("checkbox", { name: "panels/example" }));
  fireEvent.click(screen.getByRole("button", { name: "Review contribution" }));
  await screen.findByRole("button", { name: "Push contribution branch" });
  expect(client.suggestContribution).not.toHaveBeenCalled();
  const captured = JSON.parse(
    localStorage.getItem("template-maintenance:test")!,
  ).contribution;
  cleanup();
  mount();
  fireEvent.click(
    screen.getByRole("button", { name: "Push contribution branch" }),
  );
  await screen.findByText("Contribution available on branch contribution:one.");
  expect(client.suggestContribution).toHaveBeenCalledWith(captured);
  expect(
    JSON.parse(localStorage.getItem("template-maintenance:test")!).request,
  ).toEqual(request);
});
