import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SocialXLink } from "@/components/ui/SocialXLink";
import { TokenAddressControl } from "@/components/landing/TokenAddressControl";
import { parseVeyraTokenConfig } from "@/lib/config/veyra-token";

test("official VEYRA X shortcut is accessible and opens safely", () => {
  const markup = renderToStaticMarkup(createElement(SocialXLink));
  assert.match(markup, /href="https:\/\/x\.com\/veyraappp"/);
  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noopener noreferrer"/);
  assert.match(markup, /aria-label="Follow VEYRA on X"/);
  assert.match(markup, /title="Follow VEYRA on X"/);
  assert.match(markup, /<svg[^>]*aria-hidden="true"/);
});

test("X shortcut is mounted in landing desktop and mobile navigation and the app header", () => {
  const landing = readFileSync("src/components/landing/LandingNav.tsx", "utf8");
  const app = readFileSync("src/components/dashboard/AppShell.tsx", "utf8");
  assert.match(landing, /<SocialXLink\b/);
  const mobileMenu = landing.slice(landing.indexOf('<div className="lmenu-cta"'));
  assert.match(mobileMenu, /<SocialXLink\b/);
  assert.match(app, /<SocialXLink\b/);
});

test("VEYRA token address configuration is hidden unless valid for a supported Robinhood chain", () => {
  const address = "0x1111111111111111111111111111111111111111";
  assert.equal(parseVeyraTokenConfig(undefined, undefined), null);
  assert.equal(parseVeyraTokenConfig("", "4663"), null);
  assert.equal(parseVeyraTokenConfig("0x1234", "4663"), null);
  assert.equal(parseVeyraTokenConfig("0x0000000000000000000000000000000000000000", "4663"), null);
  assert.equal(parseVeyraTokenConfig(address, "1"), null);
  assert.equal(parseVeyraTokenConfig(address, "46630")?.network.id, "testnet");
  assert.equal(parseVeyraTokenConfig(address, "4663")?.network.id, "mainnet");
});

test("landing token address control stays absent without official address and network configuration", () => {
  const previousAddress = process.env.NEXT_PUBLIC_VEYRA_TOKEN_CA;
  const previousChainId = process.env.NEXT_PUBLIC_VEYRA_TOKEN_CHAIN_ID;
  delete process.env.NEXT_PUBLIC_VEYRA_TOKEN_CA;
  delete process.env.NEXT_PUBLIC_VEYRA_TOKEN_CHAIN_ID;
  try {
    assert.equal(renderToStaticMarkup(createElement(TokenAddressControl)), "");
  } finally {
    if (previousAddress === undefined) delete process.env.NEXT_PUBLIC_VEYRA_TOKEN_CA;
    else process.env.NEXT_PUBLIC_VEYRA_TOKEN_CA = previousAddress;
    if (previousChainId === undefined) delete process.env.NEXT_PUBLIC_VEYRA_TOKEN_CHAIN_ID;
    else process.env.NEXT_PUBLIC_VEYRA_TOKEN_CHAIN_ID = previousChainId;
  }
});

test("configured hero token address does not append a network label", () => {
  const previousAddress = process.env.NEXT_PUBLIC_VEYRA_TOKEN_CA;
  const previousChainId = process.env.NEXT_PUBLIC_VEYRA_TOKEN_CHAIN_ID;
  process.env.NEXT_PUBLIC_VEYRA_TOKEN_CA = "0x1111111111111111111111111111111111111111";
  process.env.NEXT_PUBLIC_VEYRA_TOKEN_CHAIN_ID = "4663";
  try {
    const markup = renderToStaticMarkup(createElement(TokenAddressControl));
    assert.match(markup, /VEYRA token address/);
    assert.doesNotMatch(markup, /Robinhood Mainnet|Robinhood Testnet/);
  } finally {
    if (previousAddress === undefined) delete process.env.NEXT_PUBLIC_VEYRA_TOKEN_CA;
    else process.env.NEXT_PUBLIC_VEYRA_TOKEN_CA = previousAddress;
    if (previousChainId === undefined) delete process.env.NEXT_PUBLIC_VEYRA_TOKEN_CHAIN_ID;
    else process.env.NEXT_PUBLIC_VEYRA_TOKEN_CHAIN_ID = previousChainId;
  }
});
