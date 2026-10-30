/** The mechanism that answers a question about why tracked state is the way it is. */
export type ProvenanceMechanism =
  | "attached-read"
  | "cause"
  | "cohort"
  | "relate"
  | "blame"
  | "rejections"
  | "search"
  | "memory-recall"
  | "query"
  | "direct-edges";
