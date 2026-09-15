import { useEffect, useRef, useState } from "react";
import { Button, Flex, Text, TextField } from "@radix-ui/themes";
import type { StoredCredentialSummary } from "@vibestudio/credential-client";
import type { TemplatesClient } from "@vibestudio/service-schemas/templates";

export interface TemplateRepositoryChoiceValue {
  owner: string;
  name: string;
  private: boolean;
  credentialId?: string;
}

type Page = Awaited<ReturnType<TemplatesClient["publicationRepositories"]>>;
const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
} as const;
const selectStyle = {
  width: "100%",
  minWidth: 0,
  padding: "8px 10px",
  borderRadius: 6,
  background: "var(--gray-3)",
  color: "var(--gray-12)",
  border: "1px solid var(--gray-7)",
  font: "inherit",
} as const;

/** Account metadata stays in the panel; credential material stays behind the broker. */
export function TemplateRepositoryChoice({
  client,
  value,
  onChange,
  listAccounts,
}: {
  client: TemplatesClient;
  value: TemplateRepositoryChoiceValue;
  onChange(value: TemplateRepositoryChoiceValue): void;
  listAccounts?: () => Promise<StoredCredentialSummary[]>;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [accounts, setAccounts] = useState<StoredCredentialSummary[]>([]);
  const [repositories, setRepositories] = useState<Page["repositories"]>([]);
  const [nextPage, setNextPage] = useState<number | null>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    if (listAccounts)
      void listAccounts()
        .then((items) => {
          if (active)
            setAccounts(
              items.filter(
                (account) =>
                  !account.revokedAt &&
                  account.lifecycle.state !== "revoked" &&
                  account.bindings?.some(
                    (binding) =>
                      binding.use === "git-http" &&
                      binding.audience.some(
                        (audience) =>
                          new URL(audience.url).hostname === "github.com",
                      ),
                  ),
              ),
            );
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
    const current = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await client.publicationRepositories({
        credentialId: value.credentialId,
        page: nextPage ?? 1,
      });
      if (current !== generation.current) return;
      setRepositories((previous) =>
        nextPage === 1
          ? result.repositories
          : [...previous, ...result.repositories],
      );
      setNextPage(result.nextPage);
      if (mode === "new" && !value.owner)
        onChange({ ...value, owner: result.owner });
    } catch (cause) {
      if (current === generation.current) setError(String(cause));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  return (
    <Flex direction="column" gap="3">
      {listAccounts && (
        <label style={labelStyle}>
          GitHub account
          <select
            style={selectStyle}
            required
            aria-label="GitHub account"
            value={value.credentialId ?? ""}
            onChange={(event) => {
              generation.current++;
              setBusy(false);
              setRepositories([]);
              setNextPage(1);
              setError("");
              onChange({
                owner: "",
                name: "",
                private: true,
                credentialId: event.target.value || undefined,
              });
            }}
          >
            <option value="">Choose a connected account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label style={labelStyle}>
        Publish to
        <select
          style={selectStyle}
          aria-label="Repository destination"
          value={mode}
          onChange={(event) => {
            setMode(event.target.value as "new" | "existing");
            onChange({ ...value, owner: "", name: "", private: true });
          }}
        >
          <option value="new">Name a repository to create</option>
          <option value="existing">Choose an existing GitHub repository</option>
        </select>
      </label>
      {mode === "existing" ? (
        <>
          <Button
            type="button"
            variant="soft"
            disabled={
              busy ||
              nextPage === null ||
              (!!listAccounts && !value.credentialId)
            }
            onClick={() => void load()}
          >
            {busy
              ? "Loading repositories…"
              : repositories.length
                ? "Load more repositories"
                : "Load writable repositories"}
          </Button>
          <label style={labelStyle}>
            Repository
            <select
              style={selectStyle}
              required
              aria-label="Existing repository"
              value={
                value.owner && value.name ? `${value.owner}/${value.name}` : ""
              }
              onChange={(event) => {
                const repository = repositories.find(
                  (repo) => `${repo.owner}/${repo.name}` === event.target.value,
                );
                if (repository)
                  onChange({ ...repository, credentialId: value.credentialId });
              }}
            >
              <option value="">Choose a repository</option>
              {repositories.map((repo) => (
                <option
                  key={`${repo.owner}/${repo.name}`}
                  value={`${repo.owner}/${repo.name}`}
                >
                  {repo.owner}/{repo.name} ·{" "}
                  {repo.private ? "Private" : "Public"}
                </option>
              ))}
            </select>
          </label>
          {nextPage === null && !repositories.length && (
            <Text>No writable repositories were found for this account.</Text>
          )}
          <Text size="2">
            Publishing replaces the repository’s complete file tree with the
            selected template release. Existing Git history is retained.
          </Text>
        </>
      ) : (
        <>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            GitHub owner
            <TextField.Root
              required
              aria-label="GitHub owner"
              value={value.owner}
              onChange={(event) =>
                onChange({ ...value, owner: event.target.value })
              }
            />
          </label>
          <Text size="2">
            Your GitHub username or an organization where you can create
            repositories. If this name already exists, publishing replaces its
            complete file tree; its visibility stays unchanged.
          </Text>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            Repository name
            <TextField.Root
              required
              aria-label="Repository name"
              value={value.name}
              onChange={(event) =>
                onChange({ ...value, name: event.target.value })
              }
            />
          </label>
          <label style={labelStyle}>
            Visibility
            <select
              style={selectStyle}
              aria-label="Repository visibility"
              value={value.private ? "private" : "public"}
              onChange={(event) =>
                onChange({
                  ...value,
                  private: event.target.value === "private",
                })
              }
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </label>
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
