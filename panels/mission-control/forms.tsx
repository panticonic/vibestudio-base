import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  createDurableObjectServiceClient,
  workspace,
} from "@workspace/runtime";
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  GitBranch,
  Plus,
  X,
} from "@workspace/ui/icons";
import {
  PROTOCOL,
  STATUSES,
  STATUS_LABELS,
  PRIORITIES,
  emptyView,
  projectInput,
  taskInput,
  viewInput,
  type Project,
  type Task,
  type View,
  type TaskInput,
  type TaskDetail,
  type MissionTrigger,
} from "@workspace/mission-control";
import { triggerSchema } from "@vibestudio/workspace-contracts/automations";
import {
  canonicalCronExpression,
  canonicalCronTimeZone,
  cronExpressionFromVisual,
  cronUpcomingOccurrences,
  cronVisualSchedule,
  describeCronSchedule,
  formatCronOccurrence,
} from "@vibestudio/automation/cronSchedule";
import type { ZodIssue } from "zod";

const service = createDurableObjectServiceClient(PROTOCOL);
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const mergeTasks = (items: Task[]) => [
  ...new Map(items.map((task) => [task.id, task])).values(),
];
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const dateValue = (time: number | null) => {
  if (time === null) return "";
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const localDateTime = (time: number | undefined) => {
  if (time === undefined) return "";
  const date = new Date(time);
  return `${dateValue(time)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};
type Facets = { tags: string[]; categories: string[] };
type FieldErrors = Record<string, string>;
type DraftControls = { markDirty: () => void; requestClose: () => void };
const DraftContext = createContext<DraftControls | null>(null);

/** Programmatic changes (chips, presets, checklist ordering) share the native form's draft lifecycle. */
export function useModalDraft(): DraftControls {
  const draft = useContext(DraftContext);
  if (!draft)
    throw new Error(
      "Draft controls must be used inside a Mission Control modal.",
    );
  return draft;
}

export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const dirty = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const titleId = useId();
  const markDirty = useCallback(() => {
    dirty.current = true;
  }, []);
  const requestClose = useCallback(() => {
    if (!dirty.current) {
      close();
      return;
    }
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setConfirming(true);
  }, [close]);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (opener.current?.isConnected) opener.current.focus();
    };
  }, []);
  useEffect(() => {
    if (confirming) keepEditing.current?.focus();
  }, [confirming]);
  const resume = () => {
    setConfirming(false);
  };
  useEffect(() => {
    if (!confirming) returnFocus.current?.focus();
  }, [confirming]);
  const trackInput = (target: EventTarget | null) => {
    if (
      target instanceof Element &&
      !target.closest('[data-mc-draft="ignore"]')
    )
      markDirty();
  };
  return (
    <DraftContext.Provider value={{ markDirty, requestClose }}>
      <dialog
        className="mc-modal"
        ref={dialog}
        aria-labelledby={titleId}
        onInputCapture={(event) => trackInput(event.target)}
        onChangeCapture={(event) => trackInput(event.target)}
        onCancel={(event) => {
          event.preventDefault();
          if (confirming) resume();
          else requestClose();
        }}
        onKeyDown={(event) => {
          if (
            confirming ||
            event.key !== "Enter" ||
            (!event.metaKey && !event.ctrlKey)
          )
            return;
          const form =
            (event.target as Element).closest("form") ??
            dialog.current?.querySelector("form");
          const submit = form?.querySelector<
            HTMLButtonElement | HTMLInputElement
          >(
            'button[type="submit"]:not(:disabled),button:not([type]):not(:disabled),input[type="submit"]:not(:disabled)',
          );
          if (form && submit) {
            event.preventDefault();
            form.requestSubmit(submit);
          }
        }}
      >
        <div className="mc-modal-heading">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="mc-icon"
            aria-label="Close dialog"
            onClick={requestClose}
          >
            <X size={18} />
          </button>
        </div>
        <div hidden={confirming}>{children}</div>
        {confirming && (
          <div
            className="mc-discard-confirm"
            role="alertdialog"
            aria-label="Discard unsaved changes?"
          >
            <h3>Keep your changes?</h3>
            <p>
              Your edits haven’t been saved yet. Keep editing, or discard this
              draft.
            </p>
            <div className="mc-form-footer">
              <button
                type="button"
                className="mc-danger"
                onClick={() => {
                  dirty.current = false;
                  close();
                }}
              >
                Discard changes
              </button>
              <button
                type="button"
                className="mc-primary"
                ref={keepEditing}
                onClick={resume}
              >
                Keep editing
              </button>
            </div>
          </div>
        )}
      </dialog>
    </DraftContext.Provider>
  );
}

export function ModalCloseButton({
  children = "Cancel",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  const { requestClose } = useModalDraft();
  return (
    <button {...props} type="button" onClick={requestClose}>
      {children}
    </button>
  );
}

function useValidation() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (Object.keys(errors).length)
      form.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
  }, [errors]);
  const invalid = (issues: ZodIssue[]) => {
    const next: FieldErrors = {};
    for (const issue of issues) {
      const name = String(issue.path[0] ?? "form");
      if (!next[name]) next[name] = issue.message;
    }
    setErrors(next);
  };
  const clearField = (event: FormEvent<HTMLFormElement>) => {
    const name = (event.target as HTMLInputElement).name;
    if (name && errors[name])
      setErrors((old) => {
        const next = { ...old };
        delete next[name];
        return next;
      });
  };
  return { errors, setErrors, form, invalid, clearField };
}

function FormFeedback({
  errors,
  error,
}: {
  errors: FieldErrors;
  error?: string;
}) {
  return (
    <>
      {error && (
        <p className="mc-form-feedback mc-error" role="alert">
          {error}
        </p>
      )}
      {Object.keys(errors).length > 0 && (
        <p className="mc-form-feedback mc-error" role="alert">
          {errors["form"] ??
            "A few fields need your attention. Check the highlighted fields below."}
        </p>
      )}
    </>
  );
}

function Field({
  label,
  name,
  errors,
  help,
  children,
}: {
  label: string;
  name: string;
  errors: FieldErrors;
  help?: ReactNode;
  children: (props: {
    id: string;
    name: string;
    "aria-invalid": boolean;
    "aria-describedby"?: string;
  }) => ReactNode;
}) {
  const id = useId();
  const described = [
    help ? `${id}-help` : "",
    errors[name] ? `${id}-error` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="mc-field">
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        name,
        "aria-invalid": !!errors[name],
        ...(described ? { "aria-describedby": described } : {}),
      })}
      {help && (
        <div id={`${id}-help`} className="mc-help">
          {help}
        </div>
      )}
      {errors[name] && (
        <p id={`${id}-error`} className="mc-field-error">
          {errors[name]}
        </p>
      )}
    </div>
  );
}

function Footer({
  busy,
  label,
  icon = <Check size={15} />,
  disabled = false,
}: {
  busy: boolean;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="mc-form-footer">
      <span className="mc-save-hint">⌘ / Ctrl + Enter to save</span>
      <ModalCloseButton />
      <button type="submit" className="mc-primary" disabled={busy || disabled}>
        {busy ? "Saving…" : label}
        {icon}
      </button>
    </div>
  );
}

type ProjectFormProps = {
  project?: Project;
  close: () => void;
  submit: (input: unknown) => void;
  busy: boolean;
  archive: () => void;
  error?: string;
};
export function ProjectForm(props: ProjectFormProps) {
  return (
    <Modal
      title={
        props.project
          ? "Project settings"
          : "A new place for your next big idea"
      }
      close={props.close}
    >
      <ProjectFields {...props} />
    </Modal>
  );
}

function ProjectFields({
  project,
  submit,
  busy,
  archive,
  error,
}: ProjectFormProps) {
  const { markDirty } = useModalDraft();
  const { errors, form, invalid, clearField } = useValidation();
  const [repos, setRepos] = useState<string[]>(project?.repos ?? []);
  const [available, setAvailable] = useState<string[]>([]);
  const [sourceError, setSourceError] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const version = useRef(0);
  const load = useCallback(async () => {
    const current = ++version.current;
    setLoading(true);
    setSourceError("");
    try {
      const tree = await workspace.sourceTree();
      const paths: string[] = [];
      const visit = (node: (typeof tree.children)[number]) => {
        if (node.isUnit) paths.push(node.path);
        node.children.forEach(visit);
      };
      tree.children.forEach(visit);
      if (version.current === current) setAvailable([...new Set(paths)].sort());
    } catch (error) {
      if (version.current === current) setSourceError(message(error));
    } finally {
      if (version.current === current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => {
      version.current++;
    };
  }, [load]);
  const filtered = available.filter((path) =>
    path.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const unselected = filtered.filter((path) => !repos.includes(path));
  const select = (next: string[]) => {
    markDirty();
    setRepos(next);
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    const result = projectInput.safeParse({
      name: values.get("name"),
      description: values.get("description"),
      color: values.get("color"),
      repos,
    });
    if (!result.success) {
      invalid(result.error.issues);
      return;
    }
    submit(result.data);
  };
  return (
    <form
      ref={form}
      onSubmit={save}
      onChangeCapture={clearField}
      noValidate
      aria-busy={busy}
    >
      <FormFeedback errors={errors} error={error} />
      <Field
        label="Project name"
        name="name"
        errors={errors}
        help="A clear name makes this project easy to find in conversations and views."
      >
        {(props) => (
          <input
            {...props}
            placeholder="What are we building?"
            defaultValue={project?.name}
            required
            maxLength={200}
            disabled={busy}
            autoFocus
          />
        )}
      </Field>
      <Field
        label="Goal"
        name="description"
        errors={errors}
        help="Describe the outcome, rather than a list of implementation details."
      >
        {(props) => (
          <textarea
            {...props}
            placeholder="The outcome you want to make possible…"
            defaultValue={project?.description}
            maxLength={4000}
            rows={3}
            disabled={busy}
          />
        )}
      </Field>
      <Field label="Project color" name="color" errors={errors}>
        {(props) => (
          <select
            {...props}
            defaultValue={project?.color ?? "violet"}
            disabled={busy}
          >
            {["violet", "blue", "green", "amber", "pink"].map((color) => (
              <option value={color} key={color}>
                {color[0]!.toUpperCase() + color.slice(1)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <fieldset>
        <legend>
          <GitBranch size={15} />
          Workspace repositories <span>{repos.length} selected</span>
        </legend>
        {repos.length > 0 && (
          <div className="mc-token-list mc-selected-repos">
            {repos.map((path) => (
              <button
                className="mc-token"
                type="button"
                key={path}
                disabled={busy}
                onClick={() => select(repos.filter((item) => item !== path))}
                aria-label={`Remove repository ${path}`}
              >
                <code>{path}</code>
                {!loading && !sourceError && !available.includes(path) && (
                  <small>Unavailable</small>
                )}
                <X size={12} />
              </button>
            ))}
          </div>
        )}
        <input
          aria-label="Find repositories"
          placeholder="Find a repository…"
          data-mc-draft="ignore"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={busy}
        />
        <div className="mc-picker-actions">
          <button
            type="button"
            disabled={
              busy ||
              loading ||
              !unselected.length ||
              repos.length + unselected.length > 100
            }
            onClick={() => select([...repos, ...unselected])}
          >
            Select all matching
          </button>
          <button
            type="button"
            disabled={busy || !repos.length}
            onClick={() => select([])}
          >
            Clear selection
          </button>
        </div>
        {sourceError && (
          <p className="mc-form-feedback mc-error" role="alert">
            {sourceError}{" "}
            <button
              type="button"
              disabled={loading}
              onClick={() => void load()}
            >
              Retry repository discovery
            </button>
          </p>
        )}
        <div className="mc-repos">
          {filtered.map((path) => (
            <label className="mc-check" key={path}>
              <input
                type="checkbox"
                checked={repos.includes(path)}
                disabled={
                  busy || (!repos.includes(path) && repos.length >= 100)
                }
                onChange={() =>
                  select(
                    repos.includes(path)
                      ? repos.filter((item) => item !== path)
                      : [...repos, path],
                  )
                }
              />
              <code>{path}</code>
            </label>
          ))}
          {loading && <p role="status">Discovering workspace repositories…</p>}
          {!loading && !sourceError && !filtered.length && (
            <p>
              {available.length
                ? "No repositories match. Try a shorter search."
                : "No repositories have been added to this workspace yet."}
            </p>
          )}
        </div>
        {errors["repos"] && (
          <p className="mc-field-error" role="alert">
            {errors["repos"]}
          </p>
        )}
        <p className="mc-help">
          Choose up to 100 repositories. Selections describe the scope of work;
          agents use normal workspace permissions.
        </p>
      </fieldset>
      {project && (
        <div className="mc-archive-actions">
          <p className="mc-help">
            Archiving hides this project and its tasks. Restore it later to
            bring back its history. Pause recurrence and stop live work first.
          </p>
          <button
            type="button"
            disabled={busy || project.archived}
            onClick={archive}
          >
            Archive project
          </button>
        </div>
      )}
      <Footer
        busy={busy}
        label={project ? "Save project" : "Create project"}
        icon={<ArrowUpRight size={15} />}
      />
    </form>
  );
}

export function DependencyPicker({
  taskId,
  dependencies,
  change,
  busy = false,
  projects = [],
}: {
  taskId?: string;
  dependencies: string[];
  change: (ids: string[]) => void;
  busy?: boolean;
  projects?: Project[];
}) {
  const { markDirty } = useModalDraft();
  const [options, setOptions] = useState<Task[]>([]);
  const [known, setKnown] = useState<Map<string, Task>>(new Map());
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const version = useRef(0);
  const load = useCallback(
    async (nextCursor?: string) => {
      const current = ++version.current;
      setLoading(true);
      setError("");
      try {
        const page = await service.call<{
          tasks: Task[];
          cursor: string | null;
        }>("taskOptions", {
          query,
          ...(nextCursor ? { cursor: nextCursor } : {}),
        });
        if (current !== version.current) return;
        setOptions((old) =>
          nextCursor ? mergeTasks([...old, ...page.tasks]) : page.tasks,
        );
        setKnown(
          (old) =>
            new Map([
              ...old,
              ...page.tasks.map((task) => [task.id, task] as const),
            ]),
        );
        setCursor(page.cursor);
      } catch (error) {
        if (current === version.current) setError(message(error));
      } finally {
        if (current === version.current) setLoading(false);
      }
    },
    [query],
  );
  useEffect(() => {
    void load();
    return () => {
      version.current++;
    };
  }, [load]);
  useEffect(() => {
    let active = true;
    void Promise.allSettled(
      dependencies.map((id) => service.call<Task>("getTask", { id })),
    ).then((results) => {
      if (!active) return;
      const tasks: Task[] = [];
      const failures: string[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") tasks.push(result.value);
        else failures.push(message(result.reason));
      }
      setKnown(
        (old) =>
          new Map([...old, ...tasks.map((task) => [task.id, task] as const)]),
      );
      if (failures.length) setError(failures.join("; "));
    });
    return () => {
      active = false;
    };
  }, []);
  const toggle = (id: string) => {
    markDirty();
    change(
      dependencies.includes(id)
        ? dependencies.filter((item) => item !== id)
        : [...dependencies, id],
    );
  };
  return (
    <fieldset>
      <legend>
        Dependencies <span>{dependencies.length} selected</span>
      </legend>
      <p className="mc-help">
        Agents start once every dependency is accepted as done. Dependencies can
        span projects.
      </p>
      {dependencies.length > 0 && (
        <div className="mc-token-list">
          {dependencies.map((id) => (
            <button
              className="mc-token"
              type="button"
              key={id}
              disabled={busy}
              onClick={() => toggle(id)}
              aria-label={`Remove dependency ${known.get(id)?.title ?? id}`}
            >
              {known.get(id)?.status === "done" && <Check size={12} />}
              {known.get(id)?.title ?? id}
              <X size={12} />
            </button>
          ))}
        </div>
      )}
      <input
        aria-label="Find dependencies"
        data-mc-draft="ignore"
        value={query}
        placeholder="Find a task in any project…"
        disabled={busy}
        onChange={(event) => setQuery(event.target.value)}
        maxLength={200}
      />
      {error && (
        <p className="mc-form-feedback mc-error" role="alert">
          {error}{" "}
          <button type="button" disabled={loading} onClick={() => void load()}>
            Try again
          </button>
        </p>
      )}
      <div className="mc-repos">
        {options
          .filter((task) => task.id !== taskId)
          .map((task) => (
            <label className="mc-check" key={task.id}>
              <input
                type="checkbox"
                checked={dependencies.includes(task.id)}
                disabled={
                  busy ||
                  (!dependencies.includes(task.id) && dependencies.length >= 50)
                }
                onChange={() => toggle(task.id)}
              />
              <span>
                {task.title}
                <small className="mc-help">
                  {projects.find((project) => project.id === task.projectId)
                    ?.name ?? ""}
                </small>
              </span>
              <span className="mc-help">{STATUS_LABELS[task.status]}</span>
            </label>
          ))}
        {loading && <p role="status">Finding tasks…</p>}
        {!loading && !error && !options.some((task) => task.id !== taskId) && (
          <p>No other tasks match.</p>
        )}
      </div>
      {cursor && (
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => void load(cursor)}
        >
          More tasks
        </button>
      )}
      {dependencies.length >= 50 && (
        <p className="mc-help">
          This task has reached its 50-dependency limit.
        </p>
      )}
    </fieldset>
  );
}

const BRIEF_TEMPLATES = [
  {
    name: "Research",
    text: "## Question\nWhat do we need to learn?\n\n## Scope\nWhich sources, repositories, or constraints matter?\n\n## Deliverable\nSummarize the evidence, tradeoffs, and a recommendation. Cite the sources used.",
  },
  {
    name: "Build",
    text: "## Outcome\nDescribe the behavior we want to make possible.\n\n## Requirements\nList the essential user-facing behavior and constraints.\n\n## Acceptance\nExplain how we can verify this is complete. Include relevant checks and a delivery summary.",
  },
  {
    name: "Bug",
    text: "## Observed behavior\nWhat happens, and what did we expect?\n\n## Reproduction\nList the smallest set of steps or evidence that demonstrates the issue.\n\n## Resolution\nFind the cause, fix it, and verify the behavior without masking the failure.",
  },
  {
    name: "Review",
    text: "## Review target\nIdentify the change, repository, or artifact to inspect.\n\n## Focus\nDescribe the risks or questions that matter most.\n\n## Deliverable\nReport actionable findings with evidence, ordered by impact. Explain any remaining uncertainty.",
  },
] as const;

function TagsEditor({
  tags,
  change,
  draft,
  setDraft,
  suggestions,
  busy,
  error,
}: {
  tags: string[];
  change: (tags: string[]) => void;
  draft: string;
  setDraft: (draft: string) => void;
  suggestions: string[];
  busy: boolean;
  error?: string;
}) {
  const { markDirty } = useModalDraft();
  const errorId = useId();
  const [localError, setLocalError] = useState("");
  const add = (text: string) => {
    const next = [
      ...new Set([
        ...tags,
        ...text
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      ]),
    ];
    if (next.length > 30 || next.some((tag) => tag.length > 40)) {
      setLocalError(
        "Use up to 30 tags, with no more than 40 characters in each.",
      );
      return;
    }
    markDirty();
    change(next);
    setDraft("");
    setLocalError("");
  };
  const offered = suggestions
    .filter(
      (tag) =>
        !tags.includes(tag) &&
        (!draft.trim() ||
          tag.toLocaleLowerCase().includes(draft.trim().toLocaleLowerCase())),
    )
    .slice(0, 8);
  return (
    <fieldset className="mc-tag-editor">
      <legend>
        Tags <span>{tags.length} selected</span>
      </legend>
      {tags.length > 0 && (
        <div className="mc-token-list">
          {tags.map((tag) => (
            <button
              type="button"
              className="mc-token"
              key={tag}
              disabled={busy}
              aria-label={`Remove tag ${tag}`}
              onClick={() => {
                markDirty();
                change(tags.filter((item) => item !== tag));
              }}
            >
              {tag}
              <X size={12} />
            </button>
          ))}
        </div>
      )}
      <div className="mc-picker-actions">
        <input
          aria-label="Tags"
          name="tags"
          aria-invalid={!!(error || localError)}
          aria-describedby={error || localError ? errorId : undefined}
          placeholder="Type a tag, then press Enter"
          value={draft}
          disabled={busy}
          onChange={(event) => {
            setDraft(event.target.value);
            setLocalError("");
          }}
          onKeyDown={(event) => {
            if (
              !event.metaKey &&
              !event.ctrlKey &&
              (event.key === "Enter" || event.key === ",")
            ) {
              event.preventDefault();
              if (draft.trim()) add(draft);
            }
          }}
        />
        <button
          type="button"
          disabled={busy || !draft.trim()}
          onClick={() => add(draft)}
        >
          Add tag
        </button>
      </div>
      {offered.length > 0 && (
        <div className="mc-suggestions" aria-label="Suggested tags">
          {offered.map((tag) => (
            <button
              type="button"
              key={tag}
              disabled={busy || tags.length >= 30}
              onClick={() => add(tag)}
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
      {(error || localError) && (
        <p id={errorId} className="mc-field-error" role="alert">
          {error ?? localError}
        </p>
      )}
      <p className="mc-help">
        Tags let you slice work across projects. Commas add several at once;
        suggestions come from your workspace.
      </p>
    </fieldset>
  );
}

function ChecklistEditor({
  items,
  change,
  text,
  setText,
  busy,
  error,
}: {
  items: Task["checklist"];
  change: (items: Task["checklist"]) => void;
  text: string;
  setText: (text: string) => void;
  busy: boolean;
  error?: string;
}) {
  const { markDirty } = useModalDraft();
  const errorId = useId();
  const completed = items.filter((item) => item.done).length;
  const update = (next: Task["checklist"]) => {
    markDirty();
    change(next);
  };
  const add = () => {
    if (!text.trim() || text.trim().length > 500 || items.length >= 100) return;
    update([
      ...items,
      { id: crypto.randomUUID(), text: text.trim(), done: false },
    ]);
    setText("");
  };
  const move = (from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    update(next);
  };
  return (
    <fieldset className="mc-checklist-editor">
      <legend>
        Acceptance checklist{" "}
        <span>
          {completed} of {items.length} done
        </span>
      </legend>
      <p className="mc-help">
        Small, verifiable steps help you and your agent agree on what complete
        means.
      </p>
      {items.length > 0 && (
        <progress
          className="mc-checklist-progress"
          aria-label="Checklist completion"
          max={items.length}
          value={completed}
        />
      )}
      {items.map((item, index) => (
        <div className="mc-checklist-item" key={item.id}>
          <input
            type="checkbox"
            checked={item.done}
            disabled={busy}
            aria-label={`Complete ${item.text || `step ${index + 1}`}`}
            onChange={(event) =>
              update(
                items.map((current) =>
                  current.id === item.id
                    ? { ...current, done: event.target.checked }
                    : current,
                ),
              )
            }
          />
          <input
            aria-label={`Checklist item ${index + 1}`}
            name="checklist"
            aria-invalid={
              !!error && (!item.text.trim() || item.text.trim().length > 500)
            }
            aria-describedby={error ? errorId : undefined}
            value={item.text}
            maxLength={500}
            disabled={busy}
            onChange={(event) =>
              update(
                items.map((current) =>
                  current.id === item.id
                    ? { ...current, text: event.target.value }
                    : current,
                ),
              )
            }
          />
          <button
            type="button"
            className="mc-icon"
            disabled={busy || index === 0}
            aria-label={`Move checklist item ${index + 1} up`}
            onClick={() => move(index, index - 1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="mc-icon"
            disabled={busy || index === items.length - 1}
            aria-label={`Move checklist item ${index + 1} down`}
            onClick={() => move(index, index + 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="mc-icon"
            disabled={busy}
            aria-label={`Remove checklist item ${index + 1}`}
            onClick={() =>
              update(items.filter((current) => current.id !== item.id))
            }
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <div className="mc-checklist-add">
        <input
          aria-label="New checklist item"
          name="checklist"
          aria-invalid={
            !!error &&
            !!text.trim() &&
            (items.length >= 100 || text.trim().length > 500)
          }
          aria-describedby={error ? errorId : undefined}
          placeholder="Add a clear acceptance step…"
          value={text}
          maxLength={500}
          disabled={busy || items.length >= 100}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
              event.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          disabled={busy || !text.trim() || items.length >= 100}
          onClick={add}
        >
          <Plus size={14} />
          Add step
        </button>
      </div>
      {error && (
        <p id={errorId} className="mc-field-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

type TaskFormProps = {
  task?: Task;
  projects: Project[];
  projectId: string | null;
  defaultStatus: Task["status"];
  close: () => void;
  submit: (input: TaskInput) => void;
  busy: boolean;
  facets?: Facets;
  error?: string;
};
export function TaskForm(props: TaskFormProps) {
  return (
    <Modal
      title={props.task ? "Shape the task" : "Give your agent a clear mission"}
      close={props.close}
    >
      <TaskFields {...props} />
    </Modal>
  );
}

function TaskFields({
  task,
  projects,
  projectId,
  defaultStatus,
  submit,
  busy,
  facets,
  error,
}: TaskFormProps) {
  const { markDirty } = useModalDraft();
  const { errors, form, invalid, clearField } = useValidation();
  const [selectedProject, setSelectedProject] = useState(
    task?.projectId ??
      projects.find((project) => project.id === projectId && !project.archived)
        ?.id ??
      projects.find((project) => !project.archived)?.id ??
      "",
  );
  const [dependencies, setDependencies] = useState(task?.dependencies ?? []);
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState(task?.status ?? defaultStatus);
  const [due, setDue] = useState(dateValue(task?.dueAt ?? null));
  const [tags, setTags] = useState(task?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [checklist, setChecklist] = useState(task?.checklist ?? []);
  const [checklistDraft, setChecklistDraft] = useState("");
  const categoriesId = useId();
  const statusHelp: Record<Task["status"], string> = {
    inbox: "Capture an idea before it is shaped for execution.",
    ready: "A clear brief, ready for an agent to pick up.",
    active: "Work is underway. Starting an agent is a separate action.",
    review: "The work has been delivered and needs your acceptance.",
    done: "Accepted and complete. Recurring work can begin its next occurrence.",
    cancelled: "Execution has been stopped; move to Ready to reopen the task.",
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    const savedChecklist = checklistDraft.trim()
      ? [
          ...checklist,
          { id: crypto.randomUUID(), text: checklistDraft.trim(), done: false },
        ]
      : checklist;
    const result = taskInput.safeParse({
      projectId: selectedProject,
      title: values.get("title"),
      description,
      status,
      priority: values.get("priority"),
      category: values.get("category"),
      tags: [
        ...new Set([
          ...tags,
          ...tagDraft
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ]),
      ],
      dependencies,
      checklist: savedChecklist,
      dueAt: due ? new Date(`${due}T12:00:00`).getTime() : null,
      historyMode: values.get("historyMode"),
    });
    if (!result.success) {
      invalid(result.error.issues);
      return;
    }
    submit(result.data);
  };
  const presetDue = (days: number | null) => {
    markDirty();
    if (days === null) {
      setDue("");
      return;
    }
    const date = new Date();
    date.setDate(date.getDate() + days);
    setDue(dateValue(date.getTime()));
  };
  return (
    <form
      ref={form}
      onSubmit={save}
      onChangeCapture={clearField}
      noValidate
      aria-busy={busy}
    >
      <FormFeedback errors={errors} error={error} />
      <Field
        label="Task title"
        name="title"
        errors={errors}
        help="Name a concrete outcome. A good title makes progress easy to recognize."
      >
        {(props) => (
          <input
            {...props}
            defaultValue={task?.title}
            placeholder="A concrete outcome, in a few words"
            required
            maxLength={200}
            disabled={busy}
            autoFocus
          />
        )}
      </Field>
      <Field
        label="Brief"
        name="description"
        errors={errors}
        help="Give your agent context, constraints, and evidence of success."
      >
        {(props) => (
          <textarea
            {...props}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Context, requirements, and what success looks like…"
            rows={6}
            maxLength={16000}
            disabled={busy}
          />
        )}
      </Field>
      <div className="mc-brief-presets">
        <span className="mc-help">Start from an outline</span>
        {BRIEF_TEMPLATES.map((template) => (
          <button
            type="button"
            key={template.name}
            disabled={
              busy || description.length + template.text.length + 2 > 16000
            }
            onClick={() => {
              markDirty();
              setDescription((old) =>
                old.trim() ? `${old}\n\n${template.text}` : template.text,
              );
            }}
          >
            {template.name}
          </button>
        ))}
      </div>
      <p className="mc-help">
        Outlines are appended, so your existing brief stays intact.
      </p>
      <div className="mc-form-grid">
        <Field label="Project" name="projectId" errors={errors}>
          {(props) => (
            <select
              {...props}
              value={selectedProject}
              onChange={(event) => setSelectedProject(event.target.value)}
              required
              disabled={busy}
            >
              {projects
                .filter(
                  (project) =>
                    !project.archived || project.id === task?.projectId,
                )
                .map((project) => (
                  <option value={project.id} key={project.id}>
                    {project.name}
                    {project.archived ? " (archived)" : ""}
                  </option>
                ))}
            </select>
          )}
        </Field>
        <Field
          label="Priority"
          name="priority"
          errors={errors}
          help="Urgent → high → normal → low."
        >
          {(props) => (
            <select
              {...props}
              defaultValue={task?.priority ?? "normal"}
              disabled={busy}
            >
              {PRIORITIES.map((priority) => (
                <option value={priority} key={priority}>
                  {priority[0]!.toUpperCase() + priority.slice(1)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="Status"
          name="status"
          errors={errors}
          help={statusHelp[status]}
        >
          {(props) => (
            <select
              {...props}
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as Task["status"])
              }
              disabled={busy}
            >
              {STATUSES.filter(
                (value) =>
                  value !== "cancelled" || task?.status === "cancelled",
              ).map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="Due date"
          name="dueAt"
          errors={errors}
          help="An optional target date for this task."
        >
          {(props) => (
            <input
              {...props}
              type="date"
              value={due}
              onChange={(event) => setDue(event.target.value)}
              disabled={busy}
            />
          )}
        </Field>
      </div>
      {task && task.status !== "cancelled" && (
        <p className="mc-help">
          To cancel work and stop its agent, use Move task in task details.
        </p>
      )}
      <div className="mc-preset-row" aria-label="Due date presets">
        <button type="button" disabled={busy} onClick={() => presetDue(0)}>
          Today
        </button>
        <button type="button" disabled={busy} onClick={() => presetDue(1)}>
          Tomorrow
        </button>
        <button type="button" disabled={busy} onClick={() => presetDue(7)}>
          Next week
        </button>
        <button
          type="button"
          disabled={busy || !due}
          onClick={() => presetDue(null)}
        >
          No due date
        </button>
      </div>
      <Field
        label="Category"
        name="category"
        errors={errors}
        help="Use one category for the kind of work; tags can describe several dimensions."
      >
        {(props) => (
          <input
            {...props}
            list={categoriesId}
            placeholder="e.g. Product, Engineering"
            defaultValue={task?.category}
            maxLength={80}
            disabled={busy}
          />
        )}
      </Field>
      <datalist id={categoriesId}>
        {facets?.categories.map((category) => (
          <option value={category} key={category} />
        ))}
      </datalist>
      <TagsEditor
        tags={tags}
        change={setTags}
        draft={tagDraft}
        setDraft={setTagDraft}
        suggestions={facets?.tags ?? []}
        busy={busy}
        error={errors["tags"]}
      />
      <ChecklistEditor
        items={checklist}
        change={setChecklist}
        text={checklistDraft}
        setText={setChecklistDraft}
        busy={busy}
        error={errors["checklist"]}
      />
      <Field
        label="Session presentation"
        name="historyMode"
        errors={errors}
        help="Summaries stay with the task. Original conversations remain available in run history."
      >
        {(props) => (
          <select
            {...props}
            defaultValue={task?.historyMode ?? "overview"}
            disabled={busy}
          >
            <option value="overview">Keep the overview in focus</option>
            <option value="conversation">Show conversation links</option>
          </select>
        )}
      </Field>
      <DependencyPicker
        taskId={task?.id}
        dependencies={dependencies}
        change={setDependencies}
        projects={projects}
        busy={busy}
      />
      {errors["dependencies"] && (
        <p className="mc-field-error" role="alert">
          {errors["dependencies"]}
        </p>
      )}
      <Footer
        busy={busy}
        disabled={!selectedProject}
        label={task ? "Save changes" : "Create task"}
        icon={<Plus size={15} />}
      />
    </form>
  );
}

type ScheduleFormProps = {
  detail: TaskDetail;
  close: () => void;
  submit: (trigger: MissionTrigger) => void;
  busy: boolean;
  error?: string;
};
export function ScheduleForm(props: ScheduleFormProps) {
  return (
    <Modal title="Put this mission on a rhythm" close={props.close}>
      <ScheduleFields {...props} />
    </Modal>
  );
}

function ScheduleFields({ detail, submit, busy, error }: ScheduleFormProps) {
  const trigger = detail.automation?.charter.trigger;
  const { markDirty } = useModalDraft();
  const { errors, setErrors, form, invalid, clearField } = useValidation();
  const [kind, setKind] = useState<MissionTrigger["kind"]>(
    trigger?.kind ?? "cron",
  );
  const [expression, setExpression] = useState(
    trigger?.kind === "cron" ? trigger.expression : "0 9 * * 1-5",
  );
  const [timezone, setTimezone] = useState(
    trigger?.kind === "cron" ? trigger.timezone : browserTimezone(),
  );
  const [minutes, setMinutes] = useState(
    String(trigger?.kind === "schedule" ? trigger.everyMs / 60000 : 60),
  );
  const [maxRuns, setMaxRuns] = useState(
    trigger && "maxRuns" in trigger && trigger.maxRuns !== undefined
      ? String(trigger.maxRuns)
      : "",
  );
  const [until, setUntil] = useState(
    trigger && "untilAt" in trigger ? localDateTime(trigger.untilAt) : "",
  );
  const [anchor, setAnchor] = useState(
    trigger?.kind === "schedule" ? localDateTime(trigger.anchorAt) : "",
  );
  const [jitter, setJitter] = useState(
    trigger?.kind === "schedule" && trigger.jitterMs !== undefined
      ? String(trigger.jitterMs / 60000)
      : "",
  );
  const timezoneList = useId();
  const timezones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);
  const visual = useMemo(() => {
    try {
      return cronVisualSchedule(expression);
    } catch {
      return null;
    }
  }, [expression]);
  const time =
    visual && "hour" in visual
      ? `${String(visual.hour).padStart(2, "0")}:${String(visual.minute).padStart(2, "0")}`
      : "09:00";
  const frequency =
    visual?.mode === "daily"
      ? "daily"
      : visual?.mode === "weekly" &&
          visual.weekdays.length === 5 &&
          [1, 2, 3, 4, 5].every((day) => visual.weekdays.includes(day))
        ? "weekdays"
        : visual?.mode === "weekly" && visual.weekdays.length === 1
          ? "weekly"
          : "custom";
  const calendar = (
    mode: "daily" | "weekdays" | "weekly",
    nextTime = time,
    day = visual?.mode === "weekly" && visual.weekdays.length === 1
      ? visual.weekdays[0]!
      : 1,
  ) => {
    const [hour, minute] = nextTime.split(":").map(Number);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return;
    markDirty();
    setExpression(
      cronExpressionFromVisual(
        mode === "daily"
          ? { mode: "daily", hour: hour!, minute: minute! }
          : {
              mode: "weekly",
              hour: hour!,
              minute: minute!,
              weekdays: mode === "weekdays" ? [1, 2, 3, 4, 5] : [day],
            },
      ),
    );
  };
  const preview = useMemo(() => {
    if (kind === "manual")
      return {
        summary: "Runs only when you start it.",
        occurrences: [] as number[],
      };
    if (kind === "schedule")
      return Number(minutes) >= 1
        ? {
            summary: `Every ${Number(minutes)} minute${Number(minutes) === 1 ? "" : "s"}.`,
            occurrences: [] as number[],
          }
        : { error: "Choose an interval of at least one minute." };
    try {
      return {
        summary: describeCronSchedule(expression, timezone),
        occurrences: cronUpcomingOccurrences(
          expression,
          timezone,
          Date.now(),
          3,
        ),
      };
    } catch (error) {
      return { error: message(error) };
    }
  }, [kind, minutes, expression, timezone]);
  const stopTime = until ? new Date(until).getTime() : undefined;
  const lifetimeUsed = detail.automation?.runCount ?? 0;
  const remaining = maxRuns
    ? Math.max(0, Number(maxRuns) - lifetimeUsed)
    : undefined;
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const nextErrors: FieldErrors = {};
    let canonicalExpression = expression;
    let canonicalTimezone = timezone;
    if (kind === "cron") {
      try {
        canonicalExpression = canonicalCronExpression(expression);
      } catch (error) {
        nextErrors["expression"] = message(error);
      }
      try {
        canonicalTimezone = canonicalCronTimeZone(timezone);
      } catch (error) {
        nextErrors["timezone"] = message(error);
      }
    }
    if (
      kind === "schedule" &&
      jitter &&
      (!Number.isFinite(Number(jitter)) ||
        Number(jitter) < 0 ||
        Number(jitter) >= Number(minutes))
    )
      nextErrors["jitterMs"] =
        "Jitter must be non-negative and smaller than the interval.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    const savedUntil =
      trigger &&
      "untilAt" in trigger &&
      until === localDateTime(trigger.untilAt)
        ? trigger.untilAt
        : stopTime;
    const savedAnchor =
      trigger?.kind === "schedule" && anchor === localDateTime(trigger.anchorAt)
        ? trigger.anchorAt
        : anchor
          ? new Date(anchor).getTime()
          : undefined;
    const end = {
      ...(maxRuns ? { maxRuns: Number(maxRuns) } : {}),
      ...(until ? { untilAt: savedUntil } : {}),
    };
    const result = triggerSchema.safeParse(
      kind === "manual"
        ? { kind: "manual" }
        : kind === "schedule"
          ? {
              kind: "schedule",
              everyMs: Number(minutes) * 60000,
              ...(anchor ? { anchorAt: savedAnchor } : {}),
              ...(jitter ? { jitterMs: Number(jitter) * 60000 } : {}),
              ...end,
            }
          : {
              kind: "cron",
              expression: canonicalExpression,
              timezone: canonicalTimezone,
              ...end,
            },
    );
    if (!result.success) {
      invalid(result.error.issues);
      return;
    }
    submit(result.data);
  };
  return (
    <form
      ref={form}
      onSubmit={save}
      onChangeCapture={clearField}
      noValidate
      aria-busy={busy}
    >
      <FormFeedback errors={errors} error={error} />
      <p className="mc-help">
        Each occurrence starts an isolated agent session on this task. One run
        at a time; all results stay in its history.
      </p>
      <Field label="Repeat" name="kind" errors={errors}>
        {(props) => (
          <select
            {...props}
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as MissionTrigger["kind"])
            }
            disabled={busy}
          >
            <option value="cron">On a calendar</option>
            <option value="schedule">At a regular interval</option>
            <option value="manual">Only when I start it</option>
          </select>
        )}
      </Field>
      {kind === "cron" && (
        <>
          <div className="mc-preset-row" aria-label="Calendar presets">
            <button
              type="button"
              aria-pressed={frequency === "daily"}
              disabled={busy}
              onClick={() => calendar("daily")}
            >
              Daily
            </button>
            <button
              type="button"
              aria-pressed={frequency === "weekdays"}
              disabled={busy}
              onClick={() => calendar("weekdays")}
            >
              Weekdays
            </button>
            <button
              type="button"
              aria-pressed={frequency === "weekly"}
              disabled={busy}
              onClick={() => calendar("weekly")}
            >
              Weekly
            </button>
          </div>
          {frequency !== "custom" && (
            <div className="mc-form-grid">
              <Field label="Run at" name="calendarTime" errors={errors}>
                {(props) => (
                  <input
                    {...props}
                    type="time"
                    value={time}
                    disabled={busy}
                    onChange={(event) =>
                      calendar(frequency, event.target.value)
                    }
                  />
                )}
              </Field>
              {frequency === "weekly" && (
                <Field label="Day" name="weekday" errors={errors}>
                  {(props) => (
                    <select
                      {...props}
                      value={visual?.mode === "weekly" ? visual.weekdays[0] : 1}
                      disabled={busy}
                      onChange={(event) =>
                        calendar("weekly", time, Number(event.target.value))
                      }
                    >
                      {[
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                      ].map((day, index) => (
                        <option key={day} value={index}>
                          {day}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              )}
            </div>
          )}
          <Field
            label="Timezone"
            name="timezone"
            errors={errors}
            help="Calendar times follow this timezone, including daylight-saving changes."
          >
            {(props) => (
              <input
                {...props}
                list={timezoneList}
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                disabled={busy}
                required
                maxLength={128}
              />
            )}
          </Field>
          <datalist id={timezoneList}>
            <option value="UTC" />
            {timezones.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
          <Field
            label="Calendar expression"
            name="expression"
            errors={errors}
            help="Minute · hour · day of month · month · weekday. Presets fill this in for you; edit it for a custom schedule."
          >
            {(props) => (
              <input
                {...props}
                value={expression}
                onChange={(event) => setExpression(event.target.value)}
                disabled={busy}
                required
                maxLength={512}
                spellCheck={false}
              />
            )}
          </Field>
        </>
      )}
      {kind === "schedule" && (
        <>
          <Field
            label="Interval in minutes"
            name="everyMs"
            errors={errors}
            help="At least one minute. 60 = hourly; 1440 = daily."
          >
            {(props) => (
              <input
                {...props}
                type="number"
                min={1}
                step="any"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                disabled={busy}
                required
              />
            )}
          </Field>
          <div className="mc-preset-row" aria-label="Interval presets">
            {[
              { minutes: 15, label: "Every 15 minutes" },
              { minutes: 60, label: "Hourly" },
              { minutes: 1440, label: "Daily" },
            ].map((preset) => (
              <button
                type="button"
                key={preset.minutes}
                disabled={busy}
                onClick={() => {
                  markDirty();
                  setMinutes(String(preset.minutes));
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <details className="mc-advanced-schedule">
            <summary>Advanced interval timing</summary>
            <Field
              label="Start anchor"
              name="anchorAt"
              errors={errors}
              help={`Optional. Enter the anchor in your device timezone (${browserTimezone()}).`}
            >
              {(props) => (
                <input
                  {...props}
                  type="datetime-local"
                  value={anchor}
                  onChange={(event) => setAnchor(event.target.value)}
                  disabled={busy}
                />
              )}
            </Field>
            <Field
              label="Jitter in minutes"
              name="jitterMs"
              errors={errors}
              help="Optional variation between occurrences; must be smaller than the interval."
            >
              {(props) => (
                <input
                  {...props}
                  type="number"
                  min={0}
                  step="any"
                  value={jitter}
                  onChange={(event) => setJitter(event.target.value)}
                  disabled={busy}
                />
              )}
            </Field>
          </details>
        </>
      )}
      {kind !== "manual" && (
        <div className="mc-form-grid">
          <Field
            label="Maximum lifetime runs"
            name="maxRuns"
            errors={errors}
            help={`${lifetimeUsed} runs already used. Leave empty for no limit.`}
          >
            {(props) => (
              <input
                {...props}
                type="number"
                min={1}
                step={1}
                placeholder="No limit"
                value={maxRuns}
                onChange={(event) => setMaxRuns(event.target.value)}
                disabled={busy}
              />
            )}
          </Field>
          <Field
            label="Stop after"
            name="untilAt"
            errors={errors}
            help={`Optional. Enter this deadline in your device timezone (${browserTimezone()}).`}
          >
            {(props) => (
              <input
                {...props}
                type="datetime-local"
                value={until}
                onChange={(event) => setUntil(event.target.value)}
                disabled={busy}
              />
            )}
          </Field>
        </div>
      )}
      <section className="mc-schedule-preview" aria-label="Automation preview">
        {"error" in preview ? (
          <p className="mc-field-error">{preview.error}</p>
        ) : (
          <>
            <strong>{preview.summary}</strong>
            {kind !== "manual" && (
              <p className="mc-help">
                {remaining !== undefined
                  ? `${remaining} lifetime run${remaining === 1 ? "" : "s"} remaining.`
                  : "No run limit."}
                {Number.isFinite(stopTime)
                  ? ` Stops after ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(stopTime)}.`
                  : ""}
              </p>
            )}
            {kind === "cron" && (
              <ol className="mc-occurrence-list">
                {preview.occurrences
                  .filter((at) => stopTime === undefined || at <= stopTime)
                  .slice(0, remaining ?? 3)
                  .map((at) => (
                    <li key={at}>
                      <time dateTime={new Date(at).toISOString()}>
                        {formatCronOccurrence(at, timezone)}
                      </time>
                    </li>
                  ))}
              </ol>
            )}
          </>
        )}
      </section>
      <p className="mc-help">
        The platform acquires permissions for this automation. Pending decisions
        stay in your approval inbox.
      </p>
      <Footer
        busy={busy}
        label="Save automation"
        icon={<CalendarClock size={15} />}
      />
    </form>
  );
}

type FiltersProps = {
  view: View;
  apply: (view: View) => void;
  close: () => void;
  busy: boolean;
  facets?: Facets;
  error?: string;
};
export function Filters(props: FiltersProps) {
  return (
    <Modal title="Find your focus" close={props.close}>
      <FilterFields {...props} />
    </Modal>
  );
}

function FilterFields({ view, apply, busy, facets, error }: FiltersProps) {
  const { errors, form, invalid, clearField } = useValidation();
  const [due, setDue] = useState(view.due);
  const [timezone, setTimezone] = useState(view.timezone);
  const tagsId = useId();
  const categoriesId = useId();
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    const result = viewInput.safeParse({
      ...view,
      statuses: values.getAll("status"),
      priorities: values.getAll("priority"),
      tag: values.get("tag"),
      category: values.get("category"),
      sort: values.get("sort"),
      due,
      timezone,
      execution: values.get("execution"),
      blocked: values.get("blocked") === "on",
    });
    if (!result.success) {
      invalid(result.error.issues);
      return;
    }
    apply(result.data);
  };
  return (
    <form
      ref={form}
      onSubmit={save}
      onChangeCapture={clearField}
      noValidate
      aria-busy={busy}
    >
      <FormFeedback errors={errors} error={error} />
      <fieldset>
        <legend>Status</legend>
        <div className="mc-filter-options">
          {STATUSES.map((status) => (
            <label className="mc-check" key={status}>
              <input
                type="checkbox"
                name="status"
                value={status}
                defaultChecked={view.statuses.includes(status)}
                disabled={busy}
              />
              {STATUS_LABELS[status]}
            </label>
          ))}
        </div>
        <p className="mc-help">Leave all unchecked to include every status.</p>
      </fieldset>
      <fieldset>
        <legend>Priority</legend>
        <div className="mc-filter-options">
          {PRIORITIES.map((priority) => (
            <label className="mc-check" key={priority}>
              <input
                type="checkbox"
                name="priority"
                value={priority}
                defaultChecked={view.priorities.includes(priority)}
                disabled={busy}
              />
              {priority[0]!.toUpperCase() + priority.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mc-form-grid">
        <Field label="Tag" name="tag" errors={errors}>
          {(props) => (
            <input
              {...props}
              list={tagsId}
              defaultValue={view.tag}
              placeholder="Any tag"
              maxLength={40}
              disabled={busy}
            />
          )}
        </Field>
        <Field label="Category" name="category" errors={errors}>
          {(props) => (
            <input
              {...props}
              list={categoriesId}
              defaultValue={view.category}
              placeholder="Any category"
              maxLength={80}
              disabled={busy}
            />
          )}
        </Field>
      </div>
      <datalist id={tagsId}>
        {facets?.tags.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      <datalist id={categoriesId}>
        {facets?.categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
      <div className="mc-form-grid">
        <Field label="Due" name="due" errors={errors}>
          {(props) => (
            <select
              {...props}
              value={due}
              disabled={busy}
              onChange={(event) => {
                const next = event.target.value as View["due"];
                if (due === "any" && next !== "any")
                  setTimezone(browserTimezone());
                setDue(next);
              }}
            >
              <option value="any">Any due date</option>
              <option value="overdue">Overdue</option>
              <option value="today">Today</option>
              <option value="week">Next 7 days</option>
              <option value="none">No due date</option>
            </select>
          )}
        </Field>
        <Field label="Agent execution" name="execution" errors={errors}>
          {(props) => (
            <select {...props} defaultValue={view.execution} disabled={busy}>
              <option value="any">Any task</option>
              <option value="linked">Agent linked</option>
              <option value="unlinked">No agent linked</option>
            </select>
          )}
        </Field>
      </div>
      {due !== "any" && due !== "none" && (
        <Field
          label="Date filter timezone"
          name="timezone"
          errors={errors}
          help="Today, overdue, and the next 7 days follow this timezone."
        >
          {(props) => (
            <input
              {...props}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              maxLength={128}
              disabled={busy}
            />
          )}
        </Field>
      )}
      <fieldset>
        <legend>Readiness</legend>
        <label className="mc-check">
          <input
            type="checkbox"
            name="blocked"
            defaultChecked={view.blocked}
            disabled={busy}
          />
          Only tasks blocked by unfinished dependencies
        </label>
        <p className="mc-help">
          Task readiness is separate from an agent’s run status.
        </p>
      </fieldset>
      <Field label="Sort by" name="sort" errors={errors}>
        {(props) => (
          <select {...props} defaultValue={view.sort} disabled={busy}>
            <option value="priority">Priority</option>
            <option value="updated">Recently updated</option>
            <option value="due">Due date</option>
          </select>
        )}
      </Field>
      <div className="mc-form-footer">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            apply({
              ...emptyView(),
              projectId: view.projectId,
              layout: view.layout,
            })
          }
        >
          Reset filters
        </button>
        <ModalCloseButton />
        <button type="submit" className="mc-primary" disabled={busy}>
          Apply filters
          <Check size={15} />
        </button>
      </div>
    </form>
  );
}
