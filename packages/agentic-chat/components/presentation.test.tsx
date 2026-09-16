// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  InlineUiSurface,
  MessageContent,
  MessageSurface,
} from "../presentation";

afterEach(cleanup);

it("renders shared message styling without a conversation provider", () => {
  const view = render(
    <MessageSurface role="player" secondary error>
      <MessageContent
        content="A local example, not a live conversation."
        isStreaming={false}
      />
    </MessageSurface>,
  );
  expect(
    view.container.querySelector(
      ".message-card-client.message-card-tier2.message-card-error",
    ),
  ).not.toBeNull();
  expect(
    screen.getByText("A local example, not a live conversation."),
  ).toBeTruthy();
});

it("provides the real collapsible inline frame without session or persistence plumbing", () => {
  function Example() {
    const [read, setRead] = useState(false);
    return (
      <InlineUiSurface subtitle="Reading list">
        <label>
          <input
            type="checkbox"
            checked={read}
            onChange={(event) => setRead(event.target.checked)}
          />
          Read
        </label>
      </InlineUiSurface>
    );
  }
  render(<Example />);
  fireEvent.click(screen.getByRole("checkbox"));
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  const header = screen.getByRole("button", { name: /Interactive UI/ });
  fireEvent.click(header);
  expect(header.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.click(header);
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
});
