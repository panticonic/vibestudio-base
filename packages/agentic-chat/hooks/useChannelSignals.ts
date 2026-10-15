import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ParticipantMetadata, PubSubClient } from "@workspace/pubsub";
import {
  ChannelSignalsStore,
  type ChannelSignal,
  type ChannelSignalsOptions,
} from "@workspace/agentic-core/chat-store";

export type { ChannelSignal };
export type UseChannelSignalsOptions = ChannelSignalsOptions;

const NO_SIGNALS: readonly ChannelSignal[] = [];
const noSubscription = () => () => undefined;
const noSignals = () => NO_SIGNALS;

/**
 * Live, non-durable channel signals in a small expiring window for transient
 * UI affordances. React adapter over `ChannelSignalsStore`.
 */
export function useChannelSignals<T extends ParticipantMetadata = ParticipantMetadata>(
  client: PubSubClient<T> | null,
  options: UseChannelSignalsOptions = {},
): ReadonlyArray<ChannelSignal> {
  const { maxSignals, ttlMs } = options;
  const store = useMemo(
    () =>
      client
        ? new ChannelSignalsStore(client, {
            ...(maxSignals !== undefined ? { maxSignals } : {}),
            ...(ttlMs !== undefined ? { ttlMs } : {}),
          })
        : null,
    [client, maxSignals, ttlMs],
  );
  useEffect(() => store?.retain(), [store]);
  return useSyncExternalStore(
    store?.subscribe ?? noSubscription,
    store?.getSnapshot ?? noSignals,
    store?.getSnapshot ?? noSignals,
  );
}
