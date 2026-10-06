// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { PendingDeliveryQueue } from "./PendingDeliveryQueue.js";

const context = {
  participants: { agent: { metadata: { type: "agent" } } },
  modelCatalog: null,
  deferredAgent: {
    queued: [{ kind: "message", id: "queued", text: "My question" }],
    draft: { model: "model" },
    launching: false,
    launchFailed: false,
    deliveryError: undefined as string | undefined,
    deliveringId: undefined as string | undefined,
    modelSelectionRequired: false,
    modelDiscoveryPending: false,
    retryDelivery: vi.fn(),
    retryLaunch: vi.fn(),
    cancelQueued: vi.fn(),
  },
};
vi.mock("../context/ChatContext", () => ({ useChatContext: () => context }));
beforeEach(() => {
  context.deferredAgent.deliveryError = undefined;
  context.deferredAgent.deliveringId = undefined;
  vi.clearAllMocks();
});
it("reports a paused delivery instead of telling the user to wait for an already joined agent", () => {
  context.deferredAgent.deliveryError = "Publication rejected";
  render(<PendingDeliveryQueue />);
  expect(screen.getByRole("alert").textContent).toBe("Publication rejected");
  expect(screen.getByRole("status").textContent).toContain("Delivery paused");
  expect(screen.queryByText(/waiting for an agent/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry delivery" }));
  expect(context.deferredAgent.retryDelivery).toHaveBeenCalledOnce();
});
it("disables removal while publication owns the queue item", () => {
  context.deferredAgent.deliveringId = "queued";
  render(<PendingDeliveryQueue />);
  const remove = screen.getByRole("button", { name: "Remove queued message" });
  expect((remove as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("status").textContent).toContain(
    "Sending queued messages",
  );
  fireEvent.click(remove);
  expect(context.deferredAgent.cancelQueued).not.toHaveBeenCalled();
});
