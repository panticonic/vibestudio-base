// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as catalog from "@workspace/ui/response";
import { mdxComponents } from "./markdownComponents";
import { compileMessageMdx } from "./messageMdx";
import { installPanelModules } from "./panelModules.testing";

describe("MDX registry and the response catalog", () => {
  let restoreModules: () => void;
  beforeEach(() => {
    restoreModules = installPanelModules();
  });
  afterEach(() => restoreModules());

  it("registers every catalog component under its export name", () => {
    const componentExports = Object.entries(catalog).filter(
      ([name, value]) => /^[A-Z]/.test(name) && typeof value === "function" && name !== "ResponseActionsProvider",
    );
    expect(componentExports.length).toBeGreaterThanOrEqual(9);
    for (const [name, value] of componentExports) {
      expect(catalog.responseComponents, `responseComponents.${name}`).toHaveProperty(name, value);
      expect(mdxComponents[name], `mdxComponents.${name}`).toBe(value);
    }
  });

  it("registers the Radix layout primitives models compose with", () => {
    for (const name of ["Tabs", "DataList", "Progress", "Separator", "Grid", "Inset", "Avatar", "Tooltip"]) {
      expect(mdxComponents[name], name).toBeTruthy();
    }
  });

  it("renders catalog tags from MDX, including function-valued props, and sends through the provider", async () => {
    const source = [
      '<Stats items={[{ label: "Users", value: 1200, delta: "+5%" }]} />',
      "",
      '<Calculator fields={[{ name: "n", label: "N", default: 3 }]} compute={(v) => [{ label: "Squared", value: v.n * v.n }]} />',
      "",
      '<Choices id="next" question="Next?" options={["Deploy", "Wait"]} />',
    ].join("\n");
    const Mdx = await compileMessageMdx(source);
    const send = vi.fn().mockResolvedValue(undefined);
    render(
      <catalog.ResponseActionsProvider send={send}>
        <Mdx />
      </catalog.ResponseActionsProvider>,
    );
    expect(screen.getByText("1,200")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Deploy" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith("Next? → Deploy", {
        interaction: { source: "choices", kind: "choice", action: "submit", targetId: "next", values: ["Deploy"] },
      }),
    );
  });
});
