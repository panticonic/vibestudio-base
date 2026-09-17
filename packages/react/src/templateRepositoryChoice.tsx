import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Flex,
  RadioCards,
  Text,
  TextField,
} from "@radix-ui/themes";
import type { StoredCredentialSummary } from "@vibestudio/credential-client";
import type { TemplatesClient } from "@vibestudio/service-schemas/templates";

export interface TemplateRepositoryChoiceValue {
  owner: string;
  name: string;
  private: boolean;
  credentialId?: string;
  mode: "upstream" | "existing" | "new";
}
type Page = Awaited<ReturnType<TemplatesClient["publicationRepositories"]>>;
export function TemplateRepositoryChoice({
  client,
  value,
  onChange,
  listAccounts,
  upstream,
}: {
  client: TemplatesClient;
  value: TemplateRepositoryChoiceValue;
  onChange(value: TemplateRepositoryChoiceValue): void;
  listAccounts?: () => Promise<StoredCredentialSummary[]>;
  upstream?: { owner: string; name: string; credential?: string } | null;
}) {
  const [accounts, setAccounts] = useState<StoredCredentialSummary[]>([]);
  const [repositories, setRepositories] = useState<Page["repositories"]>([]);
  const [page, setPage] = useState<number | null>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const generation = useRef(0);
  const current = useRef({ value, onChange, upstream });
  current.current = { value, onChange, upstream };
  useEffect(() => {
    let active = true;
    if (listAccounts)
      void listAccounts()
        .then((items) => {
          if (!active) return;
          const available = items.filter(
            (account) =>
              !account.revokedAt &&
              account.lifecycle.state === "active" &&
              account.bindings?.some(
                (binding) =>
                  binding.use === "git-http" &&
                  binding.audience.some((audience) => {
                    try {
                      return new URL(audience.url).hostname === "github.com";
                    } catch {
                      return false;
                    }
                  }),
              ),
          );
          setAccounts(available);
          const { value, onChange, upstream } = current.current;
          const preferred =
            available.find((item) => item.label === upstream?.credential) ??
            (available.length === 1 ? available[0] : undefined);
          if (!value.credentialId && preferred)
            onChange({ ...value, credentialId: preferred.id });
        })
        .catch((cause) => {
          if (active) setError(String(cause));
        });
    return () => {
      active = false;
      generation.current++;
    };
  }, [listAccounts]);
  const load = async () => {
    const operation = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await client.publicationRepositories({
        credentialId: value.credentialId,
        page: page ?? 1,
      });
      if (operation !== generation.current) return;
      setRepositories((previous) =>
        page === 1
          ? result.repositories
          : [...previous, ...result.repositories],
      );
      setPage(result.nextPage);
    } catch (cause) {
      if (operation === generation.current) setError(String(cause));
    } finally {
      if (operation === generation.current) setBusy(false);
    }
  };
  return (
    <Flex direction="column" gap="3">
      <Text size="2" weight="bold">
        GitHub account
      </Text>
      {accounts.length ? (
        <RadioCards.Root
          aria-label="GitHub account"
          value={value.credentialId ?? ""}
          onValueChange={(credentialId) => {
            generation.current++;
            setBusy(false);
            setRepositories([]);
            setPage(1);
            setError("");
            onChange({ ...value, credentialId });
          }}
          className="publication-choice-grid"
        >
          {accounts.map((account) => (
            <RadioCards.Item key={account.id} value={account.id}>
              <Text>{account.label}</Text>
            </RadioCards.Item>
          ))}
        </RadioCards.Root>
      ) : listAccounts ? (
        <Text size="2" color="gray">
          Connect a GitHub account with publishing access in Settings to
          continue.
        </Text>
      ) : null}
      <Text size="2" weight="bold">
        Destination
      </Text>
      <RadioCards.Root
        aria-label="Repository destination"
        className="publication-choice-grid"
        value={value.mode}
        onValueChange={(mode) => {
          generation.current++;
          setBusy(false);
          setRepositories([]);
          setPage(1);
          setError("");
          onChange({
            ...value,
            mode: mode as TemplateRepositoryChoiceValue["mode"],
            owner: mode === "upstream" ? upstream!.owner : "",
            name: mode === "upstream" ? upstream!.name : "",
          });
        }}
      >
        {upstream && (
          <RadioCards.Item value="upstream">
            <Text>Publish to upstream</Text>
          </RadioCards.Item>
        )}
        <RadioCards.Item value="existing">
          <Text>Existing repository</Text>
        </RadioCards.Item>
        <RadioCards.Item value="new">
          <Text>New repository</Text>
        </RadioCards.Item>
      </RadioCards.Root>
      {value.mode === "upstream" ? (
        <Card className="publication-destination">
          <Badge color="green">Connected upstream</Badge>
          <Text as="p" weight="bold" mt="2">
            {value.owner}/{value.name}
          </Text>
          <Text as="p" size="2" color="gray">
            This is the template repository recorded when you created this
            authoring workspace.
          </Text>
        </Card>
      ) : value.mode === "existing" ? (
        <>
          {value.owner && value.name && (
            <Text weight="bold">
              Selected: {value.owner}/{value.name}
            </Text>
          )}
          <TextField.Root
            aria-label="Find repository"
            placeholder="Filter loaded repositories…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="publication-repositories">
            {repositories
              .filter((repo) =>
                `${repo.owner}/${repo.name}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((repo) => (
                <Button
                  type="button"
                  variant={
                    repo.owner === value.owner && repo.name === value.name
                      ? "solid"
                      : "soft"
                  }
                  key={repo.webUrl}
                  onClick={() => onChange({ ...value, ...repo })}
                >
                  {repo.owner}/{repo.name} ·{" "}
                  {repo.private ? "Private" : "Public"}
                </Button>
              ))}
          </div>
          <Button
            type="button"
            variant="soft"
            disabled={
              busy || page === null || (!!listAccounts && !value.credentialId)
            }
            onClick={() => void load()}
          >
            {busy
              ? "Loading repositories…"
              : repositories.length
                ? "Load more repositories"
                : "Load writable repositories"}
          </Button>
          {page === null && !repositories.length && (
            <Text size="2">
              No writable repositories were found for this account.
            </Text>
          )}
        </>
      ) : (
        <>
          <label>
            GitHub owner
            <TextField.Root
              aria-label="GitHub owner"
              required
              value={value.owner}
              onChange={(event) =>
                onChange({ ...value, owner: event.target.value })
              }
              placeholder="Your username or organization"
            />
          </label>
          <label>
            Repository name
            <TextField.Root
              aria-label="Repository name"
              required
              value={value.name}
              onChange={(event) =>
                onChange({ ...value, name: event.target.value })
              }
            />
          </label>
          <RadioCards.Root
            aria-label="Repository visibility"
            className="publication-choice-grid"
            value={value.private ? "private" : "public"}
            onValueChange={(visibility) =>
              onChange({ ...value, private: visibility === "private" })
            }
          >
            <RadioCards.Item value="private">Private</RadioCards.Item>
            <RadioCards.Item value="public">Public</RadioCards.Item>
          </RadioCards.Root>
          <Text size="2" color="gray">
            Use an unused repository name. For a repository that already exists,
            choose Existing repository.
          </Text>
        </>
      )}
      {error && (
        <Text color="red" role="alert">
          {error}
        </Text>
      )}
    </Flex>
  );
}
