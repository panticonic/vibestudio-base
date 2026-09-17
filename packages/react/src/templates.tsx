import { useEffect, useRef, useState } from "react";
import {
  CubeIcon,
  PlusIcon,
  GitHubLogoIcon,
  ArchiveIcon,
  ArrowRightIcon,
  CheckIcon,
} from "@radix-ui/react-icons";
import "./templates.css";
import {
  pendingAuthorityNotice,
  isAuthorityPending,
} from "@vibestudio/shared/authority/reviewPending";
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Grid,
  Heading,
  Text,
  TextField,
  RadioCards,
  Select,
  Spinner,
} from "@radix-ui/themes";
import type {
  TemplateRegistry,
  TemplateExactPin,
  TemplateInspection,
  TemplateLocator,
} from "@vibestudio/service-schemas/templates";
import {
  DEFAULT_TEMPLATE_REGISTRY_URL,
  sameWorkspaceTemplatePin,
} from "@vibestudio/service-schemas/templates";
import type { TemplateManagementClient } from "@workspace/template-management";

import type { StoredCredentialSummary } from "@vibestudio/credential-client/types";
import { findMatchingUrlAudience } from "@vibestudio/credential-client/urlAudience";

type BrowserClient = Pick<TemplateManagementClient, "inspect"> &
  Partial<Pick<TemplateManagementClient, "registry">>;
export type CreateTemplateWorkspace = (
  name: string,
  pin: TemplateExactPin,
  purpose?: "use" | "author",
) => Promise<void>;
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const sourceAddress = (pin: TemplateExactPin) => pin.url.replace(/^git\+/, "");

function WorkspaceSteps({ review = false }: { review?: boolean }) {
  return (
    <ol className="workspace-steps" aria-label="Workspace setup progress">
      <li aria-current={!review ? "step" : undefined}>
        <span>{review ? <CheckIcon /> : "1"}</span>Choose a starting point
      </li>
      <li aria-current={review ? "step" : undefined}>
        <span>2</span>Make it yours
      </li>
    </ol>
  );
}

function TemplateRequestError({
  error,
  onReviewPending,
  onRetry,
}: {
  error: unknown;
  onReviewPending?: (approvalId: string) => void;
  onRetry: () => void;
}) {
  const review = pendingAuthorityNotice(error);
  const awaitingReview = isAuthorityPending(error);
  if (!error) return null;
  return (
    <Callout.Root
      color={awaitingReview ? "amber" : "red"}
      role={awaitingReview ? "status" : "alert"}
    >
      <Callout.Text>
        {awaitingReview
          ? (review?.message ?? "A workspace setup review is waiting for you.")
          : errorMessage(error)}
      </Callout.Text>
      {awaitingReview && (
        <Flex direction="column" gap="2">
          {review && onReviewPending ? (
            <Button onClick={() => onReviewPending(review.approvalId)}>
              {review.kind === "acquisition" ? "Open approval" : "Open review"}
            </Button>
          ) : (
            <Text size="2">
              Open Approvals to finish this review, then check again.
            </Text>
          )}
          <Button variant="soft" onClick={onRetry}>
            Check again
          </Button>
        </Flex>
      )}
    </Callout.Root>
  );
}

