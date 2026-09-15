import { useEffect, useRef, useState } from "react";
import { Button, Callout, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { templatesMethods } from "@vibestudio/service-schemas/templates";
import type {
  TemplatesClient,
  TemplateInspection,
  TemplateContributionPlan,
  TemplateUpdateReview,
} from "@vibestudio/service-schemas/templates";

type Contribution = { commandId: string; plan: TemplateContributionPlan };
type UpdateRequest = Parameters<TemplatesClient["prepareUpdate"]>[0];
export function TemplateInstalled({
  client,
  workspaceId,
}: {
  client: TemplatesClient;
  workspaceId: string;
}) {
  const key = `template-maintenance:${workspaceId}`;
  const [installed, setInstalled] = useState<TemplateInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("");
  const [parts, setParts] = useState<string[]>([]);
  const [contribution, setContribution] = useState<Contribution | null>(null);
  const [request, setRequest] = useState<UpdateRequest | null>(null);
  const [review, setReview] = useState<TemplateUpdateReview | null>(null);
  const [preview, setPreview] = useState<{
    base: string | null;
    ours: string | null;
    theirs: string | null;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    void client
      .installed()
      .then((value) => {
        if (active) {setInstalled(value);setLoading(false);}
      })
      .catch((cause) => {
        if (active) {setError(String(cause));setLoading(false);}
      });
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) {
        const value = JSON.parse(saved) as {
          contribution: Contribution | null;
          request: UpdateRequest | null;
        };
        setContribution(
          value.contribution
            ? templatesMethods.suggestContribution.args.parse([
                value.contribution,
              ])[0]
            : null,
        );
        setRequest(
          value.request
            ? templatesMethods.prepareUpdate.args.parse([value.request])[0]
            : null,
        );
      }
    } catch (cause) {
      setError(String(cause));
    }
    return () => {
      active = false;
    };
  }, [client, key]);
  const save = (
    nextContribution: Contribution | null,
    nextRequest: UpdateRequest | null,
  ) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({ contribution: nextContribution, request: nextRequest }),
    );
    setContribution(nextContribution);
    setRequest(nextRequest);
  };
  const selected = installed.find((item) => item.pin.url === source);
  return (
    <Flex direction="column" gap="4">
      <Heading size="5">Installed templates</Heading>
      <Text>
        Contribute selected units to their source repository, or review an
        upstream update in this workspace.
      </Text>
      {error && (
        <Callout.Root role="alert" color="red">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}
      {message && <Text role="status">{message}</Text>}
      {loading && <Text role="status">Loading installed templates…</Text>}
      {!loading && !installed.length && (
        <Text>
          No installed template sources are recorded in this workspace.
        </Text>
      )}
      {!!installed.length && !request && !contribution && (
        <>
          <label style={{display:"flex",flexDirection:"column",gap:6}}>
            Template source{" "}
            <select
              style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid var(--gray-7)",background:"var(--color-surface)",color:"var(--gray-12)",font:"inherit"}}
              aria-label="Template source"
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
                setParts([]);
              }}
            >
              <option value="">Choose a template</option>
              {installed.map((item) => (
                <option key={item.pin.url} value={item.pin.url}>
                  {item.presentation?.name ?? item.pin.url}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <Card>
              <Flex direction="column" gap="3">
                <Text>{selected.pin.url}</Text>
                <Text size="2">Installed commit: {selected.pin.commit}</Text>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const next = {
                        commandId: crypto.randomUUID(),
                        sourceUrl: source,
                      };
                      save(null, next);
                      setReview(await client.prepareUpdate(next));
                    })
                  }
                >
                  Review latest update
                </Button>
                <Heading size="3">Contribute units</Heading>
                <Text size="2">
                  The selected units are proposed on a contribution branch. The
                  source template’s manifest and other units remain as they are.
                  To change the complete release, use Publish in a workspace
                  opened directly from that template.
                </Text>
                <Flex
                  direction="column"
                  style={{ maxHeight: 320, overflow: "auto" }}
                >
                  {selected.repositories
                    .filter((part) => part !== "meta")
                    .map((part) => (
                      <label key={part}>
                        <input
                          type="checkbox"
                          checked={parts.includes(part)}
                          onChange={(event) =>
                            setParts(
                              event.target.checked
                                ? [...parts, part]
                                : parts.filter((value) => value !== part),
                            )
                          }
                        />
                        {part}
                      </label>
                    ))}
                </Flex>
                <Button
                  disabled={busy || !parts.length}
                  onClick={() =>
                    void run(async () => {
                      const plan = await client.inspectContribution({
                        sourceUrl: source,
                        parts,
                      });
                      save({ commandId: crypto.randomUUID(), plan }, null);
                    })
                  }
                >
                  Review contribution
                </Button>
              </Flex>
            </Card>
          )}
        </>
      )}
      {contribution && (
        <Card>
          <Flex direction="column" gap="3">
            <Heading size="3">Review contribution</Heading>
            <Text>Destination: {contribution.plan.source.url}</Text>
            <Text>Based on commit {contribution.plan.source.commit}</Text>
            <pre>{contribution.plan.parts.join("\n")}</pre>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await client.suggestContribution(contribution);
                  setMessage(
                    result.outcome === "nothing-to-suggest"
                      ? "The selected units have no changes to contribute."
                      : `Contribution available on branch ${result.branch}.`,
                  );
                  save(null, null);
                })
              }
            >
              Push contribution branch
            </Button>
            <Button
              variant="soft"
              disabled={busy}
              onClick={() => save(null, null)}
            >
              Close review
            </Button>
          </Flex>
        </Card>
      )}
      {request && !review && (
        <Button
          disabled={busy}
          onClick={() =>
            void run(async () => setReview(await client.prepareUpdate(request)))
          }
        >
          Resume update review
        </Button>
      )}
      {request && review?.status !== "published" && (
        <Button
          variant="soft"
          disabled={busy}
          onClick={() => {
            save(null, null);
            setReview(null);
            setPreview(null);
          }}
        >
          Close update review
        </Button>
      )}
      {review && (
        <Card>
          <Flex direction="column" gap="3">
            <Heading size="3">
              {review.status === "published"
                ? "Update applied"
                : "Review template update"}
            </Heading>
            <Text>{review.sourceUrl}</Text>
            <Text size="2">Incoming commit: {review.target.commit}</Text>
            <Text>
              Local edits are merged with the upstream changes. Conflicting
              changes require your choice before the update can be applied.
            </Text>
            <ul>
              {review.repositories.map((repo) => (
                <li key={repo.repoPath}>
                  {repo.kind}: {repo.repoPath}
                </li>
              ))}
            </ul>
            {review.conflicts.map((conflict) => {
              const coordinate = conflict.coordinate.coordinate;
              const fullPath =
                coordinate.paths.ours ??
                coordinate.paths.theirs ??
                coordinate.paths.base;
              const filePath = fullPath?.startsWith(`${conflict.repoPath}/`)
                ? fullPath.slice(conflict.repoPath.length + 1)
                : undefined;
              return (
                <Card key={`${conflict.deltaId}:${coordinate.id}`}>
                  <Flex direction="column" gap="2">
                    <Text weight="bold">
                      {conflict.repoPath}:{" "}
                      {filePath ?? conflict.coordinate.summary}
                    </Text>
                    <Text>{conflict.coordinate.summary}</Text>
                    <Flex gap="2" wrap="wrap">
                      {coordinate.kind === "file" && filePath && (
                        <Button
                          variant="soft"
                          disabled={busy}
                          onClick={() =>
                            void run(async () =>
                              setPreview(
                                await client.readUpdateFile({
                                  operationId: review.operationId,
                                  repoPath: conflict.repoPath,
                                  path: filePath,
                                }),
                              ),
                            )
                          }
                        >
                          View versions
                        </Button>
                      )}
                      {(["ours", "theirs"] as const).map((resolution) => (
                        <Button
                          key={resolution}
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              setReview(
                                await client.resolveUpdate({
                                  operationId: review.operationId,
                                  deltaId: conflict.deltaId,
                                  coordinate: {
                                    kind: coordinate.kind,
                                    id: coordinate.id,
                                  },
                                  resolution,
                                }),
                              );
                              setPreview(null);
                            })
                          }
                        >
                          {resolution === "ours"
                            ? "Keep local"
                            : "Use incoming"}
                        </Button>
                      ))}
                    </Flex>
                  </Flex>
                </Card>
              );
            })}
            {preview && (
              <Flex gap="3" wrap="wrap">
                {(["base", "ours", "theirs"] as const).map((side) => (
                  <Card key={side} style={{ flex: 1, minWidth: 220 }}>
                    <Heading size="2">
                      {side === "base"
                        ? "Previous version"
                        : side === "ours"
                          ? "Local version"
                          : "Incoming version"}
                    </Heading>
                    <pre
                      style={{
                        overflow: "auto",
                        maxHeight: 360,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {preview[side] ?? "File absent"}
                    </pre>
                  </Card>
                ))}
              </Flex>
            )}
            {review.status !== "published" && (
              <Button
                disabled={busy || !!review.conflicts.length}
                onClick={() =>
                  void run(async () =>
                    setReview(
                      await client.publishUpdate({
                        operationId: review.operationId,
                      }),
                    ),
                  )
                }
              >
                Apply reviewed update
              </Button>
            )}
            {review.status === "published" && (
              <Button
                onClick={() => {
                  save(null, null);
                  setReview(null);
                  void run(async () => setInstalled(await client.installed()));
                }}
              >
                Done
              </Button>
            )}
          </Flex>
        </Card>
      )}
    </Flex>
  );
}
