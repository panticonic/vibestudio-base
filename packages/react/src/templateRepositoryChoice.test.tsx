// @vitest-environment jsdom
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Theme } from "@radix-ui/themes";
import type { TemplatesClient } from "@vibestudio/service-schemas/templates";
import {
  TemplateRepositoryChoice,
  type TemplateRepositoryChoiceValue,
} from "./templateRepositoryChoice.js";
afterEach(cleanup);
it("prefills a single account without erasing upstream, and lets the user select another repository", async () => {
  const publicationRepositories = vi.fn().mockResolvedValue({
    owner: "alice",
    repositories: [
      {
        owner: "team",
        name: "template",
        private: false,
        webUrl: "https://github.com/team/template",
      },
    ],
    nextPage: null,
  });
  const listAccounts = vi.fn().mockResolvedValue([
    {
      id: "account-1",
      label: "Alice",
      lifecycle: { state: "active" },
      bindings: [
        {
          use: "git-http",
          audience: [{ url: "https://github.com", match: "origin" }],
        },
      ],
    },
  ]);
  const changed = vi.fn();
  function Harness() {
    const [value, setValue] = useState<TemplateRepositoryChoiceValue>({
      owner: "team",
      name: "personal",
      private: true,
      mode: "upstream",
    });
    return (
      <Theme>
        <TemplateRepositoryChoice
          upstream={{ owner: "team", name: "personal" }}
          client={{ publicationRepositories } as unknown as TemplatesClient}
          value={value}
          listAccounts={listAccounts}
          onChange={(next) => {
            setValue(next);
            changed(next);
          }}
        />
      </Theme>
    );
  }
  render(<Harness />);
  await screen.findByRole("radio", { name: "Alice" });
  await waitFor(() =>
    expect(changed).toHaveBeenLastCalledWith(
      expect.objectContaining({
        owner: "team",
        name: "personal",
        credentialId: "account-1",
        mode: "upstream",
      }),
    ),
  );
  fireEvent.click(screen.getByRole("radio", { name: "Existing repository" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Load writable repositories" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "team/template · Public" }),
  );
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      owner: "team",
      name: "template",
      private: false,
      credentialId: "account-1",
    }),
  );
  fireEvent.click(screen.getByRole("radio", { name: "Publish to upstream" }));
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      owner: "team",
      name: "personal",
      credentialId: "account-1",
    }),
  );
});
