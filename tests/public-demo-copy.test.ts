import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LandingNav } from "@/components/landing/LandingNav";
import { HERO, CURTAIN, HERO_FACTS, HERO_SCENES, STORY_STEPS, SWARM_CAN, STATUS_BAND_INTRO } from "@/lib/content/landing";
import { PILLARS } from "@/lib/content/pillars";
import { COVERAGE_ROWS } from "@/lib/content/status";
import { CORE_SENTENCE, FOOTER_PREVIEW, SWARM_PARAGRAPH_A } from "@/lib/content/copy-lock";
import { createSiteMetadata } from "@/lib/site-metadata";

test("landing copy leads with Robinhood Chain and distinguishes configured swaps from future PQ custody", () => {
  assert.deepEqual(HERO_SCENES.map((scene) => scene.tab), ["Account concept", "Intent Lock", "Research + Swarm"]);

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
    ...HERO_FACTS.flatMap((fact) => [fact.lead, fact.body]),
    ...HERO_SCENES.flatMap((scene) => [scene.name, scene.lead, scene.text, scene.label]),
    ...STORY_STEPS.flatMap((step) => [step.title, step.body, step.note ?? "", ...(step.path ?? []).flatMap((item) => [item.lead, item.detail])]),
    ...PILLARS.flatMap((pillar) => [pillar.status.label, pillar.body, ...pillar.capabilities.flatMap((capability) => [capability.label, capability.state]), ...pillar.how]),
    ...COVERAGE_ROWS.flatMap((row) => [row.part, row.statusLabel, row.note]),
  ].join(" ");

  assert.equal(HERO.eyebrow, "POST-QUANTUM DEFI · ROBINHOOD CHAIN");
  assert.equal(HERO.headline, "The Next Era of DeFi.");
  assert.match(HERO.lede, /Built for Robinhood Chain/i);
  assert.match(copy, /wallet reads|public wallet/i);
  assert.match(copy, /smart.account custody.*unavailable|unavailable.*smart.account custody/i);
  assert.match(copy, /0x.*(?:quote|route)|(?:quote|route).*0x/i);
  assert.match(copy, /configuration.dependent|when configured|configuration is required/i);
  assert.match(copy, /explicit wallet approval|approve.*in your wallet/i);
  assert.match(copy, /on.chain.*(?:unavailable|not enforced)|(?:unavailable|not enforced).*on.chain/i);
  assert.match(copy, /three.stage research.*demonstrated|research.*demonstrated/i);
  assert.match(copy, /research.*not an audit|reports are not audits/i);
  assert.doesNotMatch(copy, /swap execution (?:is |remains )?unavailable|no live quote, supported route or swap execution is available|no router is set, so no quote is shown/i);
  assert.doesNotMatch(copy, /wallet and swap are not live yet/i);
  assert.doesNotMatch(copy, /No run has been done|No successful run yet/i);
  assert.doesNotMatch(copy, /Nothing on this page is implemented|sandboxed tests|propose a fix as a patch/i);
});

test("landing navigation exposes public Testnet deployment evidence without a wallet", () => {
  const markup = renderToStaticMarkup(createElement(LandingNav, { projectName: "VEYRA" }));
  assert.match(markup, /href="\/app\/networks"[^>]*>Testnet deployments<\/a>/);
});

test("social metadata describes configured Mainnet swaps and experimental custody accurately", () => {
  const metadata = createSiteMetadata("VEYRA");
  const description = String(metadata.description);
  assert.match(description, /wallet reads/i);
  assert.match(description, /research/i);
  assert.match(description, /Mainnet.*swap/i);
  assert.match(description, /configuration.dependent|service.dependent|when configured/i);
  assert.match(description, /custody.*(?:under evaluation|unavailable|security review)/i);
  assert.doesNotMatch(description, /swap execution.*unavailable/i);
  assert.doesNotMatch(description, /design preview/i);
});
