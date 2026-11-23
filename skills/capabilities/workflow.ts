import { authorityMethods } from "@vibestudio/service-schemas/authority";
import { createTypedRpcServiceClient } from "@vibestudio/shared/typedRpcServiceClient";
import { rpc } from "@workspace/runtime";
import type {
  AuthorityObservation,
  AuthorityReviewRequest,
  ExactAuthority,
} from "./natlang/types.js";

export type PreflightOperation = {
  id: string;
  label: string;
  service: string;
  method: string;
  args: unknown[];
};

export function bindAuthorityReview(input: {
  goal: string;
  operations: readonly PreflightOperation[];
  ceiling: readonly ExactAuthority[];
}) {
  const operations = structuredClone(input.operations);
  const request: AuthorityReviewRequest = {
    goal: input.goal,
    operations: operations.map(({ id, label }) => ({ id, label })),
    ceiling: structuredClone([...input.ceiling]),
  };
  if (
    !operations.length ||
    new Set(operations.map(({ id }) => id)).size !== operations.length
  )
    throw new Error("Assign nonempty operations with distinct identifiers");
  const authority = createTypedRpcServiceClient(
    rpc,
    { targetId: "main", namespace: "authority" },
    authorityMethods,
  );
  return {
    request,
    services: {
      assignedAuthorityRead: {
        async preflight(operationId: string): Promise<AuthorityObservation> {
          const assigned = operations.find(
            (operation) => operation.id === operationId,
          );
          if (!assigned) throw new Error("Inspect only an assigned operation");
          const { service, method, args } = assigned;
          const { decision, leaves } = await authority.preflight({
            service,
            method,
            args,
          });
          return {
            operationId,
            decision,
            leaves: leaves.map(({ capability, resourceKey, tier, status }) => ({
              capability,
              resourceKey,
              tier,
              status,
            })),
          };
        },
      },
    },
  };
}
