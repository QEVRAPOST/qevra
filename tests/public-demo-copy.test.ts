import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LandingNav } from "@/components/landing/LandingNav";
import { OverviewView } from "@/components/dashboard/OverviewView";
import { ModelContext } from "@/components/dashboard/AppModelContext";
import { HERO, CURTAIN, HERO_FACTS, HERO_PARTS, HERO_SCENES, STORY_STEPS, SWARM_CAN, STATUS_BAND_INTRO } from "@/lib/content/landing";
import { PILLARS } from "@/lib/content/pillars";
import { COVERAGE_ROWS } from "@/lib/content/status";
import { CORE_SENTENCE, FOOTER_PREVIEW, SWARM_PARAGRAPH_A } from "@/lib/content/copy-lock";
import { buildDemoModel } from "@/lib/demo/model";
import { DEFAULT_NETWORK_ID } from "@/lib/config/networks";
import { createSiteMetadata } from "@/lib/site-metadata";
import type { AppActions } from "@/types";
import { buildReadiness } from "@/lib/app-readiness";

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
    ...Object.values(HERO_PARTS).flatMap((part) => [part.name, part.text, part.type, ...(part.brief ?? [])]),
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
  assert.doesNotMatch(copy, /\bTestnet\b/i, "general landing copy should leave network-specific evidence on the Networks page");
});

test("landing navigation exposes the public contracts registry without making Testnet the product label", () => {
  const markup = renderToStaticMarkup(createElement(LandingNav, { projectName: "VEYRA" }));
  assert.equal((markup.match(/href="\/app\/networks"/g) ?? []).length, 1);
  assert.equal((markup.match(/Contracts/g) ?? []).length, 1);
  const source = readFileSync("src/components/landing/LandingNav.tsx", "utf8");
  assert.match(source, /<span>Contracts<\/span>/);
  assert.doesNotMatch(markup, /Testnet deployments/i);
});

test("the app header has no global network selector and Contracts owns its separate selector", () => {
  const appShell = readFileSync("src/components/dashboard/AppShell.tsx", "utf8");
  const networksView = readFileSync("src/components/dashboard/NetworksView.tsx", "utf8");

  assert.doesNotMatch(appShell, /NetworkSelect/);
  assert.match(networksView, /aria-label="Select public network"/);
  assert.match(networksView, /setPageNetwork\(network\.id\)/);
  assert.doesNotMatch(networksView, /actions\.setNetwork\(network\.id\)/);
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

test("live Overview uses concise product copy while feature pages retain operational disclosures", () => {
  const demo = buildDemoModel({
    stage: 0,
    forced: null,
    reviewed: null,
    amount: "100",
    runsMode: "examples",
    actsMode: "examples",
    network: DEFAULT_NETWORK_ID,
  });
  const model = { ...demo, mode: "live" as const };
  const markup = renderToStaticMarkup(createElement(
    ModelContext.Provider,
    { value: { model, actions: {} as AppActions } },
    createElement(OverviewView),
  ));

  assert.match(markup, /You approve every transaction/);
  const lede = /<p class="pg-lede">([\s\S]*?)<\/p>/.exec(markup)?.[1] ?? "";
  assert.match(lede, /Review source-backed research, inspect public wallet data, and prepare Mainnet swaps for explicit approval\./);
  assert.doesNotMatch(lede, /EVM|chain preflight|PQ smart-account|not audits/i);
  assert.match(markup, /research output, not an audit/i);
  assert.doesNotMatch(markup, /swap execution are unavailable/i);
});

test("Mainnet swap and Status copy agree on quote checks and explicit wallet authorization", () => {
  const modeMenu = readFileSync("src/components/dashboard/ModeMenu.tsx", "utf8");
  const statusView = readFileSync("src/components/dashboard/StatusView.tsx", "utf8");
  const readiness = readFileSync("src/lib/app-readiness.ts", "utf8");

  assert.match(modeMenu, /Mainnet swaps require a live quote and chain checks; wallet approvals are explicit/);
  assert.doesNotMatch(modeMenu, /Swaps are off and nothing is signed/);
  assert.match(statusView, /Mainnet swaps require a valid quote, chain checks, and explicit wallet confirmation/);
  assert.doesNotMatch(statusView, /transaction signing, custody, and swap execution are disabled/);
  assert.match(readiness, /Robinhood Mainnet swaps use an external wallet/);
});

test("demo account and swap states identify QEVRA smart-account use as an illustration", () => {
  const demo = buildDemoModel({
    stage: 1,
    forced: null,
    reviewed: null,
    amount: "100",
    runsMode: "examples",
    actsMode: "examples",
    network: DEFAULT_NETWORK_ID,
  });
  const copy = `${demo.wallet.qevra.hint ?? ""} ${demo.swap.button.cause}`;

  assert.match(copy, /illustrative .*account/i);
  assert.match(copy, /Mainnet swaps use the connected external wallet/i);
  assert.doesNotMatch(copy, /swaps use that account, not your connected wallet/i);
});

test("live swap readiness points to Mainnet route checks and wallet-confirmed preflight", () => {
  const demo = buildDemoModel({
    stage: 0,
    forced: null,
    reviewed: null,
    amount: "100",
    runsMode: "examples",
    actsMode: "examples",
    network: DEFAULT_NETWORK_ID,
  });
  const model = { ...demo, mode: "live" as const };
  const swap = buildReadiness(model).find((row) => row.id === "swap");

  assert.equal(swap?.value, "Route check required");
  assert.match(swap?.detail ?? "", /Robinhood Mainnet.*external wallet/i);
  assert.match(swap?.detail ?? "", /quote.*chain preflight/i);
  assert.match(swap?.detail ?? "", /explicit wallet confirmation/i);
  assert.equal(swap?.linkLabel, "Check Mainnet swap");
});
