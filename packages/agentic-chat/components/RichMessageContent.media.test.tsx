// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RichMessageContent } from "./RichMessageContent.js";

it("preserves a loaded media player while action handlers change, and calls the latest handler", async () => {
  const content =
    '<Video url="https://youtu.be/Pb6C4ORBOOI" title="Introduction" />\n\n<ActionButton message="Next">Continue</ActionButton>';
  const previous = vi.fn();
  const latest = vi.fn();
  const { container, rerender } = render(
    <RichMessageContent
      content={content}
      isStreaming={false}
      mdxActions={{ publishMessage: previous }}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Load video/ }));
  const player = container.querySelector("iframe");
  expect(player).toBeTruthy();
  rerender(
    <RichMessageContent
      content={content}
      isStreaming={false}
      mdxActions={{ publishMessage: latest }}
    />,
  );
  await waitFor(() => {
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(latest).toHaveBeenCalledWith("Next");
  });
  expect(container.querySelector("iframe")).toBe(player);
});
