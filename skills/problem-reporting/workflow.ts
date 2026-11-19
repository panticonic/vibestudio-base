import { problemReports } from "@workspace/runtime";
import type {
  Evidence,
  LocalDraft,
  LocalDraftConfirmation,
  LocalDraftSection,
  LocalDraftWrite,
  LocalProblemObservation,
  SaveProblemRequest,
} from "./natlang/types.js";

type LiveDraft = Awaited<ReturnType<typeof problemReports.get>>;

function projectDraft(draft: LiveDraft): LocalDraft {
  return {
    id: draft.id,
    revision: draft.revision,
    existingSections: draft.value.narrative.map(({ section }) => section),
  };
}

/** Scope the write to a caller-authorized save and a single owned draft. */
export function bindLocalProblemDraft(assignment: {
  goal: string;
  account: Evidence;
  existing: { id: string; basisRevision: number } | null;
}) {
  const { account, existing, goal } = structuredClone(assignment);
  const operationId = crypto.randomUUID();
  const request: SaveProblemRequest = { goal, operationId };
  let observation: Promise<LocalProblemObservation> | undefined;
  let draft: LocalDraft | null = null;
  let opening = false;
  let appending = false;
  let write: LocalDraftWrite | null = null;
  let appended: LocalDraftSection[] = [];

  return {
    request,
    services: {
      problemDraftRead: {
        async observe(id: string): Promise<LocalProblemObservation> {
          if (id !== operationId)
            throw new Error("Read only the assigned problem");
          observation ??= (async () => {
            const report = existing
              ? await problemReports.get(existing.id)
              : null;
            if (report && report.value.intent !== "manual-problem")
              throw new Error("Continue the assigned manual report");
            draft = report && projectDraft(report);
            return {
              draft,
              review: {
                goal,
                account,
                consent: "save",
                draft:
                  draft && existing
                    ? {
                        id: draft.id,
                        revision: draft.revision,
                        basisRevision: existing.basisRevision,
                        userEdits:
                          report?.value.narrative.some(
                            ({ author }) => author === "user",
                          ) ?? false,
                      }
                    : null,
                evidence: [],
                frozen: null,
              },
            };
          })();
          return await observation;
        },
        async confirm(
          receipt: LocalDraftWrite,
        ): Promise<LocalDraftConfirmation> {
          if (
            !write ||
            receipt.id !== write.id ||
            receipt.revision !== write.revision ||
            receipt.sectionIds.length !== write.sectionIds.length ||
            !receipt.sectionIds.every(
              (id, index) => id === write?.sectionIds[index],
            )
          )
            throw new Error("Confirm only the assigned append receipt");
          const report = await problemReports.get(write.id);
          if (report.revision !== write.revision)
            throw new Error(
              "The report changed after append. Read its current revision.",
            );
          const sections = write.sectionIds.map((id, index) => {
            const observed = report.value.narrative.find(
              (section) => section.id === id,
            );
            const expected = appended[index];
            if (
              !observed ||
              !expected ||
              observed.section !== expected.section ||
              observed.claims !== expected.claims ||
              observed.markdown !== expected.markdown
            )
              throw new Error(
                "Saved narrative does not match the assigned append",
              );
            const { section, claims, markdown } = expected;
            return { section, claims, markdown };
          });
          return { ...write, sections };
        },
      },
      problemDraftOpen: {
        async create(id: string): Promise<LocalDraft> {
          if (id !== operationId || !observation || existing || opening)
            throw new Error("Create the assigned manual report at most once");
          opening = true;
          await observation;
          const opened = await problemReports.create({
            category: "quality",
            component: "unknown",
            operation: account.operation,
            code: null,
            kind: "unknown",
            frames: [],
            externalFramesOmitted: 0,
            symptom: account.observed,
            expected: account.expected,
          });
          draft = projectDraft(opened);
          return draft;
        },
      },
      problemDraftAppend: {
        async append(
          target: LocalDraft,
          sections: LocalDraftSection[],
        ): Promise<LocalDraftWrite> {
          if (
            !draft ||
            target.id !== draft.id ||
            target.revision !== draft.revision ||
            (existing && existing.basisRevision !== draft.revision) ||
            appending
          )
            throw new Error(
              "Append only to the assigned draft at its observed revision",
            );

          const hasSymptom = draft.existingSections.includes("symptom");
          const last = sections.at(-1);
          const symptom = sections[0];
          if (
            sections.length !== (hasSymptom ? 1 : 2) ||
            !last ||
            (last.section !== "verification" && last.section !== "questions") ||
            last.claims !== "unverified" ||
            !last.markdown.trim() ||
            (account.expected.trim() &&
              (last.section !== "verification" ||
                !last.markdown.includes(account.expected))) ||
            (!hasSymptom &&
              (!symptom ||
                symptom.section !== "symptom" ||
                symptom.claims !==
                  (account.reproduced ? "observed" : "unverified") ||
                ![account.goal, account.observed, account.expected].every(
                  (text) => symptom.markdown.includes(text),
                )))
          )
            throw new Error(
              "Preserve the exact account and append a separate unverified check",
            );
          appending = true;
          appended = structuredClone(sections);
          write = await problemReports.appendNarrative(
            draft.id,
            target.revision,
            appended.map(({ section, claims, markdown }) => ({
              section,
              claims,
              markdown,
              authorLabel: "Assistant",
              evidenceIds: [],
            })),
          );
          return write;
        },
      },
    },
  };
}
