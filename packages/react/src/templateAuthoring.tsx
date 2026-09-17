import {
  TemplateRepositoryChoice,
  type TemplateRepositoryChoiceValue,
} from "./templateRepositoryChoice.js";
import type { StoredCredentialSummary } from "@vibestudio/credential-client";
import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Callout,
  Card,
  Checkbox,
  Flex,
  Heading,
  Spinner,
  Text,
  TextField,
} from "@radix-ui/themes";
import {
  templateAuthoringInspectionSchema,
  templatePublicationSchema,
  templatesMethods,
  type TemplateAuthoringInspection,
  type TemplatePublication,
  type TemplatesClient,
} from "@vibestudio/service-schemas/templates";
import "./templateAuthoring.css";

type PublicationRequest = Parameters<TemplatesClient["publishAuthoring"]>[0];
type Draft = { plan: TemplateAuthoringInspection; request: PublicationRequest };
type Setup = Awaited<ReturnType<TemplatesClient["authoringSetup"]>>;
function githubUpstream(setup: Setup) {
  if (!setup.upstream) return null;
  const url = new URL(setup.upstream.url.replace(/^git\+/, ""));
  const [owner, name] = url.pathname.slice(1).split("/");
  return url.hostname === "github.com" && owner && name
    ? {
        owner,
        name: name.replace(/\.git$/, ""),
        credential: setup.upstream.credential,
      }
    : null;
}

