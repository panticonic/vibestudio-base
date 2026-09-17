import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Text,
} from "@radix-ui/themes";
import {
  templatesMethods,
  type TemplatesClient,
  type TemplateUpdateStatus,
} from "@vibestudio/service-schemas/templates";
import { useTemplateDraft } from "./templateDraft";
import "./templateMaintenance.css";
type Source = Awaited<ReturnType<TemplatesClient["installed"]>>[number];
export function templateUpdateAgentPrompt(
  source: Source,
  check?: TemplateUpdateStatus["checks"][number],
  operationId?: string,
) {
  return [
    "Review an upstream template update for this workspace. Handle the update agentically: understand incoming changes and local intent before merging, including changes the VCS considers conflict-free.",
    `Recorded source: ${JSON.stringify(source.pin)}.`,
    check?.target
      ? `Exact discovered target: ${JSON.stringify(check.target)}; target systemEpoch: ${check.targetEpoch}.`
      : "Check the recorded upstream for an exact target first.",
    operationId
      ? `Resume existing update operation ${JSON.stringify(operationId)} rather than preparing a duplicate.`
      : "Prepare a separate semantic review context using the template lifecycle tools only after inspecting compatibility.",
    "Read the templates skill and its workspace-updates reference. Inspect the base, local edits, and incoming source; preserve local intent, resolve semantic changes with the ordinary VCS tools, and run relevant checks. Do not treat an automatic clean merge as sufficient review.",
    "Compatibility uses systemEpoch, the host application's major version. A different epoch requires an available matching workspace host and the reviewed epoch-transition handoff; never change the epoch just to silence validation or force a foreign template through the same-epoch update path.",
    "Present the proposed changes, compatibility requirements, and verification results. Ask the user to approve the concrete result before publishing to workspace main, installing an app update, or restarting. Do not apply the update merely because this review was requested.",
  ].join("\n\n");
}
export function TemplateUpdates({
  client,
  workspaceId,
  sources,
  onRefresh,
  onReviewWithAgent,
}: {
  client: TemplatesClient;
  workspaceId: string;
  sources: Source[];
  onRefresh: () => Promise<void>;
  onReviewWithAgent: (prompt: string) => void;
}) {
  const [status, setStatus] = useState<TemplateUpdateStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [request, , restoreError] = useTemplateDraft<
    Parameters<TemplatesClient["prepareUpdate"]>[0]
  >(
    workspaceId,
    "request",
    (value) => templatesMethods.prepareUpdate.args.parse([value])[0],
  );
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void client
        .updateStatus()
        .then((value) => {
          if (active) setStatus(value);
        })
        .catch((error) => {
          if (active) setError(String(error));
        });
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [client]);
  const checkNow = async () => {
    setBusy(true);
    setError("");
    try {
      await onRefresh();
      setStatus(await client.checkUpdates());
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  const count =
    status?.checks.filter(
      (check) =>
        check.status === "available" || check.status === "different-epoch",
    ).length ?? 0;
  const sourceCard = (source: Source) => {
    const check = status?.checks.find(
      (item) =>
        item.source.url === source.pin.url &&
        item.source.commit === source.pin.commit,
    );
    return (
      <Card key={source.pin.url} className="workspace-source-card">
        <Flex direction="column" gap="3">
          <Flex gap="2" align="center" wrap="wrap">
            <Heading size="4">
              {source.presentation?.name ?? source.pin.url}
            </Heading>
            <Badge>
              {source.relationship === "upstream"
                ? "Authoring upstream"
                : source.relationship === "direct"
                  ? "Workspace template"
                  : "Supporting dependency"}
            </Badge>
            {check?.status === "available" && (
              <Badge color="green">Update available</Badge>
            )}
            {check?.status === "different-epoch" && (
              <Badge color="amber">App compatibility review needed</Badge>
            )}
          </Flex>
          <Text size="2" className="workspace-source-url">
            {source.pin.url.replace(/^git\+/, "")}
          </Text>
          <Text size="2" color="gray">
            Installed: {source.pin.ref.replace(/^refs\/(heads|tags)\//, "")} ·{" "}
            {source.pin.commit.slice(0, 8)}
          </Text>
          <Text size="2" color="gray">
            {check
              ? `Last checked ${new Date(check.checkedAt).toLocaleString()}`
              : "Not checked yet"}
          </Text>
          {check?.status === "current" && (
            <Text size="2">Up to date at the last check.</Text>
          )}
          {check?.status === "error" && (
            <Text size="2" color="red">
              Couldn’t check this source: {check.error}
            </Text>
          )}
          {check?.status === "different-epoch" && (
            <Text size="2">
              This update targets app version {check.targetEpoch}.x; this
              workspace uses version {status?.workspaceEpoch}.x. An agent will
              review whether an app change is needed before updating.
            </Text>
          )}
          {check?.status !== "current" && (
            <Button
              onClick={() =>
                onReviewWithAgent(
                  templateUpdateAgentPrompt(
                    source,
                    check,
                    request?.sourceUrl === source.pin.url
                      ? request.commandId
                      : undefined,
                  ),
                )
              }
            >
              Review {source.presentation?.name ?? "update"} with an agent
            </Button>
          )}
        </Flex>
      </Card>
    );
  };
  return (
    <Flex direction="column" gap="4" className="workspace-maintenance">
      <Flex justify="between" align="center" gap="3" wrap="wrap">
        <Heading size="5">
          Workspace updates {count > 0 && <Badge>{count} available</Badge>}
        </Heading>
        <Button
          variant="soft"
          disabled={busy}
          loading={busy}
          onClick={() => void checkNow()}
        >
          Check for updates
        </Button>
      </Flex>
      <Button
        variant="soft"
        onClick={() =>
          onReviewWithAgent(
            "Set up a workspace update assistant using the templates skill, workspace-updates reference, and the watch automation action. Check every six hours in this conversation, without requiring an open chat panel. Wake only for unannounced updates; notify me and ask how I want to proceed. Do not merge, publish, or install updates without my decision. Inspect existing automations first to avoid duplicates.",
          )
        }
      >
        Set up update assistant
      </Button>
      <Text color="gray">
        Enable the update assistant to check sources automatically without
        keeping a chat panel open. An agent reviews incoming changes,
        understands your local edits, and prepares a tested proposal for your
        approval.
      </Text>
      {error && (
        <Callout.Root color="red">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}
      {restoreError && (
        <Text role="alert" color="red">
          {restoreError}
        </Text>
      )}
      {!sources.length && (
        <Text>No template source is recorded for this workspace.</Text>
      )}
      <div className="workspace-source-grid">
        {sources
          .filter((source) => source.relationship !== "transitive")
          .sort(
            (a, b) =>
              Number(b.relationship === "upstream") -
              Number(a.relationship === "upstream"),
          )
          .map(sourceCard)}
      </div>
      {sources.some((source) => source.relationship === "transitive") && (
        <details>
          <summary>
            Supporting dependencies (
            {
              sources.filter((source) => source.relationship === "transitive")
                .length
            }
            )
          </summary>
          <Text as="p" size="2" color="gray" mb="3">
            The agent will check parent-template constraints before updating
            these.
          </Text>
          <div className="workspace-source-grid">
            {sources
              .filter((source) => source.relationship === "transitive")
              .map(sourceCard)}
          </div>
        </details>
      )}
    </Flex>
  );
}
