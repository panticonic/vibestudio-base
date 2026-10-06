import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
vi.mock("@workspace/runtime", () => ({ images: {} }));
import { Image } from "./media.js";

afterEach(cleanup);
const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGJ8AAAAASUVORK5CYII=";
it("opens an accessible preview in Chromium and returns to the visible inline image", async () => {
  render(
    <Theme>
      <Image src={pixel} alt="Illustration" caption="Opening scene" />
    </Theme>,
  );
  const preview = screen.getByRole("button", { name: "Enlarge Illustration" });
  await waitFor(() =>
    expect(preview.querySelector("img")?.naturalWidth).toBe(1),
  );
  fireEvent.click(preview);
  await waitFor(() =>
    expect(screen.getByRole("dialog", { name: "Opening scene" })).toBeTruthy(),
  );
  expect(
    screen.getByRole("link", { name: "Download image" }).getAttribute("href"),
  ).toBe(pixel);
  fireEvent.click(screen.getByRole("button", { name: "Close image" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    screen.getByRole("button", { name: "Enlarge Illustration" }),
  ).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(preview));
});
