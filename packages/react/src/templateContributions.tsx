import { useRef, useState } from "react";
import {
  Button,
  Card,
  Flex,
  Heading,
  Text,
  TextField,
  Callout,
} from "@radix-ui/themes";
import {
  templatesMethods,
  type TemplatesClient,
} from "@vibestudio/service-schemas/templates";
import { useTemplateDraft } from "./templateDraft";

type Source = Awaited<ReturnType<TemplatesClient["installed"]>>[number];
type Contribution = Parameters<TemplatesClient["suggestContribution"]>[0];
export function TemplateContributions({
  client,
  workspaceId,
  sources,
}: {
  client: TemplatesClient;
  workspaceId: string;
  sources: Source[];
}) {
  const [selected, setSelected] = useState<Source | null>(() => {
    const dependencies = sources.filter(
      (item) => item.relationship !== "upstream",
    );
    return dependencies.length === 1 ? dependencies[0]! : null;
  });
  const [search, setSearch] = useState("");
  const [parts, setParts] = useState<string[]>([]);
  const [contribution, setContribution, restoreError] =
    useTemplateDraft<Contribution>(
      workspaceId,
      "contribution",
      (value) => templatesMethods.suggestContribution.args.parse([value])[0],
    );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(String(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Flex direction="column" gap="3" className="workspace-maintenance">
      <Text color="gray">
        Suggest changes to a dependency on a separate contribution branch.
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
      {message && <Text role="status">{message}</Text>}
      {!contribution && (
        <Flex gap="2" wrap="wrap">
          {sources
            .filter((item) => item.relationship !== "upstream")
            .map((item) => (
              <Button
                key={item.pin.url}
                variant={selected?.pin.url === item.pin.url ? "solid" : "soft"}
                disabled={busy}
                onClick={() => {
                  setSelected(item);
                  setParts([]);
                }}
              >
                {item.presentation?.name ?? item.pin.url}
              </Button>
            ))}
        </Flex>
      )}
      {selected && !contribution && (
        <Card>
          <Flex direction="column" gap="3">
            <Heading size="3">Contribute units</Heading>
            <Text size="2">
              The selected units are proposed on a contribution branch. The
              source template’s manifest and other units remain as they are. To
              change the complete release, use Publish in a workspace opened
              directly from that template.
            </Text>
            <TextField.Root
              aria-label="Find contribution units"
              placeholder="Find a unit…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Flex direction="column">
              {selected.repositories
                .filter(
                  (part) =>
                    part !== "meta" &&
                    part.toLowerCase().includes(search.toLowerCase()),
                )
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
                    sourceUrl: selected.pin.url,
                    parts,
                  });
                  setContribution({ commandId: crypto.randomUUID(), plan });
                })
              }
            >
              Review contribution
            </Button>
          </Flex>
        </Card>
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
                  setContribution(null);
                })
              }
            >
              Push contribution branch
            </Button>
            <Button
              variant="soft"
              disabled={busy}
              onClick={() => setContribution(null)}
            >
              Close review
            </Button>
          </Flex>
        </Card>
      )}
    </Flex>
  );
}
