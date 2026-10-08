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
    updateAssistant: vi.fn(async () => null),
    updateStatus: vi.fn().mockResolvedValue({
      workspaceEpoch: 0,
      workspaceAppVersion: "0.1.84",
      currentAppVersion: "0.1.84",
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
  await screen.findByText("App update required");
  fireEvent.click(
    screen.getByRole("button", { name: "Review Personal with an agent" }),
  );
  expect(onReviewWithAgent.mock.calls[0]?.[0]).toContain(target.commit);
  expect(onReviewWithAgent.mock.calls[0]?.[0]).toContain("pending:one");
  expect(client.prepareUpdate).not.toHaveBeenCalled();
  expect(client.publishUpdate).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Keep local" })).toBeNull();
});

it("shows the saved paused state and configures the same assistant instead of offering setup", async () => {
  const client = {
    updateStatus: vi.fn(async () => ({
      workspaceEpoch: 0,
      workspaceAppVersion: "0.1.84",
      currentAppVersion: "0.1.84",
      checks: [],
    })),
    updateAssistant: vi.fn(async () => ({
      state: "paused",
      charter: { trigger: { kind: "schedule", everyMs: 21600000 } },
    })),
  };
  const configure = vi.fn();
  render(
    <Theme>
      <TemplateUpdates
        client={client as unknown as TemplatesClient}
        workspaceId="paused"
        sources={[]}
        onRefresh={async () => {}}
        onReviewWithAgent={configure}
      />
    </Theme>,
  );
  await screen.findByText("Monitoring is paused");
  fireEvent.click(
    screen.getByRole("button", { name: "Configure with assistant" }),
  );
  expect(configure.mock.calls[0]?.[0]).toContain("same automation");
  expect(screen.queryByText("Set up update assistant")).toBeNull();
});

it("explains the retained runtime and launches an agent when a compatible target host is unavailable", async () => {
  const pin = {
    url: "https://example.test/personal.git",
    ref: "refs/heads/main",
    commit: "a".repeat(40),
  };
  const review = vi.fn();
  const client = {
    updateAssistant: vi.fn(async () => null),
    updateStatus: vi.fn(async () => ({
      workspaceEpoch: 0,
      workspaceAppVersion: "0.1.84",
      currentAppVersion: "2.0.0",
      checks: [
        {
          source: pin,
          target: { ...pin, commit: "b".repeat(40) },
          checkedAt: 1,
          status: "different-epoch",
          targetEpoch: 1,
          targetMinimumAppVersion: "1.2.0",
          hostError: "Retained host missing",
        },
      ],
    })),
  };
  render(
    <Theme>
      <TemplateUpdates
        client={client as unknown as TemplatesClient}
        workspaceId="retained"
        sources={[
          { pin, relationship: "direct", repositories: [], dependencies: [] },
        ]}
        onRefresh={async () => {}}
        onReviewWithAgent={review}
      />
    </Theme>,
  );
  await screen.findByText("Compatible host unavailable");
  expect(
    screen.getByText(/This workspace runs on retained Vibestudio/).textContent,
  ).toContain("0.1.84");
  expect(
    screen.getByText(/This workspace runs on retained Vibestudio/).textContent,
  ).toContain("2.0.0");
  expect(screen.queryByText("App update required")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Review update with an agent" }),
  );
  expect(review.mock.calls[0]?.[0]).toContain(
    "Workspace host: Vibestudio 0.1.84; surrounding app: Vibestudio 2.0.0",
  );
  expect(review.mock.calls[0]?.[0]).toContain("1.2.0");
});
