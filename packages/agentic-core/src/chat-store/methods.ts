/**
 * Method-provider port.
 *
 * A chat participant advertises channel methods (tools, feedback forms, inline
 * UI, …). Each feature owns its own group and registers a provider with the
 * session; the session composes the registry when it joins the channel. The
 * method surface is fixed per join — changing it requires a new join, so a
 * provider registered after connect takes effect on the next (re)connect.
 *
 * Browser-only features (inline UI, action bar, feedback renderers, client
 * eval) register from the React layer; a terminal or Durable Object host
 * registers only what it can honour, so agents fall back to text for the rest.
 */

import type { MethodDefinition } from "@workspace/pubsub";

export type ChatMethods = Record<string, MethodDefinition>;

/** Returns the method group to advertise on the next join (undefined = none). */
export type ChatMethodProvider = () => ChatMethods | undefined;

/**
 * Compose independently owned method groups and reject ambiguous ownership.
 * A duplicate method is a feature-boundary defect, so it fails before joining
 * the channel instead of relying on object-spread order.
 */
export function composeChatMethods(...groups: Array<ChatMethods | undefined>): ChatMethods {
  const methods: ChatMethods = {};
  for (const group of groups) {
    if (!group) continue;
    for (const [name, definition] of Object.entries(group)) {
      if (Object.hasOwn(methods, name)) {
        throw new Error(`AgenticChat method ${JSON.stringify(name)} has multiple owners`);
      }
      methods[name] = definition;
    }
  }
  return methods;
}

/** Ordered registry of method providers, keyed by owning feature. */
export class ChatMethodRegistry {
  readonly #providers = new Map<string, ChatMethodProvider>();

  /**
   * Register (or replace) the provider for `key`. Returns its unregistration,
   * which only removes this exact provider (a replacement stays registered).
   */
  register(key: string, provider: ChatMethodProvider): () => void {
    this.#providers.set(key, provider);
    return () => {
      if (this.#providers.get(key) === provider) this.#providers.delete(key);
    };
  }

  /** The composed method surface for a join, in registration order. */
  compose(): ChatMethods {
    return composeChatMethods(...[...this.#providers.values()].map((provide) => provide()));
  }
}
