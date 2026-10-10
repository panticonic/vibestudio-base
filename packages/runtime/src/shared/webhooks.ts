import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import type { RpcCaller } from "@vibestudio/rpc";
import type {
  CreateWebhookIngressSubscriptionRequest,
  RotateWebhookIngressSecretResult,
  WebhookIngressSubscriptionSummary,
} from "@vibestudio/shared/webhooks/contracts";
export {
  WEBHOOK_DEFAULT_MAX_BODY_BYTES,
  WEBHOOK_DEFAULT_DIRECT_MAX_BODY_BYTES,
  WEBHOOK_HARD_MAX_BODY_BYTES,
  WEBHOOK_RELAY_MAX_BODY_BYTES,
} from "@vibestudio/shared/webhooks/limits";
export type {
  CreateWebhookIngressSubscriptionRequest,
  RotateWebhookIngressSecretRequest,
  RotateWebhookIngressSecretResult,
  WebhookDeliveredPayload,
  WebhookDeliveryConfig,
  WebhookDeliveryEvent,
  WebhookIngressSubscriptionSummary,
  WebhookPayloadFormat,
  WebhookReplayConfig,
  WebhookResponsePolicy,
  WebhookTarget,
  WebhookVerifierConfig,
} from "@vibestudio/shared/webhooks/contracts";
export interface WebhookIngressClient {
  createSubscription(
    input: CreateWebhookIngressSubscriptionRequest
  ): Promise<WebhookIngressSubscriptionSummary>;
  listSubscriptions(options?: {
    includeRevoked?: boolean;
  }): Promise<WebhookIngressSubscriptionSummary[]>;
  revokeSubscription(subscriptionId: string): Promise<void>;
  rotateSecret(subscriptionId: string, secret?: string): Promise<RotateWebhookIngressSecretResult>;
}
export function createWebhookIngressClient(rpc: RpcCaller): WebhookIngressClient {
  return {
    createSubscription(input) {
      return rpc.call(
        "main",
        mainRpcMethods["webhookIngress.createSubscription"],
        [input]
      );
    },
    listSubscriptions(options) {
      return rpc.call(
        "main",
        mainRpcMethods["webhookIngress.listSubscriptions"],
        options ? [options] : []
      );
    },
    async revokeSubscription(subscriptionId) {
      await rpc.call("main", mainRpcMethods["webhookIngress.revokeSubscription"], [{ subscriptionId }]);
    },
    rotateSecret(subscriptionId, secret) {
      return rpc.call("main", mainRpcMethods["webhookIngress.rotateSecret"], [
        { subscriptionId, secret },
      ]);
    },
  };
}
