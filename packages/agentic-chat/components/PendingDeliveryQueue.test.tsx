// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { PendingDeliveryQueue } from "./PendingDeliveryQueue.js";

type Item = {
  kind: "message";
  id: string;
  text: string;
  status?: "queued" | "delivering" | "failed" | "waiting";
  failure?: { title: string; message: string; detail?: string };
  waitingOn?: string;
};
const QUEUED: Item[] = [{ kind: "message", id: "queued", text: "My question" }];
const context = {
  participants: { agent: { metadata: { type: "agent" } } },
  modelCatalog: null,
  deferredAgent: {
    queued: QUEUED,
    draft: { model: "model" },
    launching: false,
    launchFailed: false,
    deliveryError: undefined as string | undefined,
    deliveringId: undefined as string | undefined,
    modelSelectionRequired: false,
    modelDiscoveryPending: false,
    launchStage: undefined as string | undefined,
    retryDelivery: vi.fn(),
    retryLaunch: vi.fn(),
    cancelQueued: vi.fn(),
    discardQueued: vi.fn(),
  },
};
vi.mock("../context/ChatContext", () => ({ useChatContext: () => context }));
beforeEach(() => {
  context.deferredAgent.deliveryError = undefined;
  context.deferredAgent.deliveringId = undefined;
  context.deferredAgent.queued = QUEUED;
  vi.clearAllMocks();
});
it("shows each failed message's reason, what later messages wait on, and per-message retry/discard", () => {
  context.deferredAgent.deliveryError = "Publication rejected";
  context.deferredAgent.queued = [
    {
      kind: "message",
      id: "first",
      text: "My question",
      status: "failed",
      failure: {
        title: "Couldn't send this message",
        message: "It is still waiting. Retry it, or discard it if you no longer need it.",
        detail: "Publication rejected",
      },
    },
    { kind: "message", id: "second", text: "Follow-up", status: "waiting", waitingOn: "first" },
  ];
  render(<PendingDeliveryQueue />);
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toContain("Couldn't send this message");
  expect(alert.textContent).toContain("Retry it, or discard it");
  expect(alert.textContent).toContain("Publication rejected");
  expect(screen.getByRole("status").textContent).toContain("Delivery paused");
  expect(screen.getByText("Waiting for the message above")).toBeTruthy();
  expect(screen.queryByText(/waiting for an agent/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
  expect(context.deferredAgent.retryDelivery).toHaveBeenCalledWith("first");
  fireEvent.click(screen.getByRole("button", { name: "Discard message" }));
  expect(context.deferredAgent.discardQueued).toHaveBeenCalledWith("first");
});
it("names the launch stage while the first agent starts", () => {
  context.participants = {} as typeof context.participants;
  context.deferredAgent.launching = true;
  context.deferredAgent.launchStage = "joining";
  render(<PendingDeliveryQueue />);
  expect(screen.getByRole("status").textContent).toContain(
    "Your agent is joining the conversation",
  );
  context.participants = { agent: { metadata: { type: "agent" } } };
  context.deferredAgent.launching = false;
  context.deferredAgent.launchStage = undefined;
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
