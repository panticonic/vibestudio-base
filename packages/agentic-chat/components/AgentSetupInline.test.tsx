// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { describe, expect, it, vi } from "vitest";
import type { ModelCatalog } from "@workspace/agentic-core";
import { makeTestCatalogEntry } from "@workspace/model-catalog/testing";
import { AgentSetupInline } from "./AgentSetupInline";

const model = makeTestCatalogEntry({
  ref: "openai-codex:gpt-5.6-sol",
  id: "gpt-5.6-sol",
  name: "GPT-5.6 Sol",
  provider: "openai-codex",
  baseUrl: "https://chatgpt.com/backend-api",
  reasoning: false,
  availability: { state: "needs-setup", detail: "no-credential" },
});

const chatContext = {
  deferredAgent: {
    draft: { model: model.ref, approvalLevel: 2 },
    setDraft: vi.fn(),
    modelSelectionRequired: true,
    startQueued: vi.fn(),
    queued: [{ id: "opening", text: "Help me get onboarded", tier: "secondary" }],
  },
  modelCatalog: {
    providers: [
      {
        id: "openai-codex",
        label: "GPT Codex",
        recommendedModelRef: model.ref,
      },
    ],
    models: [model],
  } as ModelCatalog,
  defaultAgentConfig: { model: model.ref, approvalLevel: 2 },
  onSaveDefaults: vi.fn(),
  onInstallLocalModel: undefined,
  onConnectModelProvider: vi.fn(async () => {}),
  onOpenLocalModels: undefined,
  onOpenLocalModelsLog: undefined,
};

vi.mock("../context/ChatContext", () => ({
  useChatContext: () => chatContext,
}));

describe("AgentSetupInline", () => {
  it("offers provider sign-in before starting the queued agent", async () => {
    render(
      <Theme>
        <AgentSetupInline />
      </Theme>,
    );

    expect(screen.getByRole("heading", { name: "Choose your agent" })).toBeTruthy();
    expect(screen.getAllByText("GPT-5.6 Sol").length).toBeGreaterThan(0);
    expect(screen.getByRole("combobox", { name: "Provider" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Model" })).toBeTruthy();
    expect(screen.queryByText("Recommended for this workspace")).toBeNull();
    expect(screen.queryByText(/show|hide/i)).toBeNull();
    expect(screen.queryByText(/connect gpt codex/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Use system browser/i }));
    await waitFor(() => expect(chatContext.onConnectModelProvider).toHaveBeenCalled());
    expect(chatContext.deferredAgent.startQueued).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Start agent" })).toBeNull();
    expect(screen.queryByText("Autonomy")).toBeNull();

    fireEvent.click(screen.getByText("▸ Advanced"));
    expect(screen.getByText("Autonomy")).toBeTruthy();
  });
});
