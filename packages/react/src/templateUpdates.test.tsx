// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Theme } from "@radix-ui/themes";
import type { TemplatesClient } from "@vibestudio/service-schemas/templates";
import { TemplateUpdates } from "./templateUpdates";
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
it("launches an agent with the exact target and resumed operation, without merging in the UI", async () => {
  const pin = {
    url: "https://example.test/personal.git",
    ref: "refs/heads/main",
    commit: "a".repeat(40),
  };
  const target = { ...pin, commit: "b".repeat(40) };
  localStorage.setItem(
    "template-maintenance:test",
    JSON.stringify({
      request: { commandId: "pending:one", sourceUrl: pin.url },
    }),
  );
  const client = {
    updateStatus: vi
      .fn()
      .mockResolvedValue({
        workspaceEpoch: 0,
        checks: [
          {
            source: pin,
            target,
            targetEpoch: 1,
            checkedAt: 100,
            status: "different-epoch",
          },
        ],
      }),
    prepareUpdate: vi.fn(),
    publishUpdate: vi.fn(),
  };
  const onReviewWithAgent = vi.fn();
  render(
    <Theme>
      <TemplateUpdates
        client={client as unknown as TemplatesClient}
        workspaceId="test"
        sources={[
          {
            pin,
            relationship: "upstream",
            presentation: { name: "Personal" },
            repositories: [],
            dependencies: [],
          },
        ]}
        onRefresh={async () => {}}
        onReviewWithAgent={onReviewWithAgent}
      />
    </Theme>,
  );
  await screen.findByText("Host compatibility review needed");
  fireEvent.click(
    screen.getByRole("button", { name: "Review Personal with an agent" }),
  );
  expect(onReviewWithAgent.mock.calls[0]?.[0]).toContain(target.commit);
  expect(onReviewWithAgent.mock.calls[0]?.[0]).toContain("pending:one");
  expect(client.prepareUpdate).not.toHaveBeenCalled();
  expect(client.publishUpdate).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Keep local" })).toBeNull();
});
