import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LandingNav } from "@/components/landing/LandingNav";
import { HERO, CURTAIN, STORY_STEPS, SWARM_CAN, STATUS_BAND_INTRO } from "@/lib/content/landing";
import { PILLARS } from "@/lib/content/pillars";
import { COVERAGE_ROWS } from "@/lib/content/status";
import { CORE_SENTENCE, FOOTER_PREVIEW, SWARM_PARAGRAPH_A } from "@/lib/content/copy-lock";
import { createSiteMetadata } from "@/lib/site-metadata";

test("landing claims describe the read-only wallet, unavailable custody/swaps, and demonstrated research accurately", () => {
  const copy = [
    HERO.eyebrow,
    HERO.headline,
    HERO.lede,
    HERO.note,
    CURTAIN.kicker,
    CURTAIN.title,
    CURTAIN.body,
    STATUS_BAND_INTRO,
    CORE_SENTENCE,
    SWARM_PARAGRAPH_A,
    FOOTER_PREVIEW,
    ...SWARM_CAN,
    ...STORY_STEPS.flatMap((step) => [step.title, step.body, step.note ?? "", ...(step.path ?? []).flatMap((item) => [item.lead, item.detail])]),
    ...PILLARS.flatMap((pillar) => [pillar.status.label, pillar.body, ...pillar.capabilities.flatMap((capability) => [capability.label, capability.state]), ...pillar.how]),
    ...COVERAGE_ROWS.flatMap((row) => [row.part, row.statusLabel, row.note]),
  ].join(" ");

  assert.match(copy, /read-only wallet/i);
  assert.match(copy, /no .*smart.account custody|custody .*unavailable/i);
  assert.match(copy, /swap execution.*unavailable|execution unavailable/i);
  assert.match(copy, /three.stage research.*demonstrated|research.*demonstrated/i);
  assert.doesNotMatch(copy, /wallet and swap are not live yet/i);
  assert.doesNotMatch(copy, /No run has been done|No successful run yet/i);
  assert.doesNotMatch(copy, /Nothing on this page is implemented|sandboxed tests|propose a fix as a patch/i);
});

test("landing navigation exposes public Testnet deployment evidence without a wallet", () => {
  const markup = renderToStaticMarkup(createElement(LandingNav, { projectName: "VEYRA" }));
  assert.match(markup, /href="\/app\/networks"[^>]*>Testnet deployments<\/a>/);
});

test("social metadata describes current wallet and research capabilities without calling the site a preview", () => {
  const metadata = createSiteMetadata("VEYRA");
  const description = String(metadata.description);
  assert.match(description, /read.only wallet/i);
  assert.match(description, /research/i);
  assert.match(description, /swap execution are unavailable/i);
  assert.doesNotMatch(description, /design preview/i);
});
