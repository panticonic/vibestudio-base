import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "@vitest/browser/context";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import type { TemplatesClient } from "@vibestudio/service-schemas/templates";
import { TemplateAuthoring } from "./templateAuthoring";
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
it.each([390, 1280])(
  "shows a prefilled release without inherited clutter at %i pixels",
  async (width) => {
    await page.viewport(width, 1000);
    const parts = [
      { repoPath: "panels/personal", ownership: "authored" },
      ...Array.from({ length: 80 }, (_, i) => ({
        repoPath: `packages/inherited-${i}`,
        ownership: "inherited",
        inheritedFrom: "git+https://github.com/example/base.git",
      })),
    ];
    const client = {
      authoringSetup: vi.fn().mockResolvedValue({
        name: "Personal",
        description: "Your personal tools and browser workspace.",
        upstream: {
          url: "git+https://github.com/panticonic/vibestudio-personal.git",
          ref: "refs/heads/main",
          commit: "a".repeat(40),
        },
        dependencies: [
          { url: "git+https://github.com/panticonic/vibestudio-base.git" },
        ],
        parts,
      }),
      publicationVersion: vi
        .fn()
        .mockResolvedValue({ latest: "1.2.4", suggested: "1.2.5" }),
      inspectAuthoring: vi.fn().mockResolvedValue({
        request: {
          name: "Personal",
          description: "Your personal tools and browser workspace.",
          parts: ["panels/personal"],
        },
        mainEventId: "main-event",
        selectableParts: ["panels/personal"],
        requestedParts: ["panels/personal"],
        includedParts: ["meta", "panels/personal"],
        requiredParts: ["meta"],
        manifest: "template: {}",
        manifestDigest: `v1-sha256:${"a".repeat(64)}`,
        fingerprint: `v1-sha256:${"b".repeat(64)}`,
      }),
      reviewPublication: vi.fn().mockResolvedValue({
        remoteCommit: "a".repeat(40),
        changedFiles: [
          {
            path: "skills/onboarding/SKILL.md",
            kind: "changed",
            oldHash: "old",
            newHash: "new",
            binary: false,
            tooLarge: false,
            oldMode: 33188,
            newMode: 33188,
          },
          {
            path: "obsolete.txt",
            kind: "removed",
            oldHash: "deleted",
            binary: false,
            tooLarge: false,
            oldMode: 33188,
            newMode: null,
          },
        ],
      }),
    };
    const listAccounts = vi.fn().mockResolvedValue([
      {
        id: "github",
        label: "GitHub · alice",
        lifecycle: { state: "active" },
        bindings: [
          {
            use: "git-http",
            audience: [{ url: "https://github.com", match: "origin" }],
          },
        ],
      },
    ]);
    render(
      React.createElement(
        Theme,
        { appearance: "dark", accentColor: "violet" },
        <main style={{ maxWidth: 1040, margin: "0 auto", padding: 16 }}>
          <TemplateAuthoring
            fetchContent={async (hash) =>
              hash === "old" ? "Existing onboarding\n" : "Improved onboarding\n"
            }
            client={client as unknown as TemplatesClient}
            workspaceId="personal"
            listAccounts={listAccounts}
          />
        </main>,
      ),
    );
    await screen.findByText("1.2.5");
    const root = document.querySelector(".template-publication") as HTMLElement;
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
    for (const checkbox of screen.queryAllByRole("checkbox"))
      expect(checkbox.checkVisibility()).toBe(false);
    expect(
      screen
        .getByRole("radio", { name: "Publish to upstream" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Review release" }));
    });
    await screen.findByText("2 changed files");
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    await waitFor(() =>
      expect(root.textContent).toContain("Improved onboarding"),
    );
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);

    expect(client.inspectAuthoring).toHaveBeenCalledWith({
      name: "Personal",
      description: "Your personal tools and browser workspace.",
      parts: ["panels/personal"],
    });
  },
);