export function TemplateAuthoring({
  client,
  workspaceId,
  listAccounts,
  onPublished,
}: {
  client: TemplatesClient;
  workspaceId: string;
  onPublished?: () => Promise<void>;
  listAccounts?: () => Promise<StoredCredentialSummary[]>;
}) {
  const key = `template-publication:${workspaceId}`;
  const [setup, setSetup] = useState<Setup | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repository, setRepository] = useState<TemplateRepositoryChoiceValue>({
    owner: "",
    name: "",
    private: true,
    mode: "new",
  });
  const [version, setVersion] = useState("");
  const [versionStatus, setVersionStatus] = useState("");
  const [versionBusy, setVersionBusy] = useState(false);
  const [versionError, setVersionError] = useState("");
  const [versionRefresh, setVersionRefresh] = useState(0);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [result, setResult] = useState<TemplatePublication | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    setError(null);
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) {
        const value = JSON.parse(saved) as Draft;
        const plan = templateAuthoringInspectionSchema.parse(value.plan);
        const [request] = templatesMethods.publishAuthoring.args.parse([
          value.request,
        ]);
        if (request.expectedFingerprint !== plan.fingerprint)
          throw new Error(
            "Saved publication review is invalid; review the selection again.",
          );
        setDraft({ plan, request });
      }
    } catch (cause) {
      setError(String(cause));
    }
    void client
      .authoringSetup()
      .then((value) => {
        if (!active) return;
        setSetup(value);
        setName(value.name);
        setDescription(value.description);
        setSelected(
          value.parts
            .filter((part) => part.ownership === "authored")
            .map((part) => part.repoPath),
        );
        const upstream = githubUpstream(value);
        setRepository({
          owner: upstream?.owner ?? "",
          name: upstream?.name ?? "",
          private: true,
          mode: upstream ? "upstream" : "new",
        });
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [client, key, reload]);
  useEffect(() => {
    let active = true;
    setVersion("");
    setVersionError("");
    setVersionStatus("");
    setVersionBusy(false);
    if (repository.mode === "new") {
      setVersion("1.0.0");
      setVersionStatus("First release of a new repository.");
      return;
    }
    if (
      !repository.owner ||
      !repository.name ||
      (listAccounts && !repository.credentialId)
    )
      return;
    setVersionBusy(true);
    void client
      .publicationVersion({
        owner: repository.owner,
        name: repository.name,
        credentialId: repository.credentialId,
      })
      .then((value) => {
        if (!active) return;
        setVersion(value.suggested);
        setVersionStatus(
          value.latest
            ? `Next patch release after ${value.latest}.`
            : "No stable releases yet. Start with 1.0.0.",
        );
      })
      .catch((cause) => {
        if (active) setVersionError(String(cause));
      })
      .finally(() => {
        if (active) setVersionBusy(false);
      });
    return () => {
      active = false;
    };
  }, [
    client,
    repository.owner,
    repository.name,
    repository.mode,
    repository.credentialId,
    listAccounts,
    versionRefresh,
  ]);
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
          ...(repository.mode === "new"
            ? {
                creation: {
                  private: repository.private,
                  description: description.trim(),
                },
              }
            : {}),
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
      await onPublished?.();
    });
  const upstream = setup ? githubUpstream(setup) : null;
  const inherited =
    setup?.parts.filter((part) => part.ownership === "inherited") ?? [];
  const authored =
    setup?.parts.filter((part) => part.ownership === "authored") ?? [];
  const removed = authored.filter((part) => !selected.includes(part.repoPath));
  const toggle = (repoPath: string, checked: boolean) =>
    setSelected((previous) =>
      checked
        ? [...new Set([...previous, repoPath])]
        : previous.filter((item) => item !== repoPath),
    );
  const partRows = (parts: Setup["parts"]) =>
    parts
      .filter((part) =>
        part.repoPath.toLowerCase().includes(search.toLowerCase()),
      )
      .map((part) => (
        <label className="publication-part" key={part.repoPath}>
          <Checkbox
            checked={selected.includes(part.repoPath)}
            onCheckedChange={(checked) =>
              toggle(part.repoPath, checked === true)
            }
          />
          <span>
            <Text as="span" size="2">
              {part.repoPath}
            </Text>
            {part.inheritedFrom && (
              <Text
                as="span"
                className="publication-part-source"
                size="1"
                color="gray"
              >
                From {part.inheritedFrom.replace(/^git\+/, "")}
              </Text>
            )}
          </span>
          {part.ownership === "inherited" &&
            selected.includes(part.repoPath) && (
              <Badge color="amber">Override</Badge>
            )}
        </label>
      ));
  return (
    <Flex className="template-publication" direction="column" gap="4">
      <div>
        <Badge color="gray">
          {draft ? "Review release" : "Template publishing"}
        </Badge>
        <Heading size="6" mt="2">
          {setup?.name ? `Publish ${setup.name}` : "Publish your workspace"}
        </Heading>
        <Text as="p" size="2" color="gray" mt="2">
          {upstream
            ? "Your template, ready for its next release."
            : "Share your workspace as a reusable template."}
        </Text>
      </div>
      {error && (
        <Callout.Root color="red" role="alert">
          <Callout.Text>{error}</Callout.Text>
          {!setup && (
            <Button onClick={() => setReload((value) => value + 1)}>
              Try again
            </Button>
          )}
        </Callout.Root>
      )}
      {result ? (
        <Card>
          <Heading size="4">Template published</Heading>
          <Text as="p">
            {result.destination.owner}/{result.destination.name} · {result.ref}
          </Text>
          <a href={result.webUrl} target="_blank" rel="noreferrer">
            View repository
          </a>
          <Button
            mt="3"
            onClick={() => {
              setResult(null);
              setSetup(null);
              setReload((value) => value + 1);
            }}
          >
            Publish another release
          </Button>
        </Card>
      ) : draft ? (
        <Card className="publication-section">
          <Flex direction="column" gap="3">
            <Heading size="4">Review complete release</Heading>
            <Text weight="bold">
              {draft.request.destination.owner}/{draft.request.destination.name}
            </Text>
            <Badge>{draft.request.version}</Badge>
            <Text size="2">
              {draft.request.creation
                ? `Create a ${draft.request.creation.private ? "private" : "public"} repository if it does not exist.`
                : "Update this existing repository. Its visibility stays unchanged."}{" "}
              Publishing replaces the complete file tree with this release and
              retains Git history.
            </Text>
            <Text size="2">
              {draft.plan.includedParts.length} included units. Required local
              dependencies are included automatically.
            </Text>
            <details>
              <summary>Included files and template manifest</summary>
              <ul className="publication-paths">
                {draft.plan.includedParts.map((part) => (
                  <li key={part}>{part}</li>
                ))}
              </ul>
              <pre>{draft.plan.manifest}</pre>
            </details>
            <Flex className="publication-actions" gap="2">
              <Button
                disabled={busy}
                loading={busy}
                onClick={() => void publish()}
              >
                Publish template
              </Button>
              <Button
                variant="soft"
                disabled={busy}
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
      ) : !setup ? (
        <Flex role="status" gap="2" align="center">
          <Spinner />
          Reading template metadata…
        </Flex>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void inspect();
          }}
        >
          <fieldset disabled={busy} className="publication-fields">
            <div className="publication-layout">
              <Flex direction="column" gap="4">
                <Card className="publication-section">
                  <Heading size="3" mb="3">
                    Where to publish
                  </Heading>
                  <TemplateRepositoryChoice
                    client={client}
                    value={repository}
                    onChange={setRepository}
                    listAccounts={listAccounts}
                    upstream={upstream}
                  />
                </Card>
                <Card className="publication-section">
                  <Heading size="3">What’s included</Heading>
                  <Text as="p" size="2" mt="2">
                    {selected.length} selected units from this workspace. Its
                    declared contents are selected for you.
                  </Text>
                  <Text as="p" size="2" color="gray" mt="2">
                    {inherited.length} inherited units stay in their
                    dependencies unless you explicitly publish an override.
                  </Text>
                  {setup.dependencies.length > 0 && (
                    <div className="publication-dependencies">
                      {setup.dependencies.map((item) => (
                        <Badge key={item.url} color="gray">
                          {item.url
                            .replace(/^git\+/, "")
                            .replace(/^https:\/\/github.com\//, "")
                            .replace(/\.git$/, "")}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {setup.parts.some(
                    (part) => part.ownership === "unlisted",
                  ) && (
                    <Text as="p" size="2" color="gray" mt="2">
                      Additional workspace units are not declared by this
                      template. Review them under Customize included units to
                      include them.
                    </Text>
                  )}
                  {removed.length > 0 && (
                    <Callout.Root color="amber" mt="3">
                      <Callout.Text>
                        {removed.length} declared units are excluded. Publishing
                        removes them from the destination unless required by
                        another selected unit.
                      </Callout.Text>
                    </Callout.Root>
                  )}
                  <details>
                    <summary>Customize included units</summary>
                    <TextField.Root
                      aria-label="Find units"
                      placeholder="Find a unit…"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="soft"
                      mt="3"
                      onClick={() =>
                        setSelected(authored.map((part) => part.repoPath))
                      }
                    >
                      Restore declared contents
                    </Button>
                    <Heading size="2" mt="4">
                      Owned by this template
                    </Heading>
                    {partRows(authored)}
                    {setup.parts.some(
                      (part) => part.ownership === "unlisted",
                    ) && (
                      <>
                        <Heading size="2" mt="4">
                          Additional workspace units
                        </Heading>
                        <Text size="1" color="gray">
                          Not declared by this template. Include only what
                          belongs in this release.
                        </Text>
                        {partRows(
                          setup.parts.filter(
                            (part) => part.ownership === "unlisted",
                          ),
                        )}
                      </>
                    )}
                    {inherited.length > 0 && (
                      <details>
                        <summary>
                          Override a dependency unit ({inherited.length})
                        </summary>
                        <Text size="2" color="gray">
                          This copies the whole unit into your template as an
                          explicit override.
                        </Text>
                        {partRows(inherited)}
                      </details>
                    )}
                  </details>
                </Card>
              </Flex>
              <Flex direction="column" gap="4">
                <Card className="publication-section">
                  <Heading size="3" mb="3">
                    Release details
                  </Heading>
                  <Flex direction="column" gap="3">
                    <label>
                      Template name
                      <TextField.Root
                        aria-label="Template name"
                        required
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </label>
                    <label>
                      Description
                      <TextField.Root
                        aria-label="Description"
                        required
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                      />
                    </label>
                  </Flex>
                </Card>
                <Card className="publication-section">
                  <Heading size="3">Release version</Heading>
                  {versionBusy ? (
                    <Flex gap="2" mt="3" role="status">
                      <Spinner />
                      Checking repository tags…
                    </Flex>
                  ) : (
                    <Text as="p" size="6" weight="bold" mt="3">
                      {version || "Choose a destination"}
                    </Text>
                  )}
                  <Text as="p" size="2" color="gray" mt="2">
                    {versionStatus}
                  </Text>
                  {versionError && (
                    <Text as="p" size="2" color="red" role="alert">
                      Couldn’t check release tags: {versionError}
                    </Text>
                  )}
                  {repository.mode !== "new" && (
                    <Button
                      type="button"
                      variant="ghost"
                      mt="3"
                      disabled={versionBusy}
                      onClick={() => setVersionRefresh((value) => value + 1)}
                    >
                      Check tags again
                    </Button>
                  )}
                  <details>
                    <summary>Set a different version</summary>
                    <Text size="2" color="gray">
                      Use a minor version for new features, or a major version
                      for breaking changes.
                    </Text>
                    <TextField.Root
                      aria-label="Version"
                      required
                      value={version}
                      disabled={versionBusy}
                      pattern="v?[0-9]+(\.[0-9]+){0,2}([-\.][A-Za-z0-9]+)*"
                      onChange={(event) => setVersion(event.target.value)}
                    />
                  </details>
                </Card>
              </Flex>
            </div>
            <Flex
              className="publication-actions"
              justify="between"
              align="center"
              gap="3"
            >
              <Text size="2" color="gray">
                Review before anything is published.
              </Text>
              <Button
                type="submit"
                size="3"
                loading={busy}
                disabled={
                  busy ||
                  versionBusy ||
                  !version ||
                  !name.trim() ||
                  !description.trim() ||
                  !repository.owner.trim() ||
                  !repository.name.trim() ||
                  (!!listAccounts && !repository.credentialId)
                }
              >
                Review release
              </Button>
            </Flex>
          </fieldset>
        </form>
      )}
    </Flex>
  );
}
