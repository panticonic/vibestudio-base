/**
 * Closed panels: the panels closed in this workspace that can still be
 * reopened, most recent first. A close is tab-like and reversible; this page is
 * where a person finds an older close to reopen, or deletes one for good.
 */
import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  Button,
  Callout,
  Flex,
  Separator,
  Text,
  TextField,
} from "@radix-ui/themes";
import {
  CounterClockwiseClockIcon,
  MagnifyingGlassIcon,
} from "@radix-ui/react-icons";
import { formatRelativeTime } from "@vibestudio/git/formatting";
import { panel, panelTree } from "@workspace/runtime";
import {
  errorMessage,
  useRecordActions,
} from "@workspace/about-shared/asyncState";
import { AboutPage, AboutThemeRoot, Section } from "@workspace/about-shared/ui";

type ClosedPanel = Awaited<
  ReturnType<typeof panelTree.closed>
>["items"][number];

const PAGE_SIZE = 20;

function subPanels(count: number): string {
  return `${count} sub-panel${count === 1 ? "" : "s"}`;
}

function displayTitle(item: ClosedPanel): string {
  return item.title || item.source;
}

function ClosedPanelRow({
  item,
  pending,
  onReopen,
  onDelete,
}: {
  item: ClosedPanel;
  pending: boolean;
  onReopen(): void;
  onDelete(): void;
}) {
  const descendants = item.closedCount - 1;
  return (
    <Flex align="center" justify="between" gap="3" py="1">
      <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
        <Text size="2" weight="medium" truncate>
          {displayTitle(item)}
        </Text>
        <Text size="1" color="gray" truncate>
          {item.source}
        </Text>
        <Text size="1" color="gray">
          <time
            dateTime={new Date(item.closedAt).toISOString()}
            title={new Date(item.closedAt).toLocaleString()}
          >
            closed {formatRelativeTime(item.closedAt)}
          </time>
          {descendants > 0 && ` · +${subPanels(descendants)}`}
        </Text>
      </Flex>
      <Flex gap="2" flexShrink="0">
        <Button
          variant="soft"
          disabled={pending}
          onClick={onReopen}
          aria-label={`Reopen ${displayTitle(item)}`}
        >
          Reopen
        </Button>
        <Button
          variant="soft"
          color="red"
          disabled={pending}
          onClick={onDelete}
          aria-label={`Delete ${displayTitle(item)}`}
        >
          Delete
        </Button>
      </Flex>
    </Flex>
  );
}

