import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import type { RpcClient } from "@vibestudio/rpc";
import type { PanelRendererViewReport } from "@vibestudio/service-schemas/panelRuntime";
import type { PanelBootObservation } from "@vibestudio/shared/panel/observation";

export type PanelBootReportResult = "reported" | "stale";

export type PanelRendererViewObservation = Omit<
  PanelRendererViewReport,
  "boot"
> & {
  boot: { kind: "observed"; observation: PanelBootObservation };
};

export interface PanelBootReporter {
  publish(boot: PanelBootObservation): void;
  dispose(): void;
}

/**
 * Publishes renderer boot evidence in order and only retires it after the
 * coordinator acknowledges the exact renderer lease. A disconnected direct
 * call is retained until the transport reports its completed recovery;
 * application failures are surfaced and left to host/coordinator supervision.
 */
export function createPanelBootReporter(options: {
  rpc: Pick<RpcClient, "status" | "onStatusChange" | "onRecovery"> & {
    call: import("@vibestudio/rpc").RpcCaller["call"];
  };
  observeView: (
    boot: PanelBootObservation,
  ) => Omit<PanelRendererViewObservation, "boot">;
  onError?: (error: unknown, observation: PanelRendererViewObservation) => void;
}): PanelBootReporter {
  let generation = 0;
  let pending: {
    generation: number;
    observation: PanelRendererViewObservation;
  } | null = null;
  let publishing = false;
  let disposed = false;
  let leaseEnded = false;
  let disconnectRevision = 0;

  const publishPending = (): void => {
    if (
      disposed ||
      leaseEnded ||
      publishing ||
      !pending ||
      options.rpc.status() !== "connected"
    ) {
      return;
    }
    const publication = pending;
    const publicationDisconnectRevision = disconnectRevision;
    publishing = true;
    void options.rpc
      .call("main", mainRpcMethods["panelRuntime.reportOwnView"], [
        publication.observation,
      ])
      .then((result) => {
        if (disconnectRevision !== publicationDisconnectRevision) return;
        if (result === "stale") {
          // This document no longer owns the exact coordinator lease. It must
          // never publish into a replacement incarnation with the same entity.
          leaseEnded = true;
          pending = null;
          return;
        }
        if (pending?.generation === publication.generation) pending = null;
      })
      .catch((error: unknown) => {
        if (
          options.rpc.status() === "connected" &&
          disconnectRevision === publicationDisconnectRevision
        ) {
          // A connected rejection is not transport ambiguity. Surface it once
          // and remove only this generation; newer evidence still publishes.
          options.onError?.(error, publication.observation);
          if (pending?.generation === publication.generation) pending = null;
        }
        // A disconnect rejects direct server calls before an acknowledgement
        // can exist. Keep the latest evidence for the connected transition.
      })
      .finally(() => {
        publishing = false;
        publishPending();
      });
  };

  const unsubscribeStatus = options.rpc.onStatusChange((status) => {
    if (status !== "connected") disconnectRevision += 1;
    if (status === "connected") publishPending();
  });
  const unsubscribeRecovery = options.rpc.onRecovery(() => {
    // A recovered generation makes an older direct publication ambiguous even
    // when the bridge never exposed an intermediate disconnected status.
    disconnectRevision += 1;
    publishPending();
  });

  return {
    publish(boot) {
      if (disposed || leaseEnded) return;
      pending = {
        generation: ++generation,
        observation: {
          ...options.observeView(boot),
          boot: { kind: "observed", observation: boot },
        },
      };
      publishPending();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pending = null;
      unsubscribeStatus();
      unsubscribeRecovery();
    },
  };
}