/** The exact reviewed pin is captured with the name before creating anything. */
export function TemplateWorkspaceReview({
  inspection,
  onCreate,
  onBack,
}: {
  inspection: TemplateInspection;
  onCreate: CreateTemplateWorkspace;
  onBack?: () => void;
}) {
  const [name, setName] = useState(
    () =>
      (inspection.presentation?.name ?? "new-workspace")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "new-workspace",
  );
  const [purpose, setPurpose] = useState<"use" | "author">("use");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const create = async () => {
    if (pending.current || !/^[A-Za-z0-9_-]+$/.test(name.trim())) return;
    pending.current = true;
    setCreating(true);
    setError(null);
    const selectedName = name.trim();
    const selectedPin = { ...inspection.pin };
    try {
      await onCreate(selectedName, selectedPin, purpose);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setCreating(false);
    }
  };
  return (
    <Flex
      className="workspace-setup"
      direction="column"
      gap="4"
      style={{ minWidth: 0 }}
    >
      <WorkspaceSteps review />
      <Box>
        <Badge color="gray" variant="soft">
          Selected template
        </Badge>
        <Heading size="5" mt="2">
          {inspection.presentation?.name ?? "Make this workspace yours"}
        </Heading>
        {inspection.presentation?.description ? (
          <Text as="p" color="gray" size="2" mt="2">
            {inspection.presentation.description}
          </Text>
        ) : null}
      </Box>
      <div className="workspace-review-layout">
        <Flex direction="column" gap="4">
          <label>
            <Text as="div" size="2" weight="medium" mb="2">
              Workspace name
            </Text>
            <TextField.Root
              aria-label="Workspace name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={creating}
              size="3"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="workspace-name-hint"
            />
            <Text
              as="div"
              id="workspace-name-hint"
              size="1"
              color="gray"
              mt="2"
            >
              Letters, numbers, hyphens and underscores.
            </Text>
          </label>
          <Flex direction="column" gap="2">
            <Heading size="3">Your relationship to the template</Heading>
            <RadioCards.Root
              aria-label="Template relationship"
              value={purpose}
              onValueChange={(value) => setPurpose(value as "use" | "author")}
              disabled={creating}
              className="workspace-purpose"
              columns="1"
            >
              <RadioCards.Item value="use">
                <Flex direction="column" gap="2">
                  <Text weight="bold">Use as a dependency (default)</Text>
                  <Text size="2">
                    Build your own workspace on top of this template. Keep it as
                    a dependency and publish your work to your own repository
                    later.
                  </Text>
                </Flex>
              </RadioCards.Item>
              <RadioCards.Item value="author">
                <Flex direction="column" gap="2">
                  <Text weight="bold">Edit the template itself</Text>
                  <Text size="2">
                    Author this template directly. Its repository becomes your
                    upstream. Its own dependencies stay; the template itself is
                    not added as a dependency.
                  </Text>
                </Flex>
              </RadioCards.Item>
            </RadioCards.Root>
          </Flex>
        </Flex>
        <Card className="workspace-summary" variant="surface">
          <Badge variant="soft" color={purpose === "use" ? "green" : "amber"}>
            {purpose === "use" ? "Your own workspace" : "Template authoring"}
          </Badge>
          <Text as="p" size="2" mt="3" mb="4">
            {purpose === "use"
              ? "Your changes belong to this workspace. Choose a separate GitHub repository when you’re ready to publish."
              : "Your changes belong to the selected template. Publishing targets its upstream repository."}
          </Text>
          <Flex direction="column" gap="2" style={{ minWidth: 0 }}>
            <Text size="2" weight="medium">
              Source you’re opening
            </Text>
            <Text as="div" size="2" style={{ overflowWrap: "anywhere" }}>
              {sourceAddress(inspection.pin)}
            </Text>
            <details>
              <summary
                style={{
                  cursor: "pointer",
                  minHeight: 44,
                  alignContent: "center",
                  fontSize: 13,
                }}
              >
                View source details
              </summary>
              <Text
                as="div"
                size="1"
                color="gray"
                style={{ overflowWrap: "anywhere" }}
              >
                {inspection.pin.ref} · {inspection.pin.commit}
              </Text>
              <Text as="div" size="1" mt="2">
                {inspection.repositories.length} source components
              </Text>
              <ul
                style={{
                  margin: "8px 0",
                  paddingInlineStart: 20,
                  maxHeight: 180,
                  overflow: "auto",
                  overflowWrap: "anywhere",
                  fontSize: 12,
                }}
              >
                {inspection.repositories.map((repo) => (
                  <li key={repo}>{repo}</li>
                ))}
              </ul>
              <Text as="div" size="1" mt="3" weight="bold">
                Template dependencies
              </Text>
              {inspection.dependencies.length ? (
                <ul className="workspace-dependencies">
                  {inspection.dependencies.map((dependency) => (
                    <li key={dependency.url}>
                      {dependency.url.replace(/^git\+/, "")}
                    </li>
                  ))}
                </ul>
              ) : (
                <Text as="p" size="1" color="gray">
                  This template declares no dependencies.
                </Text>
              )}
            </details>
          </Flex>
        </Card>
      </div>
      <Text as="p" size="2" color="gray">
        This workspace gets its own panels, files and approvals. Connections to
        your other workspaces are yours to choose.
      </Text>
      {error ? (
        <Callout.Root color="red" role="alert">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      ) : null}
      <Flex className="workspace-actions" gap="3" justify="end">
        {onBack ? (
          <Button
            variant="soft"
            color="gray"
            size="3"
            disabled={creating}
            onClick={onBack}
          >
            Back
          </Button>
        ) : null}
        <Button
          size="3"
          loading={creating}
          disabled={creating || !/^[A-Za-z0-9_-]+$/.test(name.trim())}
          onClick={() => void create()}
        >
          {creating ? "Creating workspace…" : "Create workspace"}
        </Button>
      </Flex>
    </Flex>
  );
}

