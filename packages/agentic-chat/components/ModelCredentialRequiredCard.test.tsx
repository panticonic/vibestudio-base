// @vitest-environment jsdom

import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ModelCredentialRequiredCard from "./ModelCredentialRequiredCard";

describe("ModelCredentialRequiredCard", () => {
  it("offers browser choices with optional sign-in help", () => {
    const chat = {
      callMethod: vi.fn(async () => ({
        credential: { id: "connected" },
        resumed: true,
      })),
    };

    render(
      <Theme>
        <ModelCredentialRequiredCard
          chat={chat}
          props={{
            providerId: "openai-codex",
            modelRef: "openai-codex:gpt-5.5",
            modelBaseUrl: "https://chatgpt.com/backend-api",
            agentParticipantId: "do:agent",
            flow: { type: "oauth2-auth-code-pkce" },
          }}
        />
      </Theme>,
    );

    expect(
      screen.getByRole("button", { name: /Use workspace browser/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Use system browser/i }),
    ).toBeTruthy();
    const help = screen.getByText("Sign-in help");
    expect(help.closest("details")?.open).toBe(false);
    fireEvent.click(help);
    expect(help.closest("details")?.open).toBe(true);
  });

  it("uses refresh-specific browser labels when reconnecting credentials", () => {
    const chat = {
      callMethod: vi.fn(async () => ({
        credential: { id: "connected" },
        resumed: true,
      })),
    };

    render(
      <Theme>
        <ModelCredentialRequiredCard
          chat={chat}
          props={{
            providerId: "openai-codex",
            modelRef: "openai-codex:gpt-5.5",
            modelBaseUrl: "https://chatgpt.com/backend-api",
            agentParticipantId: "do:agent",
            flow: { type: "oauth2-auth-code-pkce" },
            reason:
              "Provided authentication token is expired. Please try signing in again.",
          }}
        />
      </Theme>,
    );

    expect(
      screen.getByRole("button", { name: /Refresh in workspace browser/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Refresh in system browser/i }),
    ).toBeTruthy();
  });

  it("only offers the native system browser on mobile hosts", () => {
    Object.assign(globalThis, { __vibestudioHostPlatform: "mobile" });
    try {
      render(
        <Theme>
          <ModelCredentialRequiredCard
            chat={{
              callMethod: vi.fn(async () => ({
                credential: { id: "connected" },
                resumed: true,
              })),
            }}
            props={{
              providerId: "xai",
              modelBaseUrl: "https://api.x.ai/v1",
              agentParticipantId: "do:agent",
              flow: { type: "model-provider-oauth" },
            }}
          />
        </Theme>,
      );

      expect(
        screen.getByRole("button", { name: /Use system browser/i }),
      ).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: /Use workspace browser/i }),
      ).toBeNull();
    } finally {
      delete (globalThis as { __vibestudioHostPlatform?: unknown })
        .__vibestudioHostPlatform;
    }
  });

  it("offers Claude subscription sign-in by default and starts browser authorization", async () => {
    const chat = {
      callMethod: vi.fn(async () => ({
        credential: { id: "connected" },
        resumed: true,
      })),
    };
    render(
      <Theme>
        <ModelCredentialRequiredCard
          chat={chat}
          props={{
            providerId: "anthropic",
            modelRef: "anthropic:claude-opus-5-5",
            modelBaseUrl: "https://api.anthropic.com",
            agentParticipantId: "do:agent",
            flow: { type: "oauth2-auth-code-pkce" },
          }}
        />
      </Theme>,
    );
    expect(
      screen.getByRole("button", { name: "Claude Pro / Max" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "API key" })).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /Use system browser/i }),
    );
    await waitFor(() =>
      expect(chat.callMethod).toHaveBeenCalledWith(
        "do:agent",
        "connectModelCredential",
        expect.objectContaining({
          providerId: "anthropic",
          browserOpenMode: "external",
        }),
        { signal: expect.any(AbortSignal) },
      ),
    );
  });

  it.each([
    "openai-codex",
    "anthropic",
    "github-copilot",
    "kimi-coding",
    "meta",
    "xai",
  ])(
    "connects %s directly from chat settings without an agent",
    async (providerId) => {
      const onConnect = vi.fn(async (_modelRef: string) => {});
      render(
        <Theme>
          <ModelCredentialRequiredCard
            onConnect={onConnect}
            props={{ providerId, modelRef: `${providerId}:model` }}
          />
        </Theme>,
      );
      fireEvent.click(
        screen.getByRole("button", { name: /Use system browser/i }),
      );
      expect(
        await screen.findByText("Provider connected. You can start chatting."),
      ).toBeTruthy();
      expect(onConnect).toHaveBeenCalledWith(
        `${providerId}:model`,
        "subscription",
        "external",
        expect.any(AbortSignal),
        {},
      );
    },
  );

  it("connects a fixed model request without changing or persisting the worker model", async () => {
    const persistAgentModel = vi.fn(async () => {});
    const callMethod = vi.fn(
      async (_participant: string, _method: string, _args: unknown) => ({
        credential: { id: "connected" },
        resumed: false,
      }),
    );
    render(
      <Theme>
        <ModelCredentialRequiredCard
          chat={{ callMethod }}
          props={{
            providerId: "anthropic",
            modelRef: "anthropic:helper-model",
            agentParticipantId: "agent",
            persistAgentModel,
          }}
        />
      </Theme>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Use system browser/i }),
    );
    await screen.findByText("Provider connected.");
    expect(callMethod).toHaveBeenCalledOnce();
    expect(callMethod.mock.calls[0]?.[2]).not.toHaveProperty("modelRef");
    expect(persistAgentModel).not.toHaveBeenCalled();
  });

  it("passes account configuration to secure API-key setup", async () => {
    const onConnect = vi.fn(async (_modelRef: string) => {});
    render(
      <Theme>
        <ModelCredentialRequiredCard
          onConnect={onConnect}
          props={{
            providerId: "azure",
            modelRef: "azure:gpt-4",
          }}
        />
      </Theme>,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Azure OpenAI endpoint" }),
      {
        target: { value: "https://resource.openai.azure.com/openai/v1" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: /Enter API Key/i }));
    await waitFor(() =>
      expect(onConnect).toHaveBeenCalledWith(
        "azure:gpt-4",
        "api-key",
        "internal",
        expect.any(AbortSignal),
        { ENDPOINT: "https://resource.openai.azure.com/openai/v1" },
      ),
    );
  });

  it("cancels pending login and lets the user retry", async () => {
    let signal: AbortSignal | undefined;
    const onConnect = vi.fn(
      async (
        _model: string,
        _method: string,
        _browser: string,
        next: AbortSignal,
      ) => {
        signal = next;
        await new Promise<void>((_resolve, reject) =>
          next.addEventListener("abort", () => reject(new Error("cancelled")), {
            once: true,
          }),
        );
      },
    );
    render(
      <Theme>
        <ModelCredentialRequiredCard
          onConnect={onConnect}
          props={{
            providerId: "anthropic",
            modelRef: "anthropic:claude-opus-5-5",
          }}
        />
      </Theme>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Use system browser/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel sign-in" }));
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByText("cancelled")).toBeNull());
    expect(
      screen
        .getByRole("button", { name: /Use system browser/i })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("starts a fresh connection when switching providers after success", async () => {
    const onConnect = vi.fn(async (_modelRef: string) => {});
    render(
      <Theme>
        <ModelCredentialRequiredCard
          onConnect={onConnect}
          props={{
            providerId: "anthropic",
            modelRef: "anthropic:claude-opus-5-5",
            providerOptions: [
              {
                providerId: "anthropic",
                providerLabel: "Claude",
                modelRef: "anthropic:claude-opus-5-5",
              },
              {
                providerId: "github-copilot",
                providerLabel: "GitHub Copilot",
                modelRef: "github-copilot:gpt-6-sol",
              },
            ],
          }}
        />
      </Theme>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Use system browser/i }),
    );
    await screen.findByText("Provider connected. You can start chatting.");
    fireEvent.click(screen.getByRole("button", { name: /GitHub Copilot/ }));
    expect(
      screen.queryByText("Provider connected. You can start chatting."),
    ).toBeNull();
    const connect = screen.getByRole("button", { name: /Use system browser/i });
    expect(connect.hasAttribute("disabled")).toBe(false);
    fireEvent.click(connect);
    await waitFor(() => expect(onConnect).toHaveBeenCalledTimes(2));
    expect(onConnect.mock.calls[1]?.[0]).toBe("github-copilot:gpt-6-sol");
  });

  it("keeps a failed agent reconnect retryable", async () => {
    const chat = {
      callMethod: vi.fn(async () => ({
        isError: true,
        result: { error: "Sign-in was declined" },
      })),
    };
    render(
      <Theme>
        <ModelCredentialRequiredCard
          chat={chat}
          props={{
            providerId: "anthropic",
            modelRef: "anthropic:claude-opus-5-5",
            agentParticipantId: "agent",
          }}
        />
      </Theme>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Use system browser/i }),
    );
    await waitFor(() =>
      expect(screen.getByText("Sign-in was declined")).toBeTruthy(),
    );
    expect(screen.queryByText(/Provider connected/)).toBeNull();
  });

  it("offers native Claude copy-code sign-in on mobile and retains API-key setup", () => {
    Object.assign(globalThis, { __vibestudioHostPlatform: "mobile" });
    try {
      render(
        <Theme>
          <ModelCredentialRequiredCard
            onConnect={vi.fn()}
            props={{
              providerId: "anthropic",
              modelRef: "anthropic:claude-opus-5-5",
            }}
          />
        </Theme>,
      );
      expect(
        screen.queryByText(
          /This subscription sign-in requires a desktop browser/,
        ),
      ).toBeNull();
      expect(
        screen.getByRole("button", { name: /Use system browser/i }),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "API key" }));
      expect(
        screen.getByRole("button", { name: /Enter API Key/i }),
      ).toBeTruthy();
    } finally {
      delete (globalThis as { __vibestudioHostPlatform?: unknown })
        .__vibestudioHostPlatform;
    }
  });

  it.each([true, false])(
    "reports actual generation wake readiness (%s)",
    async (resumed) => {
      render(
        <Theme>
          <ModelCredentialRequiredCard
            chat={{
              callMethod: async () => ({
                credential: { id: "connected" },
                resumed,
              }),
            }}
            props={{
              providerId: "anthropic",
              modelRef: "anthropic:model",
              agentParticipantId: "agent",
            }}
          />
        </Theme>,
      );
      fireEvent.click(
        screen.getByRole("button", { name: /Use system browser/i }),
      );
      expect(
        await screen.findByText(
          resumed ? "Provider connected. Continuing…" : "Provider connected.",
        ),
      ).toBeTruthy();
    },
  );

  it("does not persist a declined provider selection and allows another connection attempt", async () => {
    const persistAgentModel = vi.fn(async () => {});
    const callMethod = vi.fn(async () => ({
      isError: true,
      result: { error: "Selection declined" },
    }));
    render(
      <Theme>
        <ModelCredentialRequiredCard
          chat={{ callMethod }}
          props={{
            providerId: "anthropic",
            modelRef: "anthropic:model",
            agentParticipantId: "agent",
            persistAgentModel,
            providerOptions: [
              { providerId: "anthropic", modelRef: "anthropic:model" },
            ],
          }}
        />
      </Theme>,
    );
    const connect = screen.getByRole("button", { name: /Use system browser/i });
    fireEvent.click(connect);
    await screen.findByText("Selection declined");
    expect(persistAgentModel).not.toHaveBeenCalled();
    expect(screen.queryByText(/Provider connected/)).toBeNull();
    expect(connect.hasAttribute("disabled")).toBe(false);
    fireEvent.click(connect);
    await waitFor(() => expect(callMethod).toHaveBeenCalledTimes(2));
  });

  it("cancels the owned agent credential RPC explicitly and permits retry", async () => {
    let signal: AbortSignal | undefined;
    const callMethod = vi.fn(
      async (
        _participant: string,
        _method: string,
        _args: unknown,
        options?: { signal?: AbortSignal },
      ) => {
        signal = options?.signal;
        return new Promise((_resolve, reject) =>
          signal?.addEventListener("abort", () => reject(signal?.reason), {
            once: true,
          }),
        );
      },
    );
    const view = render(
      <Theme>
        <ModelCredentialRequiredCard
          chat={{ callMethod }}
          props={{
            providerId: "anthropic",
            modelRef: "anthropic:model",
            agentParticipantId: "agent",
          }}
        />
      </Theme>,
    );
    const connect = screen.getByRole("button", { name: /Use system browser/i });
    fireEvent.click(connect);
    fireEvent.click(screen.getByRole("button", { name: "Cancel sign-in" }));
    expect(signal?.aborted).toBe(true);
    expect(connect.hasAttribute("disabled")).toBe(false);
    fireEvent.click(connect);
    expect(callMethod).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Cancel sign-in" }));
    view.unmount();
  });

  it("keeps server-owned setup alive when the waiting card unmounts", async () => {
    let signal: AbortSignal | undefined;
    let accept!: (value: {
      credential: { id: string };
      resumed: boolean;
    }) => void;
    const persistAgentModel = vi.fn(async () => {});
    const callMethod = vi.fn(
      async (
        _participant: string,
        _method: string,
        _args: unknown,
        options?: { signal?: AbortSignal },
      ) => {
        signal = options?.signal;
        return new Promise<{ credential: { id: string }; resumed: boolean }>(
          (resolve) => {
            accept = resolve;
          },
        );
      },
    );
    const view = render(
      <Theme>
        <ModelCredentialRequiredCard
          chat={{ callMethod }}
          props={{
            providerId: "anthropic",
            modelRef: "anthropic:model",
            agentParticipantId: "agent",
            persistAgentModel,
            providerOptions: [
              { providerId: "anthropic", modelRef: "anthropic:model" },
            ],
          }}
        />
      </Theme>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Use system browser/i }),
    );
    view.unmount();
    expect(signal?.aborted).toBe(false);
    expect(persistAgentModel).not.toHaveBeenCalled();
    accept({ credential: { id: "connected" }, resumed: true });
    await waitFor(() =>
      expect(persistAgentModel).toHaveBeenCalledWith(
        "agent",
        "anthropic:model",
      ),
    );
  });

  it("cancels panel-owned setup when its card unmounts", () => {
    let signal: AbortSignal | undefined;
    const onConnect = async (
      _model: string,
      _method: string,
      _browser: string,
      next: AbortSignal,
    ) => {
      signal = next;
      await new Promise<void>((_resolve, reject) =>
        next.addEventListener("abort", () => reject(next.reason), {
          once: true,
        }),
      );
    };
    const view = render(
      <Theme>
        <ModelCredentialRequiredCard
          onConnect={onConnect}
          props={{ providerId: "anthropic", modelRef: "anthropic:model" }}
        />
      </Theme>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Use system browser/i }),
    );
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("connects the selected provider and model in one operation and persists only after acceptance", async () => {
    const calls: Array<{
      participantId: string;
      method: string;
      args: unknown;
    }> = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const persistAgentModel = vi.fn(async () => {
      throw new Error("approval denied");
    });
    const chat = {
      callMethod: vi.fn(
        async (participantId: string, method: string, args: unknown) => {
          calls.push({ participantId, method, args });
          expect(persistAgentModel).not.toHaveBeenCalled();
          return { credential: { id: "connected" }, resumed: true };
        },
      ),
    };

    render(
      <Theme>
        <ModelCredentialRequiredCard
          chat={chat}
          props={{
            providerId: "openai-codex",
            modelRef: "openai-codex:gpt-5.5",
            modelBaseUrl: "https://chatgpt.com/backend-api",
            agentParticipantId: "do:agent",
            browserHandoffCallerId: "panel:runtime-1",
            browserHandoffCallerKind: "panel",
            persistAgentModel,
            providerOptions: [
              {
                providerId: "openai-codex",
                providerLabel: "ChatGPT",
                modelRef: "openai-codex:gpt-5.5",
                modelName: "GPT-5.5",
                modelBaseUrl: "https://chatgpt.com/backend-api",
                flow: { type: "oauth2-auth-code-pkce" },
              },
              {
                providerId: "anthropic",
                providerLabel: "Anthropic",
                modelRef: "anthropic:claude-3-5-sonnet-20241022",
                modelName: "Claude 3.5 Sonnet",
                modelBaseUrl: "https://api.anthropic.com",
                flow: { type: "api-key" },
              },
            ],
          }}
        />
      </Theme>,
    );

    fireEvent.click(screen.getByText("Anthropic"));
    expect(
      screen.getByRole("button", { name: /Use system browser/i }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "API key" }));
    fireEvent.click(screen.getByRole("button", { name: /Enter API Key/i }));

    await waitFor(() => expect(chat.callMethod).toHaveBeenCalledTimes(1));
    expect(calls.map((call) => [call.participantId, call.method])).toEqual([
      ["do:agent", "connectModelCredential"],
    ]);
    expect(persistAgentModel).toHaveBeenCalledWith(
      "do:agent",
      "anthropic:claude-3-5-sonnet-20241022",
    );
    expect(calls[0]?.args).toMatchObject({
      providerId: "anthropic",
      method: "api-key",
      modelBaseUrl: "https://api.anthropic.com",
      modelRef: "anthropic:claude-3-5-sonnet-20241022",
      browserOpenMode: "internal",
      browserHandoffCallerId: "panel:runtime-1",
      browserHandoffCallerKind: "panel",
    });
    await waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });
});
