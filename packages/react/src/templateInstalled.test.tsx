// @vitest-environment jsdom
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
import { TemplateInstalled } from "./templateInstalled.js";
const pin = {
  url: "https://example.test/base.git",
  ref: "refs/heads/main",
  commit: "a".repeat(40),
};
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
it("shows the selected source, resumes an update, and sends unit-relative file previews", async () => {
  const conflict = {
    deltaId: "delta:one",
    repoPath: "panels/example",
    coordinate: {
      coordinate: {
        kind: "file",
        id: "file:one",
        paths: { ours: "panels/example/index.tsx" },
      },
      summary: "Both versions changed this file",
    },
  };
  const review = {
    operationId: "update:one",
    status: "review",
    sourceUrl: pin.url,
    target: pin,
    repositories: [{ repoPath: "panels/example", kind: "changed" }],
    conflicts: [conflict],
  };
  const client = {
    installed: vi
      .fn()
      .mockResolvedValue([
        {
          pin,
          presentation: { name: "Base" },
          repositories: ["meta", "panels/example"],
          dependencies: [],
        },
      ]),
    prepareUpdate: vi.fn().mockResolvedValue(review),
    readUpdateFile: vi
      .fn()
      .mockResolvedValue({
        base: "previous",
        ours: "local",
        theirs: "incoming",
      }),
    resolveUpdate: vi.fn().mockResolvedValue({ ...review, conflicts: [] }),
    publishUpdate: vi
      .fn()
      .mockResolvedValue({ ...review, status: "published", conflicts: [] }),
  };
  const mount = () =>
    render(
      <Theme>
        <TemplateInstalled
          client={client as unknown as TemplatesClient}
          workspaceId="workspace:test"
        />
      </Theme>,
    );
  mount();
  await screen.findByRole("option", { name: "Base" });
  fireEvent.change(screen.getByRole("combobox", { name: "Template source" }), {
    target: { value: pin.url },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review latest update" }));
  await screen.findByRole("button", { name: "View versions" });
  expect(
    screen.getByRole("button", { name: "Apply reviewed update" }),
  ).toHaveProperty("disabled", true);
  const request = client.prepareUpdate.mock.calls[0]![0];
  cleanup();
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Resume update review" }),
  );
  await screen.findByRole("button", { name: "View versions" });
  expect(client.prepareUpdate.mock.calls[1]![0]).toEqual(request);
  fireEvent.click(screen.getByRole("button", { name: "View versions" }));
  await screen.findByText("previous");
  expect(client.readUpdateFile).toHaveBeenCalledWith({
    operationId: "update:one",
    repoPath: "panels/example",
    path: "index.tsx",
  });
  fireEvent.click(screen.getByRole("button", { name: "Keep local" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Apply reviewed update" }),
    ).toHaveProperty("disabled", false),
  );
  expect(client.publishUpdate).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Apply reviewed update" }),
  );
  await screen.findByRole("heading", { name: "Update applied" });
});
