import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "@vitest/browser/context";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import type { TemplatesClient } from "@vibestudio/service-schemas/templates";
import { TemplateUpdates } from "./templateUpdates";

afterEach(() => {
  cleanup();
  localStorage.clear();
});
it.each([390, 1280])(
  "makes the recorded upstream actionable at %i pixels",
  async (width) => {
    await page.viewport(width, 1000);
    const pin = {
      url: "git+https://github.com/panticonic/vibestudio-personal.git",
      ref: "refs/heads/main",
      commit: "a".repeat(40),
    };
    const sources = [
      {
        pin: {
          ...pin,
          url: "git+https://github.com/panticonic/vibestudio-base.git",
        },
        relationship: "transitive" as const,
        presentation: { name: "Base" },
        repositories: [],
        dependencies: [],
      },
      {
        pin,
        relationship: "upstream" as const,
        presentation: {
          name: "Personal",
          description: "Your personal tools and browser workspace.",
        },
        repositories: [],
        dependencies: [],
      },
    ];
    const client = {
      updateStatus: vi
        .fn()
        .mockResolvedValue({ workspaceEpoch: 0, checks: [] }),
      prepareUpdate: vi.fn(),
    };
    const onReviewWithAgent = vi.fn();
    render(
      React.createElement(
        Theme,
        { appearance: "dark", accentColor: "violet" },
        <main style={{ maxWidth: 1040, margin: "0 auto", padding: 16 }}>
          <TemplateUpdates
            client={client as unknown as TemplatesClient}
            workspaceId="personal"
            sources={sources}
            onRefresh={async () => {}}
            onReviewWithAgent={onReviewWithAgent}
          />
        </main>,
      ),
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    const root = document.querySelector(
      ".workspace-maintenance",
    ) as HTMLElement;
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
    expect(
      screen
        .getByRole("button", { name: "Review Base with an agent" })
        .checkVisibility(),
    ).toBe(false);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Review Personal with an agent" }),
      ),
    );
    expect(client.prepareUpdate).not.toHaveBeenCalled();
    expect(onReviewWithAgent.mock.calls[0]?.[0]).toContain(pin.url);
  },
);
