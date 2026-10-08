// @vitest-environment jsdom

import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { Theme } from "@radix-ui/themes";
import { AgentConfigForm, configForSelectedModel, type AgentConfigDraft } from "./AgentConfigForm";
import type { ModelCatalog } from "@workspace/agentic-core";

// jsdom does not implement the browser scrolling API used by Radix Select.
const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeAll(() =>
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  }),
);
afterAll(() => {
  if (scrollIntoView)
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollIntoView);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

const catalog = {
  models: [
    {
      ref: "prov:model-a",
      name: "Model A",
      provider: "prov",
      baseUrl: "https://a",
      recommended: true,
      connectable: true,
      reasoning: false,
      thinkingLevels: [],
    },
    {
      ref: "prov:model-b",
      name: "Model B",
      provider: "prov",
      baseUrl: "https://b",
      connectable: true,
      reasoning: false,
      thinkingLevels: [],
    },
  ],
} as unknown as ModelCatalog;

const extendedThinkingCatalog = {
  models: [
    {
      ref: "prov:model-thinking",
      name: "Thinking Model",
      provider: "prov",
      baseUrl: "https://thinking",
      recommended: true,
      connectable: true,
      reasoning: true,
      thinkingLevels: ["minimal", "low", "medium", "high", "xhigh", "max"],
    },
  ],
} as unknown as ModelCatalog;

const fastCodexCatalog = {
  models: [
    {
      ref: "openai-codex:gpt-5.6-sol",
      id: "gpt-5.6-sol",
      name: "GPT-5.6 Sol",
      provider: "openai-codex",
      baseUrl: "https://chatgpt.com/backend-api",
      connectable: true,
      reasoning: true,
      thinkingLevels: ["low", "medium", "high"],
      modelSpec: { serviceTiers: ["priority"] },
    },
  ],
} as unknown as ModelCatalog;

function renderForm(props: Partial<React.ComponentProps<typeof AgentConfigForm>> = {}) {
  const onChange = vi.fn();
  const value: AgentConfigDraft = { model: "prov:model-a", approvalLevel: 2 };
  const utils = render(
    <Theme>
      <AgentConfigForm catalog={catalog} value={value} onChange={onChange} {...props} />
    </Theme>,
  );
  return { ...utils, onChange };
}

describe("AgentConfigForm — save as defaults", () => {
  it("hides the control entirely when the host provides no onSaveAsDefault", () => {
    renderForm({ defaultAgentConfig: { model: "prov:model-a", approvalLevel: 2 } });
    expect(screen.queryByText(/save defaults/i)).toBeNull();
    expect(screen.queryByText(/workspace defaults/i)).toBeNull();
  });

  it("offers 'Save defaults' when the config differs, and persists the full config", async () => {
    const onSaveAsDefault = vi.fn();
    // draft = model-a / approval 2; saved defaults use model-b → they differ.
    renderForm({
      onSaveAsDefault,
      defaultAgentConfig: { model: "prov:model-b", approvalLevel: 2 },
    });
    const btn = screen.getByRole("button", { name: /save defaults/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(onSaveAsDefault).toHaveBeenCalledWith({ model: "prov:model-a", approvalLevel: 2 });
  });

  it("shows the 'workspace defaults' indicator (no button) when the config already matches", () => {
    const onSaveAsDefault = vi.fn();
    renderForm({
      onSaveAsDefault,
      defaultAgentConfig: { model: "prov:model-a", approvalLevel: 2 },
    });
    expect(screen.getByText(/workspace defaults/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /save defaults/i })).toBeNull();
    expect(onSaveAsDefault).not.toHaveBeenCalled();
  });

  it("renders and selects extended effort levels with a dropdown", () => {
    const { onChange } = renderForm({
      catalog: extendedThinkingCatalog,
      value: {
        model: "prov:model-thinking",
        thinkingLevel: "xhigh",
        approvalLevel: 2,
      },
    });

    const effort = screen.getByRole("combobox", { name: "Effort" });
    expect(effort.textContent).toContain("Extra high");
    fireEvent.click(effort);
    fireEvent.click(screen.getByRole("option", { name: "Max" }));
    expect(onChange).toHaveBeenCalledWith({
      model: "prov:model-thinking",
      thinkingLevel: "max",
      approvalLevel: 2,
    });
  });

  it("offers fast mode only on models that advertise the priority service tier", () => {
    const { onChange } = renderForm({
      catalog: fastCodexCatalog,
      value: { model: "openai-codex:gpt-5.6-sol", fastMode: false, approvalLevel: 2 },
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "Fast mode" }));
    expect(onChange).toHaveBeenCalledWith({
      model: "openai-codex:gpt-5.6-sol",
      fastMode: true,
      approvalLevel: 2,
    });
  });

  it("defaults newly selected models to standard mode", () => {
    expect(configForSelectedModel("openai-codex:gpt-5.6-sol")).toEqual({
      model: "openai-codex:gpt-5.6-sol",
      fastMode: false,
    });
    expect(configForSelectedModel("prov:model-b")).toEqual({
      model: "prov:model-b",
      fastMode: false,
    });
  });
});
