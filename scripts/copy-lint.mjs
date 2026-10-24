#!/usr/bin/env node
/*
 * Copy lint (docs/QEVRA_DESIGN_DIRECTION.md section 2.1 and 2.2).
 *   - FAIL on banned claims in any user-facing string.
 *   - WARN on "safe", "secure" and "protected": review each hit by hand.
 *   - FAIL if a locked string is missing or changed in src/lib/content/copy-lock.ts.
 * Run: bun run lint:copy
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");

const BANNED = [
  { re: /quantum[- ]proof|unhackable|guaranteed safe|quantum[- ]safe|quantum[- ]secure/i, why: "banned claim" },
  { re: /(?<!not )(?<!un)audited/i, why: 'claims an audit ("Not audited" and "No audit yet" are fine)' },
];
const WARN = /\b(safe|secure|protected)\b/i;

/** Verbatim strings from the approved design (section 2.2). */
const LOCKED = [
  "The Security Swarm researches, analyzes, verifies, and reports. It does not control your wallet.",
  "VEYRA’s agents do not access your private keys, sign transactions on your behalf, or move your funds. They research approved public sources and check quoted evidence against retrieved source text.",
  "Proposed security changes must pass deterministic tests, appropriate security review, and explicit human approval before deployment.",
  "ML-DSA is the initial candidate scheme, standardized by NIST as FIPS 204. QEVRA makes no claim that it resists quantum attacks, and no claim about the rest of Robinhood Chain.",
  "An account can be called PQC-protected only if no ordinary wallet key can withdraw funds or replace the key. That is still being designed, and independent review is needed before any mainnet use.",
  "Robinhood Mainnet quotes depend on 0x configuration and liquidity. Wallet approvals are explicit; post-quantum custody remains under research.",
  "Built for Robinhood Chain. Robinhood brand-use rules have not been checked yet, so the name appears only in plain text.",
  "Two ledgers, and no combined total. They do not share the same protection, so QEVRA never adds them together.",
  "Which key controls a QEVRA account, and what your connected wallet can do after setup, is still being designed.",
  "This comparison runs in your browser on example values. It is a way to notice a change, not a security check.",
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}

/** Remove comments so explanatory text is not linted as user-facing copy. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

let failures = 0;
let warnings = 0;

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  const lines = stripComments(readFileSync(file, "utf8")).split("\n");
  lines.forEach((line, i) => {
    for (const { re, why } of BANNED) {
      if (re.test(line)) {
        failures++;
        console.error(`FAIL ${rel}:${i + 1}  ${why}\n     ${line.trim()}`);
      }
    }
    if (WARN.test(line)) {
      warnings++;
      console.warn(`warn ${rel}:${i + 1}  review wording\n     ${line.trim()}`);
    }
  });
}

const lockFile = readFileSync(join(SRC, "lib/content/copy-lock.ts"), "utf8");
for (const s of LOCKED) {
  if (!lockFile.includes(s)) {
    failures++;
    console.error(`FAIL locked string missing or changed in src/lib/content/copy-lock.ts:\n     ${s}`);
  }
}

console.log(`\ncopy lint: ${failures} failure(s), ${warnings} warning(s) to review by hand`);
process.exit(failures ? 1 : 0);
