import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SwarmLaunch } from "@/components/dashboard/SwarmLaunch";
import { shouldLoadResearchCapabilities } from "@/features/dashboard/live-ui-state";

test("wallet and operator research sessions can load authenticated capabilities", () => {
  assert.equal(shouldLoadResearchCapabilities("authenticated", "wallet"), true);
  assert.equal(shouldLoadResearchCapabilities("authenticated", "operator"), true);
});

test("capabilities remain protected while access is signed out or still checking", () => {
  assert.equal(shouldLoadResearchCapabilities("unauthenticated", "wallet"), false);
  assert.equal(shouldLoadResearchCapabilities("checking", undefined), false);
  assert.equal(shouldLoadResearchCapabilities("not_configured", "operator"), false);
});

test("capability request failures are visible and keep live run creation disabled", () => {
  const markup = renderToStaticMarkup(createElement(SwarmLaunch, {
    live: true,
    topicId: "security-evidence",
    onTopic() {},
    onStart() {},
    canStart: false,
    isCreating: false,
    blocker: "The capabilities endpoint is temporarily unavailable.",
    capabilityMessage: "The capabilities endpoint is temporarily unavailable.",
    step: null,
    onIllustrate() {},
    onNext() {},
    onStop() {},
  }));
  assert.match(markup, /Could not be checked/);
  assert.match(markup, /The capabilities endpoint is temporarily unavailable/);
  assert.match(markup, /disabled/);
});
