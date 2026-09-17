// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { afterEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  providers: vi.fn(),
  prepare: vi.fn(),
  devices: vi.fn(),
  provision: vi.fn(),
  waitForWorkspace: vi.fn(),
}));
vi.mock("./index.js", () => ({ phoneSetup: async () => api }));
import PhoneSetup from "./PhoneSetup";
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const paired = {
  providerId: "desktop",
  platform: "android",
  workspace: "System",
  attachedDeviceId: "serial",
  installStatus: "installed",
  compatibleAppInstalled: true,
  pairingStatus: "paired",
  workspaceStatus: "opening",
  pairedDevice: { deviceId: "phone", label: "Phone", createdAt: 1 },
};
function fixtures() {
  api.providers.mockResolvedValue([
    { providerId: "desktop", label: "My desktop", platforms: ["android"] },
  ]);
  api.prepare.mockResolvedValue(undefined);
  api.devices.mockResolvedValue({
    devices: [
      {
        providerId: "desktop",
        deviceId: "serial",
        platform: "android",
        ready: true,
        name: "Pixel",
        kind: "physical",
      },
    ],
    issues: [],
  });
}
it("prepares missing tools, reports real phases, and checks a paired workspace without reinstalling", async () => {
  fixtures();
  api.provision.mockImplementation(async (_input, emit) => {
    emit({
      type: "progress",
      phase: "installing",
      message: "Installing the phone app…",
    });
    emit({ type: "paired", result: paired });
    return paired;
  });
  api.waitForWorkspace
    .mockResolvedValueOnce({ status: "opening", message: "Still opening" })
    .mockResolvedValueOnce({
      status: "ready",
      message: "Your workspace is ready. You can unplug.",
    });
  const scope: Record<string, unknown> = {};
  render(
    <Theme>
      <PhoneSetup scope={scope} />
    </Theme>,
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Prepare tools and find phones",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Prepare tools and find phones" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Install and connect" }),
  );
  await screen.findByText(/workspace is still opening/);
  expect(screen.queryByText(/You can unplug/)).toBeNull();
  expect(api.prepare).toHaveBeenCalledWith("desktop", "android");
  expect(api.prepare.mock.invocationCallOrder[0]).toBeLessThan(
    api.devices.mock.invocationCallOrder[0]!,
  );
  expect(scope["phoneSetupPaired"]).toEqual(paired);
  fireEvent.click(screen.getByRole("button", { name: "Check workspace" }));
  await screen.findByText(/You can unplug/);
  expect(api.provision).toHaveBeenCalledTimes(1);
});
it("keeps a tool download failure retryable and blocks duplicate actions", async () => {
  fixtures();
  let reject!: (error: Error) => void;
  api.prepare.mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  render(
    <Theme>
      <PhoneSetup />
    </Theme>,
  );
  const prepare = screen.getByRole("button", {
    name: "Prepare tools and find phones",
  });
  await waitFor(() =>
    expect((prepare as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(prepare);
  fireEvent.click(prepare);
  await waitFor(() => expect(api.prepare).toHaveBeenCalledTimes(1));
  reject(new Error("Download failed. Check your internet connection."));
  await screen.findByRole("alert");
  expect(api.devices).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Check phones again" }));
  await screen.findByRole("button", { name: "Install and connect" });
  expect(api.prepare).toHaveBeenCalledTimes(2);
});
it("restores paired state and verifies readiness rather than trusting cached success", async () => {
  fixtures();
  api.waitForWorkspace.mockResolvedValue({
    status: "failed",
    message: "Check the message on your phone.",
  });
  render(
    <Theme>
      <PhoneSetup scope={{ phoneSetupPaired: paired }} />
    </Theme>,
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Check workspace",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Check workspace" }));
  await screen.findByRole("alert");
  expect(api.provision).not.toHaveBeenCalled();
  expect(screen.queryByText(/You can unplug/)).toBeNull();
});
