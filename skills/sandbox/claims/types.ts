/** One fact a text should state. */
export type Claim = {
  /** A stable name for the claim, echoed in its verdict. */
  id: string;
  /** The fact, as one plain sentence ("The blob's bytes were read back unchanged."). */
  claim: string;
  /**
   * A case-insensitive regular expression (source text) that already recognises the usual wording. A match anywhere in
   * the text settles the claim as stated with no model call; no match leaves it to the model.
   */
  match?: string;
};

/** states: the text says it, in any words. contradicts: the text says the opposite, or that it did not happen. absent: neither. */
export type ClaimVerdict = "states" | "contradicts" | "absent";

export type ClaimResult = {
  id: string;
  verdict: ClaimVerdict;
  /** The sentence of the text that bears on the claim, copied exactly; absent when no sentence shares its words. */
  quote?: string;
  /** match: the claim's own pattern settled it; model: the executor judged it. */
  by: "match" | "model";
};

export type ClaimCheck = {
  /** Every claim is stated. */
  satisfied: boolean;
  verdicts: ClaimResult[];
};
