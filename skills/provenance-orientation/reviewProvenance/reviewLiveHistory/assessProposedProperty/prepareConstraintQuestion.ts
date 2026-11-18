import type {
  ConstraintQuestion,
  HistoryReceipt,
  HistoryRequest,
  ProvenanceFact,
} from "../../../types.js";

export default function prepareConstraintQuestion(
  request: HistoryRequest,
  receipts: HistoryReceipt[],
): ConstraintQuestion {
  const proposedProperty = request.proposedProperty;
  if (!proposedProperty) throw new Error("A proposed property is required");
  const distinct = new Map<string, { rank: number; fact: ProvenanceFact }>();
  const records = receipts.flatMap(({ check, records }) =>
    records.map((record) => ({ walk: check.walk, record })),
  );
  const isRejection = (record: HistoryReceipt["records"][number]) =>
    record.group === "counteractions" || record.group === "reverts";
  records.forEach(({ walk, record }) => {
    const key =
      record.intent && record.tier !== "mechanical"
        ? JSON.stringify([record.tier, record.intent])
        : record.source;
    const rank =
      record.group === "counteractions" ? 2 : isRejection(record) ? 1 : 0;
    if (rank > (distinct.get(key)?.rank ?? -1)) {
      const tier = record.tier ?? "mechanical";
      const kind = isRejection(record)
        ? "rejection"
        : walk === "cohort"
          ? "cohort"
          : walk === "cause"
            ? "cause"
            : "history";
      distinct.set(key, {
        rank,
        fact: {
          ref: record.ref,
          kind,
          tier,
          disclosed: true,
          summary: [record.label, record.detail, record.intent]
            .filter(Boolean)
            .join(". "),
        },
      });
    }
  });
  return {
    kind: "constraint",
    goal: request.goal,
    proposedProperty,
    evidence: [...distinct.values()].map(({ fact }) => fact),
    boundary: receipts.some(({ limited }) => limited)
      ? "outside-visibility"
      : "none",
  };
}
