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
    reviewPublication: vi
      .fn()
      .mockResolvedValue({ remoteCommit: null, changedFiles: [] }),
    publishAuthoring: vi.fn().mockRejectedValue(new Error("Connection lost")),
  };
  const mount = () =>
    render(
      <Theme>
        <TemplateAuthoring
          fetchContent={async () => ""}
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
        fetchContent={async () => ""}
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
      .getByRole("radio", { name: "Publish to upstream" })
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
        fetchContent={async () => ""}
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

it("explains missing credentials and lets the user connect and refresh without losing the destination", async () => {
  const client = {
    authoringSetup: vi.fn().mockResolvedValue({
      name: "Personal",
      description: "Tools",
      dependencies: [],
      parts: [{ repoPath: "panels/news", ownership: "authored" }],
      upstream: { url: "git+https://github.com/acme/personal.git" },
    }),
    publicationVersion: vi
      .fn()
      .mockResolvedValue({ latest: "1.0.0", suggested: "1.0.1" }),
  };
  const listAccounts = vi.fn().mockResolvedValue([]);
  const connect = vi.fn().mockResolvedValue(undefined);
  render(
    <Theme>
      <TemplateAuthoring
        client={client as unknown as TemplatesClient}
        workspaceId="missing-account"
        listAccounts={listAccounts}
        onConnectGitHub={connect}
        fetchContent={async () => ""}
      />
    </Theme>,
  );
  await screen.findByText("Connect a GitHub account");
  expect(
    screen
      .getByRole("button", { name: "Review release" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(client.publicationVersion).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Connect GitHub" }));
  await waitFor(() => expect(connect).toHaveBeenCalledOnce());
  listAccounts.mockResolvedValue([
    {
      id: "github",
      label: "GitHub",
      lifecycle: { state: "active" },
      bindings: [
        { use: "git-http", audience: [{ url: "https://github.com" }] },
      ],
    },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Refresh accounts" }));
  await screen.findByText("1.0.1");
  expect(client.publicationVersion).toHaveBeenCalledWith({
    owner: "acme",
    name: "personal",
    credentialId: "github",
  });
});

it("checks remote access before offering Publish and preserves the selection on failure", async () => {
  const client = {
    authoringSetup: vi
      .fn()
      .mockResolvedValue({
        name: "Personal",
        description: "Tools",
        dependencies: [],
        upstream: null,
        parts: [{ repoPath: "panels/news", ownership: "authored" }],
      }),
    inspectAuthoring: vi
      .fn()
      .mockResolvedValue({
        request: {
          name: "Personal",
          description: "Tools",
          parts: ["panels/news"],
        },
        fingerprint: `v1-sha256:${"a".repeat(64)}`,
      }),
    reviewPublication: vi
      .fn()
      .mockRejectedValue(
        new Error("GitHub account is missing contents:write permission"),
      ),
    publishAuthoring: vi.fn(),
  };
  const connect = vi.fn().mockResolvedValue(undefined);
  render(
    <Theme>
      <TemplateAuthoring
        client={client as unknown as TemplatesClient}
        workspaceId="review-access"
        onConnectGitHub={connect}
        fetchContent={async () => ""}
      />
    </Theme>,
  );
  await screen.findByRole("textbox", { name: "GitHub owner" });
  fireEvent.change(screen.getByRole("textbox", { name: "GitHub owner" }), {
    target: { value: "acme" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Repository name" }), {
    target: { value: "personal" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review release" }));
  await screen.findByRole("alert");
  expect(client.reviewPublication).toHaveBeenCalledOnce();
  expect(client.publishAuthoring).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Publish template" })).toBeNull();
  expect(
    (
      screen.getByRole("textbox", {
        name: "Repository name",
      }) as HTMLInputElement
    ).value,
  ).toBe("personal");
  fireEvent.click(
    screen.getByRole("button", { name: "Connect or repair GitHub access" }),
  );
  expect(connect).toHaveBeenCalledOnce();
});
