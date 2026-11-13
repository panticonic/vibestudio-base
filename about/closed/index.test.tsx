// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  closed: vi.fn(),
  reopen: vi.fn(),
  deleteClosed: vi.fn(),
  focus: vi.fn(),
  onFocus: vi.fn(),
}));

vi.mock("@workspace/runtime", () => ({
  panel: { onFocus: mocks.onFocus },
  panelTree: {
    closed: mocks.closed,
    reopen: mocks.reopen,
    deleteClosed: mocks.deleteClosed,
  },
}));
vi.mock("@workspace/about-shared/ui", () => ({
  AboutThemeRoot: ({ children }: { children: ReactNode }) => (
    <Theme>{children}</Theme>
  ),
  AboutPage: ({ children, title }: { children: ReactNode; title: string }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
  Section: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));

import AboutPanelRoot from "./index";

function closedPanel(slotId: string, title: string, closedCount = 1) {
  return {
    slotId,
    parentSlotId: null,
    closedAt: Date.now() - 5 * 60_000,
    closedCount,
    entityId: `entity-${slotId}`,
    source: `panels/${slotId}`,
    title,
  };
}

const page = (
  items: ReturnType<typeof closedPanel>[],
  nextCursor: string | null = null,
) => ({ items, nextCursor });

const row = (title: string) =>
  screen.getByText(title).closest("li") as HTMLElement;

beforeEach(() => {
  mocks.onFocus.mockReturnValue(() => {});
  mocks.focus.mockResolvedValue(undefined);
  mocks.reopen.mockResolvedValue({ focus: mocks.focus });
  mocks.deleteClosed.mockResolvedValue({ deletedCount: 1 });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("lists closes most recent first with their source, age, and sub-panels", async () => {
  mocks.closed.mockResolvedValue(
    page([closedPanel("mail", "Mail", 3), closedPanel("notes", "Notes")]),
  );
  render(<AboutPanelRoot />);
  await screen.findByText("Mail");
  expect(mocks.closed).toHaveBeenCalledWith({ limit: 20 });
  const items = within(screen.getByRole("list", { name: "Closed panels" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);
  expect(items[0]).toContain("Mail");
  expect(items[1]).toContain("Notes");
  expect(within(row("Mail")).getByText("panels/mail")).toBeTruthy();
  expect(row("Mail").textContent).toContain("closed 5m ago");
  expect(row("Mail").textContent).toContain("+2 sub-panels");
  expect(row("Notes").textContent).not.toContain("sub-panel");
});

it("says when nothing is closed, and when a search matches nothing", async () => {
  mocks.closed.mockResolvedValue(page([]));
  render(<AboutPanelRoot />);
  await screen.findByText("Nothing closed recently");
  fireEvent.change(screen.getByRole("searchbox", { name: "Search closed panels" }), {
    target: { value: "  inbox " },
  });
  await screen.findByText("No matches");
  expect(mocks.closed).toHaveBeenLastCalledWith({ limit: 20, query: "inbox" });
});

it("keeps only the newest search's results", async () => {
  let resolveStale: (value: ReturnType<typeof page>) => void = () => {};
  mocks.closed
    .mockResolvedValueOnce(page([closedPanel("mail", "Mail")]))
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStale = resolve;
      }),
    )
    .mockResolvedValueOnce(page([closedPanel("notes", "Notes")]));
  render(<AboutPanelRoot />);
  await screen.findByText("Mail");
  const search = screen.getByRole("searchbox", { name: "Search closed panels" });
  fireEvent.change(search, { target: { value: "m" } });
  fireEvent.change(search, { target: { value: "no" } });
  await screen.findByText("Notes");
  await act(async () => resolveStale(page([closedPanel("stale", "Stale")])));
  expect(screen.queryByText("Stale")).toBeNull();
});

it("appends the next page when asked", async () => {
  mocks.closed
    .mockResolvedValueOnce(page([closedPanel("mail", "Mail")], "cursor-1"))
    .mockResolvedValueOnce(page([closedPanel("notes", "Notes")]));
  render(<AboutPanelRoot />);
  await screen.findByText("Mail");
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByText("Notes");
  expect(mocks.closed).toHaveBeenLastCalledWith({
    limit: 20,
    cursor: "cursor-1",
  });
  expect(screen.getByText("Mail")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});

it("reopens a close, presents it, and drops its row", async () => {
  mocks.closed.mockResolvedValue(
    page([closedPanel("mail", "Mail"), closedPanel("notes", "Notes")]),
  );
  render(<AboutPanelRoot />);
  await screen.findByText("Mail");
  fireEvent.click(screen.getByRole("button", { name: "Reopen Mail" }));
  await waitFor(() => expect(screen.queryByText("Mail")).toBeNull());
  expect(mocks.reopen).toHaveBeenCalledWith("mail");
  expect(mocks.focus).toHaveBeenCalledOnce();
  expect(screen.getByText("Notes")).toBeTruthy();
});

it("shows a failed reopen's own message and keeps the row", async () => {
  mocks.closed.mockResolvedValue(page([closedPanel("mail", "Mail")]));
  mocks.reopen.mockRejectedValueOnce(new Error("parent is closed"));
  render(<AboutPanelRoot />);
  await screen.findByText("Mail");
  fireEvent.click(screen.getByRole("button", { name: "Reopen Mail" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "parent is closed",
  );
  expect(screen.getByText("Mail")).toBeTruthy();
});

it("deletes a close only after confirming, naming its sub-panels", async () => {
  mocks.closed.mockResolvedValue(page([closedPanel("mail", "Mail", 3)]));
  render(<AboutPanelRoot />);
  await screen.findByText("Mail");
  fireEvent.click(screen.getByRole("button", { name: "Delete Mail" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog.textContent).toContain("“Mail” and its 2 sub-panels");
  expect(dialog.textContent).toContain("can’t be undone");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(mocks.deleteClosed).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Delete Mail" }));
  fireEvent.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Delete",
    }),
  );
  await waitFor(() => expect(screen.queryByText("Mail")).toBeNull());
  expect(mocks.deleteClosed).toHaveBeenCalledWith("mail");
  expect(screen.getByText("Nothing closed recently")).toBeTruthy();
});

it("shows a failed read's own message and reads again on request", async () => {
  mocks.closed
    .mockRejectedValueOnce(new Error("workspace state unavailable"))
    .mockResolvedValueOnce(page([closedPanel("mail", "Mail")]));
  render(<AboutPanelRoot />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "workspace state unavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Mail");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("reads the list again when the panel is focused", async () => {
  mocks.closed
    .mockResolvedValueOnce(page([closedPanel("mail", "Mail")]))
    .mockResolvedValueOnce(
      page([closedPanel("notes", "Notes"), closedPanel("mail", "Mail")]),
    );
  render(<AboutPanelRoot />);
  await screen.findByText("Mail");
  const onFocus = mocks.onFocus.mock.calls[0]?.[0] as () => void;
  act(() => onFocus());
  await screen.findByText("Notes");
  expect(mocks.closed).toHaveBeenCalledTimes(2);
});
