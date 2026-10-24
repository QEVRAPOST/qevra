/**
 * Locked strings (docs/QEVRA_DESIGN_DIRECTION.md section 2.2). They are verbatim from the approved design and
 * the PM brief. Change them only when the PM changes them. The copy lint (scripts/copy-lint.mjs) checks that
 * each one appears exactly in this file.
 */

/** Core sentence, wherever the Swarm is introduced. */
export const CORE_SENTENCE = "The Security Swarm researches, analyzes, verifies, and reports. It does not control your wallet.";

/** Swarm paragraph, split at the sentence break on the landing band. */
export const SWARM_PARAGRAPH_A =
  "VEYRA’s agents do not access your private keys, sign transactions on your behalf, or move your funds. They research approved public sources and check quoted evidence against retrieved source text.";
export const SWARM_PARAGRAPH_B =
  "Proposed security changes must pass deterministic tests, appropriate security review, and explicit human approval before deployment.";
export const SWARM_PARAGRAPH = `${SWARM_PARAGRAPH_A} ${SWARM_PARAGRAPH_B}`;

/** Post-quantum note, in its landing and app wordings. */
export const PQ_NOTE_LEAD = "About post-quantum.";
export const PQ_NOTE =
  "ML-DSA is the initial candidate scheme, standardized by NIST as FIPS 204. QEVRA makes no claim that it resists quantum attacks, and no claim about the rest of Robinhood Chain.";
export const PQ_NOTE_APP =
  "ML-DSA is the initial candidate scheme (NIST FIPS 204). QEVRA makes no claim that it resists quantum attacks, and no claim about the rest of Robinhood Chain. Independent review is needed before any mainnet use.";

/** PQC-protected rule. */
export const PQC_RULE =
  "An account can be called PQC-protected only if no ordinary wallet key can withdraw funds or replace the key. That is still being designed, and independent review is needed before any mainnet use.";

/** Landing footer. These describe the current product surface and change when the underlying facts change. */
export const FOOTER_PREVIEW =
  "Robinhood Mainnet quotes depend on 0x configuration and liquidity. Wallet approvals are explicit; post-quantum custody remains under research.";
export const FOOTER_ROBINHOOD =
  "Built for Robinhood Chain. Robinhood brand-use rules have not been checked yet, so the name appears only in plain text.";

/** Wallet and PQ Vault. */
export const TWO_LEDGERS =
  "Two ledgers, and no combined total. They do not share the same protection, so QEVRA never adds them together.";
export const ACCOUNT_CONTROL_LEAD = "Who controls the account.";
export const ACCOUNT_CONTROL =
  "Which key controls a QEVRA account, and what your connected wallet can do after setup, is still being designed.";
export const ACCOUNT_CONTROL_RULE =
  "Until a conventional wallet key is ruled out as a way to withdraw or replace the key, QEVRA does not call this account protected.";

/** Intent Lock caption. Describes the prototype: it changes when the comparison becomes a real check. */
export const INTENT_LOCK_CAPTION =
  "This comparison runs in your browser on example values. It is a way to notice a change, not a security check.";

/** Passed / completed legend. */
export const PASSED_LEGEND_PASSED = "Passed";
export const PASSED_LEGEND_BODY =
  "appears only for a named, deterministic test with a definition link. No test is shown as passed here.";
export const PASSED_LEGEND_COMPLETED = "Run completed";
export const PASSED_LEGEND_COMPLETED_BODY = "means all three reported stages finished; it is not an audit or security approval.";
