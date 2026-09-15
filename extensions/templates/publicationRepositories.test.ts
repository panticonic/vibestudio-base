import { expect, it, vi } from "vitest";
import { activate } from "./index.js";
import { createGitHubClient } from "@workspace/integrations/github";
vi.mock("@workspace/integrations/github", () => ({
  createGitHubClient: vi.fn(),
}));
it("lists only writable active repositories and preserves pagination across filtered pages", async () => {
  const repo = {
    owner: { login: "alice" },
    name: "template",
    private: true,
    html_url: "https://github.com/alice/template",
    permissions: { push: true },
  };
  const listRepos = vi
    .fn()
    .mockResolvedValue([
      repo,
      { ...repo, name: "read-only", permissions: { push: false } },
      { ...repo, name: "archived", archived: true },
      ...Array.from({ length: 97 }, (_, index) => ({
        ...repo,
        name: `read-${index}`,
        permissions: undefined,
      })),
    ]);
  vi.mocked(createGitHubClient).mockReturnValue({
    getUser: vi.fn().mockResolvedValue({ login: "alice" }),
    listRepos,
  } as never);
  const credentials = {};
  const api = await activate({
    credentials,
    log: { info: vi.fn() },
    rpc: { call: vi.fn() },
  } as never);
  await expect(
    api.publicationRepositories({ credentialId: "account-1", page: 2 }),
  ).resolves.toEqual({
    owner: "alice",
    repositories: [
      {
        owner: "alice",
        name: "template",
        private: true,
        webUrl: repo.html_url,
      },
    ],
    nextPage: 3,
  });
  expect(createGitHubClient).toHaveBeenCalledWith(credentials, {
    credentialId: "account-1",
  });
  expect(listRepos).toHaveBeenCalledWith({
    per_page: 100,
    page: 2,
    sort: "full_name",
    direction: "asc",
  });
});
