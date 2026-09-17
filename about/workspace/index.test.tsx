// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({ installed: vi.fn(), getInfo: vi.fn() }));
vi.mock("@workspace/runtime", () => ({
  buildPanelLink: (path: string) => path,
  extensions: { invoke: vi.fn() },
  rpc: { call: vi.fn() },
  workspace: { getInfo: mocks.getInfo },
}));
vi.mock("@workspace/template-management", () => ({
  createTemplateManagementClient: () => ({ installed: mocks.installed }),
}));
vi.mock("@workspace/react/templates", () => ({
  TemplateBrowser: () => <div>Template discovery</div>,
  TemplateUpdates: () => <div>Incoming updates</div>,
  TemplateAuthoring: () => <div>Outgoing publication</div>,
  TemplateContributions: () => <div>Dependency contributions</div>,
}));
vi.mock("@workspace/about-shared/ui", () => ({
  AboutThemeRoot: ({ children }: { children: ReactNode }) => <>{children}</>,
  AboutPage: ({
    children,
    title,
    actions,
  }: {
    children: ReactNode;
    title: string;
    actions?: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      {actions}
      {children}
    </main>
  ),
}));
import WorkspacePage from "./index";
import WorkspacesPage from "../templates/index";
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("keeps discovery and creation separate from current workspace actions", () => {
  render(<WorkspacesPage />);
  expect(screen.getByText("Template discovery")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Add workspace" })).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Manage this workspace" })
      .getAttribute("href"),
  ).toBe("about/workspace");
  expect(screen.queryByRole("tab", { name: /Publish/ })).toBeNull();
  expect(mocks.getInfo).not.toHaveBeenCalled();
  expect(mocks.installed).not.toHaveBeenCalled();
});
it("keeps publishing reachable when recorded sources cannot be loaded", async () => {
  mocks.getInfo.mockResolvedValue({
    id: "personal-authoring",
    name: "Personal authoring",
  });
  mocks.installed.mockRejectedValue(
    new Error("Source temporarily unavailable"),
  );
  render(<WorkspacePage />);
  await screen.findByRole("heading", { name: "Personal authoring" });
  await screen.findByText("Error: Source temporarily unavailable");
  fireEvent.mouseDown(screen.getByRole("tab", { name: /Publish/ }), {
    button: 0,
    ctrlKey: false,
  });
  await screen.findByText("Outgoing publication");
  expect(screen.queryByText("Template discovery")).toBeNull();
});
it("opens on updates for the current workspace and distinguishes its authoring upstream", async () => {
  mocks.getInfo.mockResolvedValue({
    id: "personal-authoring",
    name: "Personal authoring",
  });
  mocks.installed.mockResolvedValue([
    {
      relationship: "upstream",
      presentation: { name: "Personal" },
      pin: { url: "https://github.com/example/personal.git" },
    },
  ]);
  render(<WorkspacePage />);
  await screen.findByText("Authoring Personal");
  expect(screen.getByText("Incoming updates")).toBeTruthy();
  expect(
    screen.getByRole("tab", { name: /Updates/ }).getAttribute("aria-selected"),
  ).toBe("true");
});
