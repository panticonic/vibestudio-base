import type {
  CredentialClient,
  StoredCredentialSummary,
} from "@vibestudio/credential-client";
import { website } from "@workspace/integrations";

export type PublishingProvider = "vercel" | "cloudflare-pages";

export function connectPublishingProvider(
  provider: PublishingProvider,
  credentials: CredentialClient,
): Promise<StoredCredentialSummary> {
  return provider === "vercel"
    ? website.connectVercelForPublishing(credentials)
    : website.connectCloudflarePagesForPublishing(credentials);
}
