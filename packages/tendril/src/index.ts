/**
 * `@workspace/tendril` — the tendril kit (tendrils plan §5.3).
 *
 * The root entry is environment-neutral (TendrilDO imports it): protocol,
 * shared state operations, phrase matcher and the TendrilDO address. Pages
 * import `@workspace/tendril/page` (`connectTendril`, `mountTendrilControl`);
 * agents import `@workspace/tendril/agent` from eval.
 */
export * from "./protocol.js";
export * from "./state.js";
export * from "./phrases.js";
export * from "./do-contract.js";
