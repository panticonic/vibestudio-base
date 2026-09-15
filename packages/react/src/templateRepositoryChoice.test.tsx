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
it("selects a repository with its real visibility and invalidates selection when accounts change", async () => {
  const publicationRepositories = vi
    .fn()
    .mockResolvedValue({
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
  const listAccounts = vi
    .fn()
    .mockResolvedValue([
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
      owner: "",
      name: "",
      private: true,
    });
    return (
      <Theme>
        <TemplateRepositoryChoice
          client={{ publicationRepositories } as unknown as TemplatesClient}
          value={value}
          onChange={(next) => {
            setValue(next);
            changed(next);
          }}
          listAccounts={listAccounts}
        />
      </Theme>
    );
  }
  render(<Harness />);
  await screen.findByRole("option", { name: "Alice" });
  fireEvent.change(screen.getByLabelText("GitHub account"), {
    target: { value: "account-1" },
  });
  fireEvent.change(screen.getByLabelText("Repository destination"), {
    target: { value: "existing" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Load writable repositories" }),
  );
  await screen.findByRole("option", { name: "team/template · Public" });
  expect(publicationRepositories).toHaveBeenCalledWith({
    credentialId: "account-1",
    page: 1,
  });
  fireEvent.change(screen.getByLabelText("Existing repository"), {
    target: { value: "team/template" },
  });
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      owner: "team",
      name: "template",
      private: false,
      credentialId: "account-1",
    }),
  );
  fireEvent.change(screen.getByLabelText("GitHub account"), {
    target: { value: "" },
  });
  await waitFor(() =>
    expect(
      screen.queryByRole("option", { name: "team/template · Public" }),
    ).toBeNull(),
  );
  expect(changed).toHaveBeenLastCalledWith({
    owner: "",
    name: "",
    private: true,
    credentialId: undefined,
  });
});
