import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  act,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "@vitest/browser/context";
import { Dialog, Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import { TemplateBrowser } from "./templates";

const pin = {
  url: "git+https://github.com/example/garden.git",
  ref: "refs/heads/main",
  commit: "a".repeat(40),
};
const inspection = {
  pin,
  presentation: { name: "Garden", description: "A place for your next idea." },
  repositories: ["panels/garden"],
  dependencies: [{ url: "git+https://github.com/example/base.git" }],
};
afterEach(cleanup);

it.each([320, 390, 1280])(
  "keeps catalog and review usable at %i pixels",
  async (width) => {
    await page.viewport(width, 900);
    const onCreate = vi.fn(async () => {});
    render(
      React.createElement(
        Theme,
        { appearance: "dark", accentColor: "violet" },
        <Dialog.Root open>
          <Dialog.Content
            className="workspace-creation-dialog"
            style={{ maxWidth: 920 }}
          >
            <Dialog.Title>Create a workspace</Dialog.Title>
            <Dialog.Description>
              A home for your projects, panels and conversations.
            </Dialog.Description>
            <TemplateBrowser
              onCreate={onCreate}
              onCreateFresh={vi.fn()}
              onChooseFolder={vi.fn()}
              client={{
                inspect: async () => inspection,
                registry: async () => ({
                  version: 1,
                  templates: [
                    {
                      id: "garden",
                      role: "catalog",
                      name: "Garden",
                      description: "A place for your next idea.",
                      url: pin.url,
                    },
                    {
                      id: "system",
                      role: "system",
                      name: "System",
                      description: "Tools and connections for your workspaces.",
                      url: "git+https://github.com/example/system.git",
                    },
                  ],
                }),
              }}
            />
          </Dialog.Content>
        </Dialog.Root>,
      ),
    );
    await screen.findByRole("button", { name: "Review Garden" });
    const root = document.querySelector(".workspace-setup") as HTMLElement;
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
    const cards = [
      ...document.querySelectorAll(".workspace-template-card"),
    ].map((card) => card.getBoundingClientRect());
    expect(cards[0]!.top === cards[1]!.top).toBe(width > 560);
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Review Garden" })
          .getBoundingClientRect().height,
      ).toBeGreaterThanOrEqual(44),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review Garden" }));
    const create = await screen.findByRole("button", {
      name: "Create workspace",
    });
    expect(
      screen
        .getByRole("radio", { name: /Use as a dependency/ })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(create.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight,
    );
    const review = document.querySelector(".workspace-setup") as HTMLElement;
    expect(review.scrollWidth).toBeLessThanOrEqual(review.clientWidth + 1);
    fireEvent.click(
      screen.getByRole("radio", { name: /Edit the template itself/ }),
    );
    await act(async () => {
      fireEvent.click(create);
    });
    expect(onCreate).toHaveBeenCalledWith("garden", pin, "author");
  },
);
