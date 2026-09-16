// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Theme } from "@radix-ui/themes";
import type { TemplatesClient } from "@vibestudio/service-schemas/templates";
import { TemplateAuthoring } from "./templateAuthoring.js";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  });
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
it("reviews the complete selection and retries the same captured publication after reopening", async () => {
  const plan = {
    request: {
      name: "News",
      description: "Daily news",
      parts: ["panels/news"],
    },
    mainEventId: "event:one",
    selectableParts: ["panels/news"],
    requestedParts: ["panels/news"],
    includedParts: ["meta", "panels/news"],
    requiredParts: ["meta"],
    manifest: "template: {}",
    manifestDigest: `v1-sha256:${"a".repeat(64)}`,
    fingerprint: `v1-sha256:${"b".repeat(64)}`,
  };
  const client = {
    authoringSetup: vi.fn().mockResolvedValue({
      name: "News",
      description: "Daily news",
      upstream: null,
      dependencies: [],
      parts: [{ repoPath: "panels/news", ownership: "authored" }],
    }),
    inspectAuthoring: vi.fn().mockResolvedValue(plan),
    publishAuthoring: vi.fn().mockRejectedValue(new Error("Connection lost")),
  };
  const mount = () =>
    render(
      <Theme>
        <TemplateAuthoring
          client={client as unknown as TemplatesClient}
          workspaceId="ws:news"
        />
      </Theme>,
    );
  mount();
  await screen.findByRole("textbox", { name: "Template name" });
  for (const [name, value] of [
    ["Template name", "News"],
    ["Description", "Daily news"],
    ["GitHub owner", "alice"],
    ["Repository name", "news"],
  ])
    fireEvent.change(screen.getByRole("textbox", { name }), {
      target: { value },
    });
  fireEvent.click(screen.getByRole("button", { name: "Review release" }));
  await screen.findByRole("heading", { name: "Review complete release" });
  expect(client.inspectAuthoring).toHaveBeenCalledWith(plan.request);
  expect(client.publishAuthoring).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Publish template" }));
  await screen.findByRole("alert");
  const captured = client.publishAuthoring.mock.calls[0]![0];
  expect(captured.destination).toEqual({
    provider: "github",
    owner: "alice",
    name: "news",
  });
  cleanup();
  mount();
  await screen.findByRole("button", { name: "Publish template" });
  fireEvent.click(screen.getByRole("button", { name: "Publish template" }));
  await waitFor(() => expect(client.publishAuthoring).toHaveBeenCalledTimes(2));
  expect(client.publishAuthoring.mock.calls[1]![0]).toEqual(captured);
  expect(client.inspectAuthoring).toHaveBeenCalledTimes(1);
});

it("prefills upstream metadata and declared contents, and derives the version from remote tags", async () => {
  const setup = {
    name: "Personal",
    description: "Personal tools",
    upstream: {
      url: "git+https://github.com/team/personal.git",
      ref: "refs/heads/main",
      commit: "a".repeat(40),
    },
    dependencies: [{ url: "git+https://github.com/team/base.git" }],
    parts: [
      { repoPath: "panels/personal", ownership: "authored" },
      {
        repoPath: "panels/chat",
        ownership: "authored",
        inheritedFrom: "git+https://github.com/team/base.git",
      },
      {
        repoPath: "packages/runtime",
        ownership: "inherited",
        inheritedFrom: "git+https://github.com/team/base.git",
      },
      { repoPath: "projects/scratch", ownership: "unlisted" },
    ],
  };
  const client = {
    authoringSetup: vi.fn().mockResolvedValue(setup),
    publicationVersion: vi
      .fn()
      .mockResolvedValue({ latest: "1.4.2", suggested: "1.4.3" }),
    inspectAuthoring: vi
      .fn()
      .mockRejectedValue(new Error("Review needs approval")),
  };
  render(
    <Theme>
      <TemplateAuthoring
        client={client as unknown as TemplatesClient}
        workspaceId="personal"
      />
    </Theme>,
  );
  await screen.findByText("1.4.3");
  expect(
    (screen.getByRole("textbox", { name: "Template name" }) as HTMLInputElement)
      .value,
  ).toBe("Personal");
  expect(
    (screen.getByRole("textbox", { name: "Description" }) as HTMLInputElement)
      .value,
  ).toBe("Personal tools");
  expect(
    screen
      .getByRole("radio", { name: "Update upstream" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(
    screen
      .getByRole("checkbox", { name: /packages\/runtime/ })
      .closest("details")?.open,
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Review release" }));
  await screen.findByText("Review needs approval");
  expect(client.inspectAuthoring).toHaveBeenCalledWith({
    name: "Personal",
    description: "Personal tools",
    parts: ["panels/personal", "panels/chat"],
  });
});

it("ignores a late tag lookup after the publication destination changes", async () => {
  let finish!: (value: { latest: string; suggested: string }) => void;
  const client = {
    authoringSetup: vi.fn().mockResolvedValue({
      name: "Personal",
      description: "Tools",
      upstream: {
        url: "git+https://github.com/team/personal.git",
        ref: "refs/heads/main",
        commit: "a".repeat(40),
      },
      dependencies: [],
      parts: [],
    }),
    publicationVersion: vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  };
  render(
    <Theme>
      <TemplateAuthoring
        client={client as unknown as TemplatesClient}
        workspaceId="personal"
      />
    </Theme>,
  );
  await waitFor(() =>
    expect(client.publicationVersion).toHaveBeenCalledTimes(1),
  );
  fireEvent.click(screen.getByRole("radio", { name: "New repository" }));
  await screen.findByText("1.0.0");
  finish({ latest: "8.0.0", suggested: "8.0.1" });
  await waitFor(() =>
    expect(screen.getByText("First release of a new repository.")).toBeTruthy(),
  );
  expect(screen.queryByText("8.0.1")).toBeNull();
});
