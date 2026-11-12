# resolveAddressee: decomposition

`resolveAddressee(utterance): Resolution` turns "tell Maria the build passed" into the exact ref `notify` takes as `to`,
or says why it cannot. It resolves; it never sends. `notify` itself, its approval and its alert rung stay with the
agent (the effects rule of the natlang integration plan, section 6).

**Outcome: crisp, no model.** The executor (LFM3 1.7B Q8_0) did not meet the gates, so no model is asked; the function
is the exact part only, and the agent (the capable model) makes any judgment the lexical rule declines.

| Part                                        | Form                                                        | Why                                                                                                                                                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Read who can be messaged                    | crisp: `addressees.list()` in `resolveAddressee/resolve.ts` | The roster is the outside world. The `addressees` service is the only authority the program holds: read-only, no send.                                                                                                               |
| Which rows the utterance names              | crisp: `resolveAddressee/lexical.ts`                        | Whole-word, accent-folded matching of names, handles, chat surfaces, run states (with their synonyms) and the few words that name a role (supervisor, channel, subagent run). The rows holding the most distinct evidence words win. |
| One winner, a tie, or none                  | crisp, in `resolve.ts`                                      | One winner is the ref. A tie is returned as an ambiguity with the tied rows (a message must never reach the wrong person; asking costs one line). No row named returns the whole roster.                                             |
| A paraphrase ("the one who reviews my PRs") | agent                                                       | Left to the capable model reading the returned roster.                                                                                                                                                                               |
| Carrier `resolveAddressee.nl`               | one instruction                                             | A loaded `.nl` function owns its callable folder, which holds the service-touching code. Agents call the exact child `resolveAddressee.resolve(utterance)`.                                                                          |
| Recipient lists                             | not handled                                                 | One recipient per call. `notify.to` takes a list; resolve each name separately.                                                                                                                                                      |

## What measurement changed

Same cases, LFM3 Q8_0 as executor (`pnpm natlang:eval`):

1. One scored judgment per row (`rowFit`: yes, maybe or no, then an exact rule: one yes and no maybe). Validation 0.11 (8 of 9
   cases came back "several": the model said yes or maybe to most rows). Nothing was sent to a wrong recipient, but nothing resolved.
2. Lexical matching first, then one numbered pick (`pickRow`) when no row is named. Validation 0.89, test 0.91, but on
   `devices-4` ("Message the supervisor", no supervisor present) the model picked the channel row: the message would have
   gone to everyone. That is the one failure this function exists to prevent, so the model's pick was removed.
3. Lexical matching alone (shipped): validation 0.89, test 1.00, gates passed, because the cases the model never sees are
   decided exactly, and the one it was asked about is returned as "none" with the roster. Known miss: `pipeline-4`
   ("Tell Priya the run is done") also names every subagent run through the word "run" and returns "several" instead of "none".

## Measurement

`suite.ts` and `cases.jsonl` hold the rosters and utterances (rows in the format `list_addressees` prints, taken from
`agentic-protocol/src/addressee.ts`'s `listAddressees`). Related utterances share a roster and a split. Gates: accuracy of
at least 0.85 on validation and on the locked test split, and no case where a message would reach a recipient other
than the named one (`noWrongRecipient`).
