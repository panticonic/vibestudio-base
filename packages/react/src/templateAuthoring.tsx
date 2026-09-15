import {
  TemplateRepositoryChoice,
  type TemplateRepositoryChoiceValue,
} from "./templateRepositoryChoice.js";
import type { StoredCredentialSummary } from "@vibestudio/credential-client";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Text,
  TextField,
} from "@radix-ui/themes";
import {
  templateAuthoringInspectionSchema,
  templatePublicationSchema,
  templatesMethods,
} from "@vibestudio/service-schemas/templates";
import type {
  TemplateAuthoringInspection,
  TemplatePublication,
  TemplatesClient,
} from "@vibestudio/service-schemas/templates";

type PublicationRequest = Parameters<TemplatesClient["publishAuthoring"]>[0];
type Draft = { plan: TemplateAuthoringInspection; request: PublicationRequest };

/** Publication always acts on the current workspace and an explicitly reviewed complete selection. */
export function TemplateAuthoring({
  client,
  workspaceId,
  listAccounts,
}: {
  client: TemplatesClient;
  workspaceId: string;
  listAccounts?: () => Promise<StoredCredentialSummary[]>;
}) {
  const key = `template-publication:${workspaceId}`;
  const [parts, setParts] = useState<
    Awaited<ReturnType<TemplatesClient["authoringParts"]>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repository, setRepository] = useState<TemplateRepositoryChoiceValue>({
    owner: "",
    name: "",
    private: true,
  });
  const [version, setVersion] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [result, setResult] = useState<TemplatePublication | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) {
        const value = JSON.parse(saved) as Draft;
        const plan = templateAuthoringInspectionSchema.parse(value.plan);
        const [request] = templatesMethods.publishAuthoring.args.parse([
          value.request,
        ]);
        if (
          !value.request?.commandId ||
          value.request.expectedFingerprint !== plan.fingerprint
        )
          throw new Error(
            "Saved publication review is invalid; review the selection again.",
          );
        setDraft({ plan, request });
      }
    } catch (cause) {
      setError(String(cause));
    }
    void client
      .authoringParts()
      .then((value) => {
        if (active) {
          setParts(value);
          setLoading(false);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(String(cause));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [client, key]);
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const inspect = () =>
    run(async () => {
      const plan = await client.inspectAuthoring({
        name: name.trim(),
        description: description.trim(),
        parts: selected,
      });
      const captured: Draft = {
        plan,
        request: {
          commandId: crypto.randomUUID(),
          intent: plan.request,
          expectedFingerprint: plan.fingerprint,
          version: version.trim(),
          destination: {
            provider: "github",
            owner: repository.owner.trim(),
            name: repository.name.trim(),
          },
          creation: {
            private: repository.private,
            description: description.trim(),
          },
          ...(repository.credentialId
            ? { credentialId: repository.credentialId }
            : {}),
        },
      };
      window.localStorage.setItem(key, JSON.stringify(captured));
      setDraft(captured);
    });
  const publish = () =>
    run(async () => {
      if (!draft) return;
      const publication = templatePublicationSchema.parse(
        await client.publishAuthoring(draft.request),
      );
      setResult(publication);
      window.localStorage.removeItem(key);
      setDraft(null);
    });
  return (
    <Flex direction="column" gap="4">
      <Heading size="5">Publish this workspace as a template</Heading>
      <Text>
        Choose the complete set of parts for this release. Parts supplied by
        dependencies remain dependencies.
      </Text>
      {error && (
        <Callout.Root color="red" role="alert">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}
      {result ? (
        <Card>
          <Heading size="3">Template published</Heading>
          <Text as="p">
            {result.destination.owner}/{result.destination.name} · {result.ref}
          </Text>
          <a href={result.webUrl} target="_blank" rel="noreferrer">
            View repository
          </a>
          <Text as="p">{result.commit}</Text>
          <Button onClick={() => setResult(null)}>
            Publish another release
          </Button>
        </Card>
      ) : draft ? (
        <Card>
          <Flex direction="column" gap="3">
            <Heading size="3">Review complete release</Heading>
            <Text>
              {draft.request.destination.owner}/{draft.request.destination.name}{" "}
              · {draft.request.version} ·{" "}
              {draft.request.creation?.private ? "Private" : "Public"} when
              creating a repository
            </Text>
            <Text>
              Publishing replaces the destination’s complete file tree with this
              release and retains its Git history. Existing repository
              visibility stays unchanged.
            </Text>
            <ul>
              {draft.plan.includedParts.map((part) => (
                <li key={part}>{part}</li>
              ))}
            </ul>
            <details>
              <summary>Template manifest</summary>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {draft.plan.manifest}
              </pre>
            </details>
            <Flex gap="2">
              <Button disabled={busy} onClick={() => void publish()}>
                {busy ? "Publishing…" : "Publish template"}
              </Button>
              <Button
                disabled={busy}
                variant="soft"
                onClick={() => {
                  window.localStorage.removeItem(key);
                  setDraft(null);
                }}
              >
                Change selection
              </Button>
            </Flex>
          </Flex>
        </Card>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void inspect();
          }}
        >
          <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
            <Flex direction="column" gap="3">
              <label
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                Template name
                <TextField.Root
                  aria-label="Template name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                Description
                <TextField.Root
                  aria-label="Description"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <TemplateRepositoryChoice
                client={client}
                value={repository}
                onChange={setRepository}
                listAccounts={listAccounts}
              />
              <label
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                Version
                <TextField.Root
                  aria-label="Version"
                  required
                  placeholder="1.0.0"
                  pattern="v?[0-9]+(\.[0-9]+){0,2}([-\.][A-Za-z0-9]+)*"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                />
              </label>
              <Flex gap="2">
                <Button
                  type="button"
                  variant="soft"
                  onClick={() =>
                    setSelected(parts.map((part) => part.repoPath))
                  }
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="soft"
                  onClick={() => setSelected([])}
                >
                  Clear selection
                </Button>
              </Flex>
              {loading && <Text role="status">Loading workspace units…</Text>}
              {!loading && !parts.length && !error && (
                <Text>No local units are available for publication.</Text>
              )}
              <div style={{ maxHeight: 320, overflow: "auto" }}>
                {parts.map((part) => (
                  <label key={part.repoPath} style={{ display: "block" }}>
                    <input
                      type="checkbox"
                      checked={selected.includes(part.repoPath)}
                      onChange={(event) =>
                        setSelected((previous) =>
                          event.target.checked
                            ? [...previous, part.repoPath]
                            : previous.filter(
                                (value) => value !== part.repoPath,
                              ),
                        )
                      }
                    />
                    {part.repoPath}
                  </label>
                ))}
              </div>
              <Button type="submit" disabled={!selected.length || busy}>
                {busy ? "Preparing review…" : "Review release"}
              </Button>
            </Flex>
          </fieldset>
        </form>
      )}
    </Flex>
  );
}
