import { describe, expect, it } from "vitest";
import { getBuiltinModels, getBuiltinProviders } from "./builtinCatalog";
import { ConnectCredentialParamsSchema } from "@vibestudio/service-schemas/credentials";
import {
  listProviderConnectPresets,
  modelIsConnectable,
  providerIsConnectable,
  toCredentialConnectRequest as toSharedCredentialConnectRequest,
} from "@vibestudio/shared/providerConnect";

import { toCredentialConnectRequest } from "./providerConnect";

describe("provider connect presets", () => {
  it("offers guided setup for every catalog provider", () => {
    for (const provider of getBuiltinProviders()) expect(providerIsConnectable(provider), provider).toBe(true);
  });
  it("omits discontinued models from every provider catalog", () => {
    for (const provider of getBuiltinProviders()) {
      expect(
        getBuiltinModels(provider).some(
          (model) => model.id === "gpt-5.3-codex-spark",
        ),
        `${provider} exposes a discontinued model`,
      ).toBe(false);
    }
  });

  it("builds a schema-valid OpenAI Codex external-browser credential request", () => {
    const request = toCredentialConnectRequest("openai-codex", {
      browser: "external",
    });

    expect(request).toMatchObject({
      flow: { type: "oauth2-auth-code-pkce", persistRefreshToken: true },
      credential: {
        label: "ChatGPT Codex model credential",
        audience: [{ url: "https://chatgpt.com/backend-api", match: "path-prefix" }],
        metadata: {
          modelProviderId: "openai-codex",
          accountIdentityJwtClaimRoot: "https://api.openai.com/auth",
          accountIdentityJwtClaimField: "chatgpt_account_id",
        },
      },
      browser: "external",
    });
    expect(request?.redirect).toEqual({
      host: "localhost",
      port: 1455,
      callbackPath: "/auth/callback",
    });
    expect(() => ConnectCredentialParamsSchema.parse(request)).not.toThrow();
  });

  it("uses the in-process loopback redirect for internal OAuth", () => {
    const request = toCredentialConnectRequest("openai-codex", {
      browser: "internal",
    });

    expect(request?.redirect).toMatchObject({
      type: "loopback",
      host: "localhost",
      port: 1455,
      callbackPath: "/auth/callback",
    });
    expect(request?.browser).toBe("internal");
  });

  it("exports the presets from the shared package path", () => {
    expect(toSharedCredentialConnectRequest("openai")?.credential.label).toBe("OpenAI API key");
  });

  it("keeps every provider method schema-valid with its required configuration", () => {
    for (const preset of listProviderConnectPresets()) {
      for (const method of preset.methods) {
        const configuration = Object.fromEntries((preset.configuration ?? []).map((field) => [field.name, field.type === "https-url" ? "https://resource.openai.azure.com/openai/v1" : "account-id"]));
        const request = toCredentialConnectRequest(preset.providerId, { method: method.id, configuration, browser: "external" });
        expect(ConnectCredentialParamsSchema.safeParse(request), `${preset.providerId}/${method.id}`).toMatchObject({ success: true });
      }
    }
  });

  it("binds every built-in model base URL to its provider credential audience", () => {
    for (const preset of listProviderConnectPresets()) {
      const models = getBuiltinModels(preset.providerId as never) as Array<{
        id: string;
        baseUrl: string;
      }>;
      expect(models.length, `${preset.providerId} has no built-in models`).toBeGreaterThan(0);
      for (const model of models) {
        expect(
          modelIsConnectable(preset.providerId, model.baseUrl),
          `${preset.providerId}:${model.id} base URL ${model.baseUrl}`
        ).toBe(true);
      }
    }
  });
});
