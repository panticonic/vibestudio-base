// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ResponseActionsProvider } from "@workspace/ui/response";
import { RichMessageContent } from "./RichMessageContent.js";

it("preserves a loaded media player while the actions provider changes, and sends through the latest one", async () => {
  const content =
    '<Video url="https://youtu.be/Pb6C4ORBOOI" title="Introduction" />\n\n<ActionButton message="Next">Continue</ActionButton>';
  const previous = vi.fn();
  const latest = vi.fn();
  const { container, rerender } = render(
    <ResponseActionsProvider send={previous}>
      <RichMessageContent content={content} isStreaming={false} />
    </ResponseActionsProvider>,
  );
  await waitFor(() => expect(container.querySelector("iframe")).toBeTruthy());
  const player = container.querySelector("iframe");
  expect(player).toBeTruthy();
  rerender(
    <ResponseActionsProvider send={latest}>
      <RichMessageContent content={content} isStreaming={false} />
    </ResponseActionsProvider>,
  );
  await waitFor(() => {
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(latest).toHaveBeenCalledWith("Next", undefined);
  });
  expect(container.querySelector("iframe")).toBe(player);
});
