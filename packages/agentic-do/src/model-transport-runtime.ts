/** Credential-free facts about the actual worker hosting the native transport. */
export function modelTransportRuntimeEvidence() {
  const globals = globalThis as typeof globalThis & {WebSocketPair?: unknown; WebSocket?: unknown};
  return {
    workersFetchUpgradeAvailable: typeof globals.fetch === 'function' && typeof globals.WebSocketPair === 'function',
    ambientWebSocketAvailable: typeof globals.WebSocket === 'function',
  };
}
