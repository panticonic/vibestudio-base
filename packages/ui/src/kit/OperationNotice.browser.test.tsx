import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { page, userEvent } from "@vitest/browser/context";
import { Button, Theme } from "@radix-ui/themes";
import { OperationNotice } from "./feedback";
import "@radix-ui/themes/styles.css";
import "../foundation.css";

afterEach(cleanup);
it.each([320, 390, 1280])(
  "keeps long failure details readable and recovery keyboard-accessible at %i pixels",
  async (width) => {
    await page.viewport(width, 800);
    let recovered = false;
    render(
      <Theme>
        <OperationNotice
          intent="error"
          actions={
            <Button
              onClick={() => {
                recovered = true;
              }}
            >
              Retry saving this note
            </Button>
          }
        >
          {"The server rejected this note: " + "long-detail/".repeat(70)}
        </OperationNotice>
      </Theme>,
    );
    expect(screen.getByRole("alert").getAttribute("aria-atomic")).toBe("true");
    const retry = screen.getByRole("button", {
      name: "Retry saving this note",
    });
    retry.focus();
    expect(document.activeElement).toBe(retry);
    await userEvent.keyboard("{Enter}");
    expect(recovered).toBe(true);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width + 1);
  },
);
it("announces accepted results without presenting them as failures", () => {
  render(
    <Theme>
      <OperationNotice intent="success">Draft saved</OperationNotice>
    </Theme>,
  );
  expect(screen.getByRole("status").textContent).toBe("Draft saved");
  expect(screen.queryByRole("alert")).toBeNull();
});
