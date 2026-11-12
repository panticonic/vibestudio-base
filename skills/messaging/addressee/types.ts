/** One row of `addressees.list()`: someone the agent can message in this conversation. */
export type AddresseeRow = {
  /** The exact `to` value `notify` accepts for this recipient ("(omit `to`)" is the whole channel). */
  ref: string;
  /** "channel", a participant kind ("user", "agent", ...), "supervisor", or "subagent run". */
  kind: string;
  /** A short description: a display name with the chat surface in parentheses, or a run status. */
  note: string;
};

/** The recipient the user meant: one exact ref, ready for `notify`'s `to`. */
export type Resolved = { kind: "ref"; ref: string; note: string };

/**
 * No single recipient could be established. Nothing is guessed: the caller asks the user which one,
 * showing `candidates` ("several": more than one row fits or may fit; "none": no row fits, and the
 * candidates are the whole roster).
 */
export type Ambiguous = {
  kind: "ambiguous";
  reason: "several" | "none";
  candidates: AddresseeRow[];
};

export type Resolution = Resolved | Ambiguous;