function ClosedPanelsPage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ClosedPanel[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [confirming, setConfirming] = useState<ClosedPanel | null>(null);
  const actions = useRecordActions();
  /** The newest list read owns the list; older reads and their pages are dropped. */
  const generation = useRef(0);
  const search = query.trim();

  useEffect(() => {
    const current = ++generation.current;
    // A newer first page supersedes any page still being appended.
    setLoadingMore(false);
    panelTree
      .closed({ limit: PAGE_SIZE, ...(search ? { query: search } : {}) })
      .then(
        (page) => {
          if (generation.current !== current) return;
          setItems(page.items);
          setNextCursor(page.nextCursor);
          setListError(null);
        },
        (cause: unknown) => {
          if (generation.current === current)
            setListError(errorMessage(cause));
        },
      );
  }, [search, refreshEpoch]);

  // Panels close elsewhere while this page is in the background; coming back
  // to it is when the list has to be current again.
  useEffect(
    () => panel.onFocus(() => setRefreshEpoch((epoch) => epoch + 1)),
    [],
  );

  const loadMore = () => {
    if (!nextCursor || loadingMore) return;
    const current = generation.current;
    setLoadingMore(true);
    panelTree
      .closed({
        limit: PAGE_SIZE,
        cursor: nextCursor,
        ...(search ? { query: search } : {}),
      })
      .then(
        (page) => {
          if (generation.current !== current) return;
          setItems((previous) => [...(previous ?? []), ...page.items]);
          setNextCursor(page.nextCursor);
          setListError(null);
        },
        (cause: unknown) => {
          if (generation.current === current)
            setListError(errorMessage(cause));
        },
      )
      .finally(() => {
        if (generation.current === current) setLoadingMore(false);
      });
  };

  const removeRow = (slotId: string) =>
    setItems(
      (previous) =>
        previous?.filter((candidate) => candidate.slotId !== slotId) ?? null,
    );

  const reopen = (item: ClosedPanel) =>
    void actions.run(item.slotId, async () => {
      const handle = await panelTree.reopen(item.slotId);
      // The close is undone even if presenting the panel then fails.
      removeRow(item.slotId);
      await handle.focus();
    });

  const deleteForGood = (item: ClosedPanel) => {
    setConfirming(null);
    void actions.run(item.slotId, async () => {
      await panelTree.deleteClosed(item.slotId);
      removeRow(item.slotId);
    });
  };

  const confirmingDescendants = confirming ? confirming.closedCount - 1 : 0;

  return (
    <AboutPage
      icon={<CounterClockwiseClockIcon width={20} height={20} />}
      title="Closed panels"
      subtitle="Reopen a panel closed in this workspace, or delete it for good."
      maxWidth={720}
    >
      <TextField.Root
        type="search"
        size="3"
        placeholder="Search closed panels"
        aria-label="Search closed panels"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      >
        <TextField.Slot>
          <MagnifyingGlassIcon width={16} height={16} />
        </TextField.Slot>
      </TextField.Root>
      {listError && (
        <Callout.Root color="red" role="alert">
          <Callout.Text>{listError}</Callout.Text>
          <Button
            variant="soft"
            onClick={() => setRefreshEpoch((epoch) => epoch + 1)}
          >
            Try again
          </Button>
        </Callout.Root>
      )}
      {actions.error && (
        <Callout.Root color="red" role="alert">
          <Callout.Text>{actions.error}</Callout.Text>
        </Callout.Root>
      )}
      {items === null && !listError && (
        <Text role="status" color="gray">
          Reading closed panels…
        </Text>
      )}
      {items !== null && items.length === 0 && (
        <Text role="status" color="gray">
          {search ? "No matches" : "Nothing closed recently"}
        </Text>
      )}
      {items !== null && items.length > 0 && (
        <Section>
          <Flex direction="column" asChild>
            <ul
              aria-label="Closed panels"
              style={{ listStyle: "none", margin: 0, padding: 0 }}
            >
              {items.map((item, index) => (
                <li key={item.slotId}>
                  {index > 0 && <Separator size="4" my="2" />}
                  <ClosedPanelRow
                    item={item}
                    pending={actions.pending.has(item.slotId)}
                    onReopen={() => reopen(item)}
                    onDelete={() => setConfirming(item)}
                  />
                </li>
              ))}
            </ul>
          </Flex>
          {nextCursor && (
            <Flex justify="center" mt="3">
              <Button variant="soft" disabled={loadingMore} onClick={loadMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </Flex>
          )}
        </Section>
      )}
      <AlertDialog.Root
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialog.Content maxWidth="440px">
          <AlertDialog.Title>Delete this panel for good?</AlertDialog.Title>
          <AlertDialog.Description size="2">
            “{confirming ? displayTitle(confirming) : ""}”
            {confirmingDescendants > 0 &&
              ` and its ${subPanels(confirmingDescendants)}`}{" "}
            will be deleted permanently. This can’t be undone.
          </AlertDialog.Description>
          <Flex justify="end" gap="2" mt="4">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                color="red"
                onClick={() => {
                  if (confirming) deleteForGood(confirming);
                }}
              >
                Delete
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </AboutPage>
  );
}

export default function AboutPanelRoot() {
  return (
    <AboutThemeRoot>
      <ClosedPanelsPage />
    </AboutThemeRoot>
  );
}
