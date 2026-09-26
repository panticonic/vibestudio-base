// @vitest-environment jsdom

import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ModelCredentialRequiredCard from "./ModelCredentialRequiredCard";

describe("ModelCredentialRequiredCard", () => {
  it("explains workspace and system browser choices for initial OAuth credential setup", () => {
    const chat = {
      callMethod: vi.fn(async () => ({ ok: true })),
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
      </Theme>
    );

    expect(
      screen.getByText(
        "Choose the browser that is already signed in to the account you want to connect. If neither is signed in, pick the one you want to use."
      )
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Use workspace browser/i })).toBeTruthy();
    expect(
      screen.getByText("Choose this when the account is signed in inside this workspace.")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Use system browser/i })).toBeTruthy();
    expect(
      screen.getByText("Choose this when your regular browser already has the right account.")
    ).toBeTruthy();
  });

  it("uses refresh-specific browser labels when reconnecting credentials", () => {
    const chat = {
      callMethod: vi.fn(async () => ({ ok: true })),
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
            reason: "Provided authentication token is expired. Please try signing in again.",
          }}
        />
      </Theme>
    );

    expect(
      screen.getByText(
        "Choose the browser that is signed in to the account you want to reconnect. If neither is signed in, pick the one you want to use."
      )
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Refresh in workspace browser/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Refresh in system browser/i })).toBeTruthy();
  });

  it("only offers the native system browser on mobile hosts", () => {
    Object.assign(globalThis, { __vibestudioHostPlatform: "mobile" });
    try {
      render(
        <Theme>
          <ModelCredentialRequiredCard
            chat={{ callMethod: vi.fn(async () => ({ ok: true })) }}
            props={{
              providerId: "xai",
              modelBaseUrl: "https://api.x.ai/v1",
              agentParticipantId: "do:agent",
              flow: { type: "model-provider-oauth" },
            }}
          />
        </Theme>
      );

      expect(screen.getByRole("button", { name: /Use system browser/i })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Use workspace browser/i })).toBeNull();
    } finally {
      delete (globalThis as { __vibestudioHostPlatform?: unknown }).__vibestudioHostPlatform;
    }
  });

  it("offers Claude subscription sign-in by default and starts browser authorization", async () => {
    const chat = { callMethod: vi.fn(async () => ({ ok: true })) };
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
      </Theme>
    );
    expect(screen.getByRole("button", { name: "Claude Pro / Max" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "API key" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Use system browser/i }));
    await waitFor(() =>
      expect(chat.callMethod).toHaveBeenCalledWith(
        "do:agent",
        "connectModelCredential",
        expect.objectContaining({
          providerId: "anthropic",
          modelRef: "anthropic:claude-opus-5-5",
          browserOpenMode: "external",
        })
      )
    );
  });

  it.each(["openai-codex", "anthropic", "github-copilot", "kimi-coding", "meta", "xai"])(
    "connects %s directly from chat settings without an agent",
    async (providerId) => {
      const onConnect = vi.fn(async (_modelRef: string) => {});
      render(
        <Theme>
          <ModelCredentialRequiredCard
            onConnect={onConnect}
            props={{ providerId, modelRef: `${providerId}:model` }}
          />
        </Theme>
      );
      fireEvent.click(screen.getByRole("button", { name: /Use system browser/i }));
      await waitFor(() =>
        expect(onConnect).toHaveBeenCalledWith(
          `${providerId}:model`,
          "subscription",
          "external",
          expect.any(AbortSignal),
          {}
        )
      );
      expect(screen.getByText("Provider connected. You can start chatting.")).toBeTruthy();
    }
  );

  it("passes account configuration to secure API-key setup", async () => {
    const onConnect = vi.fn(async (_modelRef: string) => {});
    render(
      <Theme>
        <ModelCredentialRequiredCard
          onConnect={onConnect}
          props={{
            providerId: "azure-openai-responses",
            modelRef: "azure-openai-responses:gpt-6-sol",
          }}
        />
      </Theme>
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Azure OpenAI endpoint" }), {
      target: { value: "https://resource.openai.azure.com/openai/v1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Enter API Key/i }));
    await waitFor(() =>
      expect(onConnect).toHaveBeenCalledWith(
        "azure-openai-responses:gpt-6-sol",
        "api-key",
        "internal",
        expect.any(AbortSignal),
        { ENDPOINT: "https://resource.openai.azure.com/openai/v1" }
      )
    );
  });

  it("cancels pending login and lets the user retry", async () => {
    let signal: AbortSignal | undefined;
    const onConnect = vi.fn(
      async (_model: string, _method: string, _browser: string, next: AbortSignal) => {
        signal = next;
        await new Promise<void>((_resolve, reject) =>
          next.addEventListener("abort", () => reject(new Error("cancelled")), { once: true })
        );
      }
    );
    render(
      <Theme>
        <ModelCredentialRequiredCard
          onConnect={onConnect}
          props={{ providerId: "anthropic", modelRef: "anthropic:claude-opus-5-5" }}
        />
      </Theme>
    );
    fireEvent.click(screen.getByRole("button", { name: /Use system browser/i }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel sign-in" }));
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByText("cancelled")).toBeNull());
    expect(
      screen.getByRole("button", { name: /Use system browser/i }).hasAttribute("disabled")
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
              { providerId: "anthropic", providerLabel: "Claude", modelRef: "anthropic:claude-opus-5-5" },
              { providerId: "github-copilot", providerLabel: "GitHub Copilot", modelRef: "github-copilot:gpt-6-sol" },
            ],
          }}
        />
      </Theme>
    );
    fireEvent.click(screen.getByRole("button", { name: /Use system browser/i }));
    await screen.findByText("Provider connected. You can start chatting.");
    fireEvent.click(screen.getByRole("button", { name: /GitHub Copilot/ }));
    expect(screen.queryByText("Provider connected. You can start chatting.")).toBeNull();
    const connect = screen.getByRole("button", { name: /Use system browser/i });
    expect(connect.hasAttribute("disabled")).toBe(false);
    fireEvent.click(connect);
    await waitFor(() => expect(onConnect).toHaveBeenCalledTimes(2));
    expect(onConnect.mock.calls[1]?.[0]).toBe("github-copilot:gpt-6-sol");
  });

  it("keeps a failed agent reconnect retryable", async () => {
    const chat = {
      callMethod: vi.fn(async () => ({ isError: true, result: { error: "Sign-in was declined" } })),
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
      </Theme>
    );
    fireEvent.click(screen.getByRole("button", { name: /Use system browser/i }));
    await waitFor(() => expect(screen.getByText("Sign-in was declined")).toBeTruthy());
    expect(screen.queryByText(/Provider connected/)).toBeNull();
  });

  it("explains desktop-only subscription redirects on mobile and retains API-key setup", () => {
    Object.assign(globalThis, { __vibestudioHostPlatform: "mobile" });
    try {
      render(
        <Theme>
          <ModelCredentialRequiredCard
            onConnect={vi.fn()}
            props={{ providerId: "anthropic", modelRef: "anthropic:claude-opus-5-5" }}
          />
        </Theme>
      );
      expect(screen.getByText(/This subscription sign-in requires a desktop browser/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Use system browser/i })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "API key" }));
      expect(screen.getByRole("button", { name: /Enter API Key/i })).toBeTruthy();
    } finally {
      delete (globalThis as { __vibestudioHostPlatform?: unknown }).__vibestudioHostPlatform;
    }
  });

  it("switches the selected model before connecting credentials and persists best-effort", async () => {
    const calls: Array<{ participantId: string; method: string; args: unknown }> = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chat = {
      callMethod: vi.fn(async (participantId: string, method: string, args: unknown) => {
        calls.push({ participantId, method, args });
        if (method === "persist_agent_model") throw new Error("approval denied");
        return { ok: true };
      }),
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
            modelPersistenceParticipantId: "panel:chat-participant",
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
      </Theme>
    );

    fireEvent.click(screen.getByText("Anthropic"));
    expect(screen.getByRole("button", { name: /Use system browser/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "API key" }));
    fireEvent.click(screen.getByRole("button", { name: /Enter API Key/i }));

    await waitFor(() => expect(chat.callMethod).toHaveBeenCalledTimes(3));
    expect(calls.map((call) => [call.participantId, call.method])).toEqual([
      ["do:agent", "setModel"],
      ["panel:chat-participant", "persist_agent_model"],
      ["do:agent", "connectModelCredential"],
    ]);
    expect(calls[1]?.args).toEqual({
      participantId: "do:agent",
      model: "anthropic:claude-3-5-sonnet-20241022",
    });
    expect(calls[2]?.args).toMatchObject({
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
