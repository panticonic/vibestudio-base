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
import { TemplateAuthoring } from "./templateAuthoring.js";

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
    authoringParts: vi.fn().mockResolvedValue([{ repoPath: "panels/news" }]),
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
  await screen.findByRole("checkbox", { name: "panels/news" });
  for (const [name, value] of [
    ["Template name", "News"],
    ["Description", "Daily news"],
    ["GitHub owner", "alice"],
    ["Repository name", "news"],
    ["Version", "1.0.0"],
  ])
    fireEvent.change(screen.getByRole("textbox", { name }), {
      target: { value },
    });
  fireEvent.click(screen.getByRole("checkbox", { name: "panels/news" }));
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
