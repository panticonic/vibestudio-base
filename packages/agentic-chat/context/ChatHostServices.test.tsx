// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Image } from "@workspace/react";
import { ChatHostServicesProvider, useChatHostServices } from "./ChatHostServices";

afterEach(cleanup);

function Probe() {
  const { problemReports } = useChatHostServices();
  return <span data-testid="reports">{problemReports ? "yes" : "no"}</span>;
}

it("exposes the host's problem-report port and none when the host supplies none", () => {
  const { rerender } = render(
    <ChatHostServicesProvider services={{ problemReports: { report: vi.fn() } }}>
      <Probe />
    </ChatHostServicesProvider>
  );
  expect(screen.getByTestId("reports").textContent).toBe("yes");
  rerender(
    <ChatHostServicesProvider services={undefined}>
      <Probe />
    </ChatHostServicesProvider>
  );
  expect(screen.getByTestId("reports").textContent).toBe("no");
});

it("backs media Image assets with the host's images port", async () => {
  const getAsset = vi.fn(async () => {
    throw new Error("host says no");
  });
  render(
    <ChatHostServicesProvider services={{ images: { getAsset, getBytes: vi.fn() } }}>
      <Image assetId="a1" alt="Scene" />
    </ChatHostServicesProvider>
  );
  expect((await screen.findByRole("alert")).textContent).toContain("host says no");
  expect(getAsset).toHaveBeenCalledWith("a1");
});

it("fails image assets explicitly when the host supplies no images port", async () => {
  render(
    <ChatHostServicesProvider services={{}}>
      <Image assetId="a1" alt="Scene" />
    </ChatHostServicesProvider>
  );
  expect((await screen.findByRole("alert")).textContent).toContain("no images port");
});