interface TemplateBrowserProps {
  client: BrowserClient;
  initialPin?: TemplateExactPin;
  initialSourceUrl?: string;
  initialInspection?: TemplateInspection;
  onReviewPending?: (approvalId: string) => void;
  onCreate?: CreateTemplateWorkspace;
  listSourceAccounts?: () => Promise<StoredCredentialSummary[]>;
  onCreateFresh?: (name: string) => Promise<void>;
  onChooseFolder?: () => Promise<TemplateInspection | null>;
  onOpenInApp?: (inspection: TemplateInspection) => Promise<void>;
}

/** Each externally selected source owns one review session and its async work. */
export function TemplateBrowser(props: TemplateBrowserProps) {
  return (
    <WorkspaceSourceSession
      key={JSON.stringify(
        props.initialInspection?.pin ??
          props.initialPin ??
          props.initialSourceUrl ??
          null,
      )}
      {...props}
    />
  );
}

function WorkspaceSourceSession({
  client,
  onCreate,
  onOpenInApp,
  initialPin,
  initialSourceUrl,
  initialInspection,
  onReviewPending,
  onChooseFolder,
  onCreateFresh,
  listSourceAccounts,
}: TemplateBrowserProps) {
  const [accounts, setAccounts] = useState<StoredCredentialSummary[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [registryUrl, setRegistryUrl] = useState(DEFAULT_TEMPLATE_REGISTRY_URL);
  const [registry, setRegistry] = useState<TemplateRegistry | null>(null);
  const [registryError, setRegistryError] = useState<unknown>(null);
  const [loadingRegistry, setLoadingRegistry] = useState(false);
  const registryGeneration = useRef(0);
  const generation = useRef(0);
  const live = useRef(true);
  useEffect(() => {
    if (!listSourceAccounts) return;
    let active = true;
    void listSourceAccounts()
      .then((value) => {
        if (active) setAccounts(value);
      })
      .catch((error) => {
        if (active) setAccountError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [listSourceAccounts]);
  const loadRegistry = async (url?: string) => {
    if (!client.registry) return;
    const operation = ++registryGeneration.current;
    setLoadingRegistry(true);
    setRegistryError(null);
    try {
      const result = await client.registry(url ? { url } : {});
      if (live.current && operation === registryGeneration.current)
        setRegistry(result);
    } catch (error) {
      if (live.current && operation === registryGeneration.current) {
        setRegistryError(error);
      }
    } finally {
      if (live.current && operation === registryGeneration.current)
        setLoadingRegistry(false);
    }
  };
  useEffect(() => {
    void loadRegistry();
  }, [client]);
  const [sourceKind, setSourceKind] = useState(
    initialSourceUrl
      ? "git"
      : client.registry
        ? "templates"
        : onCreateFresh
          ? "fresh"
          : "git",
  );
  const [search, setSearch] = useState("");
  const [freshName, setFreshName] = useState("");
  const [creatingFresh, setCreatingFresh] = useState(false);
  const freshPending = useRef(false);
  const [error, setError] = useState<unknown>(null);
  const lastLocator = useRef<TemplateLocator | null>(null);
  const [url, setUrl] = useState(initialSourceUrl ?? "");
  const [credential, setCredential] = useState("");
  const [currentInspection, setInspection] =
    useState<TemplateInspection | null>(initialInspection ?? null);
  const [inspecting, setInspecting] = useState(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      generation.current += 1;
      registryGeneration.current += 1;
    };
  }, []);
  const inspect = async (locator: TemplateLocator) => {
    lastLocator.current = locator;
    const operation = ++generation.current;
    setInspecting(true);
    setError(null);
    try {
      const result = await client.inspect(locator);
      if (
        "pin" in locator &&
        !sameWorkspaceTemplatePin(result.pin, locator.pin)
      )
        throw new Error(
          "The inspected source does not match the selected workspace. Review the source again.",
        );
      if (live.current && operation === generation.current)
        setInspection(result);
    } catch (error) {
      if (live.current && operation === generation.current) setError(error);
    } finally {
      if (live.current && operation === generation.current)
        setInspecting(false);
    }
  };
  useEffect(() => {
    if (!initialInspection && initialPin) void inspect({ pin: initialPin });
  }, [initialInspection, initialPin, client]);
  if (currentInspection && onCreate)
    return (
      <TemplateWorkspaceReview
        inspection={currentInspection}
        onCreate={onCreate}
        onBack={() => setInspection(null)}
      />
    );
  const canInspect = (() => {
    try {
      return ["https:", "http:"].includes(
        new URL(url.replace(/^git\+/, "")).protocol,
      );
    } catch {
      return false;
    }
  })();
  const availableAccounts = accounts.filter((account) => {
    if (account.revokedAt || account.lifecycle.state === "revoked")
      return false;
    return account.bindings?.some((binding) => {
      if (binding.use !== "git-http") return false;
      if (!url.trim()) return true;
      try {
        return !!findMatchingUrlAudience(
          new URL(url.trim().replace(/^git\+/, "")),
          binding.audience,
        );
      } catch {
        return false;
      }
    });
  });
  const entries = registry?.templates.filter((entry) =>
    `${entry.name} ${entry.description}`
      .toLowerCase()
      .includes(search.toLowerCase().trim()),
  );
  return (
    <Flex className="workspace-setup" direction="column" gap="4">
      <WorkspaceSteps />
      <RadioCards.Root
        value={sourceKind}
        onValueChange={(value) => {
          setSourceKind(value);
          setError(null);
        }}
        className="workspace-source-tabs"
        gap="3"
        aria-label="Workspace starting point"
        disabled={inspecting || creatingFresh}
      >
        {client.registry ? (
          <RadioCards.Item value="templates">
            <CubeIcon aria-hidden="true" />
            <Flex direction="column" gap="1">
              <Text weight="bold">Templates</Text>
              <Text size="1" color="gray">
                Find your starting point
              </Text>
            </Flex>
          </RadioCards.Item>
        ) : null}
        {onCreateFresh ? (
          <RadioCards.Item value="fresh">
            <PlusIcon aria-hidden="true" />
            <Flex direction="column" gap="1">
              <Text weight="bold">Start fresh</Text>
              <Text size="2" color="gray">
                Base as a dependency
              </Text>
            </Flex>
          </RadioCards.Item>
        ) : null}
        {onChooseFolder ? (
          <RadioCards.Item value="folder">
            <ArchiveIcon aria-hidden="true" />
            <Flex direction="column" gap="1">
              <Text weight="bold">Folder</Text>
              <Text size="2" color="gray">
                Use a local checkout
              </Text>
            </Flex>
          </RadioCards.Item>
        ) : null}
        <RadioCards.Item value="git">
          <GitHubLogoIcon aria-hidden="true" />
          <Flex direction="column" gap="1">
            <Text weight="bold">Git URL</Text>
            <Text size="2" color="gray">
              Existing repository
            </Text>
          </Flex>
        </RadioCards.Item>
      </RadioCards.Root>
      {sourceKind === "fresh" && onCreateFresh ? (
        <Flex className="workspace-source-form" direction="column" gap="3">
          <Heading size="4">A fresh space for your ideas</Heading>
          <Text size="2" color="gray">
            Create your own workspace with this host’s configured Base as a
            template dependency. It starts without a publishing repository; you
            can create one later. To edit Base itself, select Base in the
            template catalog and choose “Edit the template itself”.
          </Text>
          <Text
            as="label"
            htmlFor="fresh-workspace-name"
            size="2"
            weight="medium"
          >
            Workspace name
          </Text>
          <TextField.Root
            id="fresh-workspace-name"
            aria-label="Workspace name"
            placeholder="my-project"
            value={freshName}
            disabled={creatingFresh}
            onChange={(event) => setFreshName(event.target.value)}
            size="3"
          />
          <Text size="1" color="gray">
            Use letters, numbers, hyphens or underscores.
          </Text>
          <Box>
            <Button
              size="3"
              loading={creatingFresh}
              disabled={
                creatingFresh || !/^[A-Za-z0-9_-]+$/.test(freshName.trim())
              }
              onClick={() => {
                if (freshPending.current) return;
                freshPending.current = true;
                setCreatingFresh(true);
                setError(null);
                void onCreateFresh(freshName.trim())
                  .catch(setError)
                  .finally(() => {
                    freshPending.current = false;
                    setCreatingFresh(false);
                  });
              }}
            >
              Create workspace
            </Button>
          </Box>
        </Flex>
      ) : null}
      <TemplateRequestError
        error={error}
        onReviewPending={onReviewPending}
        onRetry={() => {
          if (lastLocator.current) void inspect(lastLocator.current);
        }}
      />
      {currentInspection ? (
        <Card>
          <Heading size="3">
            {currentInspection.presentation?.name ?? "Workspace source"}
          </Heading>
          <Text as="p" size="2" color="gray" mt="2">
            {currentInspection.presentation?.description}
          </Text>
          <Text as="div" size="1" mt="2" style={{ overflowWrap: "anywhere" }}>
            {sourceAddress(currentInspection.pin)} ·{" "}
            {currentInspection.pin.commit.slice(0, 12)}
          </Text>
          {onOpenInApp ? (
            <Button
              size="3"
              mt="3"
              onClick={() =>
                void onOpenInApp(currentInspection).catch((error) =>
                  setError(error),
                )
              }
            >
              Continue in app
            </Button>
          ) : null}
        </Card>
      ) : null}
      {onChooseFolder && sourceKind === "folder" ? (
        <Flex className="workspace-source-form" direction="column" gap="3">
          <ArchiveIcon className="workspace-source-icon" aria-hidden="true" />
          <Heading size="4">Start from a local folder</Heading>
          <Text size="2" color="gray">
            Choose a workspace template checkout. We’ll include your uncommitted
            changes, then let you choose to build on it or author the template.
            Your original folder stays unchanged.
          </Text>
          <Box>
            <Button
              size="3"
              variant="soft"
              disabled={inspecting}
              loading={inspecting}
              onClick={() => {
                const operation = ++generation.current;
                setInspecting(true);
                setError(null);
                void onChooseFolder()
                  .then((result) => {
                    if (
                      live.current &&
                      operation === generation.current &&
                      result
                    )
                      setInspection(result);
                  })
                  .catch((error) => {
                    if (live.current && operation === generation.current)
                      setError(error);
                  })
                  .finally(() => {
                    if (live.current && operation === generation.current)
                      setInspecting(false);
                  });
              }}
            >
              Choose folder…
            </Button>
          </Box>
        </Flex>
      ) : null}
      {sourceKind === "git" ? (
        <Flex className="workspace-source-form" direction="column" gap="3">
          <Heading size="4">Start from a Git repository</Heading>
          <Text size="2" color="gray">
            Paste the HTTPS address of an existing workspace template. You’ll
            choose how to use it in the next step.
          </Text>
          <Text
            as="label"
            htmlFor="workspace-source-url"
            size="2"
            weight="medium"
          >
            Repository URL
          </Text>
          <TextField.Root
            size="3"
            id="workspace-source-url"
            aria-label="Workspace source address"
            placeholder="https://github.com/owner/workspace"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setCredential("");
            }}
            disabled={inspecting}
          />
          {listSourceAccounts ? (
            <Flex direction="column" gap="2">
              <Text size="2" weight="medium">
                Repository access
              </Text>
              <Select.Root
                value={credential || "anonymous"}
                onValueChange={(value) =>
                  setCredential(value === "anonymous" ? "" : value)
                }
                disabled={inspecting}
              >
                <Select.Trigger
                  aria-label="Repository account"
                  placeholder="Public repository"
                />
                <Select.Content>
                  <Select.Item value="anonymous">
                    Public repository — no account
                  </Select.Item>
                  {availableAccounts.map((account) => (
                    <Select.Item key={account.id} value={account.label}>
                      {account.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
              <Text size="1" color="gray">
                {!canInspect
                  ? "Enter a valid repository URL to check which accounts can access it."
                  : availableAccounts.length
                    ? "For a private repository, select a connected account above."
                    : "No connected account matches this address. Public repositories can continue without one. For private access, connect an account in Settings."}
              </Text>
              {accountError ? (
                <Text size="2" color="red" role="alert">
                  Couldn’t load connected accounts: {accountError}
                </Text>
              ) : null}
            </Flex>
          ) : null}
          <Flex justify="end">
            <Button
              size="3"
              variant="soft"
              disabled={!canInspect || inspecting}
              loading={inspecting}
              onClick={() =>
                void inspect({
                  url: url.trim(),
                  ...(credential.trim()
                    ? { credential: credential.trim() }
                    : {}),
                })
              }
            >
              Review workspace
            </Button>
          </Flex>
        </Flex>
      ) : null}
      {client.registry && sourceKind === "templates" ? (
        <Flex direction="column" gap="3">
          <Flex align="center" justify="between" gap="3" wrap="wrap">
            <Heading size="4">Choose your starting point</Heading>
            <TextField.Root
              aria-label="Search templates"
              placeholder="Search templates…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Flex>
          <Text size="2" color="gray">
            Choose any template, then review whether to use it as a dependency
            (the default) or edit the template itself. Git URLs and folders
            offer the same choice.
          </Text>
          <TemplateRequestError
            error={registryError}
            onReviewPending={onReviewPending}
            onRetry={() => void loadRegistry(registryUrl.trim())}
          />
          {loadingRegistry ? (
            <Flex role="status" align="center" gap="2">
              <Spinner />
              Loading templates…
            </Flex>
          ) : null}
          {!loadingRegistry && registry && !entries?.length ? (
            <Text color="gray" role="status">
              {search
                ? "No templates match your search."
                : "This catalog has no templates. Try a Git URL or another catalog."}
            </Text>
          ) : null}
          <Grid className="workspace-template-grid" gap="3">
            {entries?.map((entry) => (
              <Card className="workspace-template-card" key={entry.url}>
                <Flex align="center" justify="between" mb="3">
                  <CubeIcon
                    className="workspace-template-icon"
                    aria-hidden="true"
                  />
                  {entry.role === "catalog" ? (
                    <Badge color="gray">Template</Badge>
                  ) : (
                    <Badge color="gray">
                      {entry.role === "development"
                        ? "Development"
                        : "Foundation"}
                    </Badge>
                  )}
                </Flex>
                <Heading size="3">{entry.name}</Heading>
                <Text as="p" size="2" color="gray" mt="2">
                  {entry.description}
                </Text>
                <Button
                  mt="3"
                  variant="soft"
                  disabled={inspecting}
                  loading={
                    (inspecting &&
                      lastLocator.current &&
                      "url" in lastLocator.current &&
                      lastLocator.current.url === entry.url) ||
                    false
                  }
                  onClick={() => void inspect({ url: entry.url })}
                >
                  Review {entry.name}
                  <ArrowRightIcon aria-hidden="true" />
                </Button>
              </Card>
            ))}
          </Grid>
          <details className="workspace-catalog-settings">
            <summary>Use a different template catalog</summary>
            <Flex className="workspace-registry-settings" gap="2" align="end">
              <Box style={{ flex: 1 }}>
                <Text as="label" size="2" weight="medium">
                  Registry address
                </Text>
                <TextField.Root
                  mt="1"
                  size="2"
                  aria-label="Template registry address"
                  value={registryUrl}
                  onChange={(event) => setRegistryUrl(event.target.value)}
                  disabled={loadingRegistry}
                />
              </Box>
              <Button
                variant="soft"
                loading={loadingRegistry}
                disabled={loadingRegistry || !registryUrl.trim()}
                onClick={() => void loadRegistry(registryUrl.trim())}
              >
                Load registry
              </Button>
            </Flex>
          </details>
        </Flex>
      ) : null}
    </Flex>
  );
}

export { TemplateAuthoring } from "./templateAuthoring.js";

export { TemplateUpdates } from "./templateUpdates.js";
export { TemplateContributions } from "./templateContributions.js";
