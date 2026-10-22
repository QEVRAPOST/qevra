import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { startBlocker, SwarmLaunch } from "@/components/dashboard/SwarmLaunch";
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

test("research capabilities report billing separately and name the exact launch blockers", () => {
  const base = {
    provider: "not_configured" as const,
    providerName: "Awaiting authorization",
    authentication: "available" as const,
    billing: "not_configured" as const,
    persistence: "unavailable" as const,
    worker: "unavailable" as const,
    deterministicExperiments: "not_configured" as const,
    sourceCount: 3,
    unavailableReason: "ai_billing_not_approved",
  };
  const blocker = startBlocker(base);

  assert.match(blocker ?? "", /QEVRA_AI_BILLING_APPROVED=true/);
  assert.match(blocker ?? "", /project owner must explicitly authorize/i);
  assert.match(blocker ?? "", /DATABASE_URL/i);
  assert.match(blocker ?? "", /bun run security:worker/);
  assert.match(blocker ?? "", /saved reports remain available/i);

  const launch = renderToStaticMarkup(createElement(SwarmLaunch, {
    live: true,
    topicId: "security-evidence",
    onTopic() {},
    onStart() {},
    canStart: false,
    isCreating: false,
    blocker,
    capabilities: base,
    step: null,
    onIllustrate() {},
    onNext() {},
    onStop() {},
  }));
  assert.match(launch, /AI billing approval/);
  assert.match(launch, /Owner approval required/);
  assert.match(launch, /Create research run/);
  assert.match(launch, /disabled/);
});

test("provider credential blockers identify server configuration without suggesting billing approval", () => {
  const blocker = startBlocker({
    provider: "not_configured",
    providerName: "Credentials missing",
    authentication: "available",
    billing: "available",
    persistence: "available",
    worker: "available",
    deterministicExperiments: "available",
    sourceCount: 3,
    unavailableReason: "model_provider_credentials_missing",
  });

  assert.match(blocker ?? "", /QEVRA_AI_API_KEY/);
  assert.match(blocker ?? "", /QEVRA_AI_MODEL/);
  assert.doesNotMatch(blocker ?? "", /QEVRA_AI_BILLING_APPROVED=true/);
});

test("the public engine label keeps provider and model identity behind technical details", () => {
  const modelId = "openai/gpt-oss-20b";
  const markup = renderToStaticMarkup(createElement(SwarmLaunch, {
    live: true,
    topicId: "security-evidence",
    onTopic() {},
    onStart() {},
    canStart: true,
    isCreating: false,
    blocker: null,
    capabilities: {
      provider: "available",
      providerName: "VEYRA Research Engine",
      providerVendor: "Groq",
      providerModel: modelId,
      authentication: "available",
      billing: "available",
      persistence: "available",
      worker: "available",
      deterministicExperiments: "not_configured",
      sourceCount: 2,
    },
    step: null,
    onIllustrate() {},
    onNext() {},
    onStop() {},
  }));

  assert.match(markup, /<dt>Provider<\/dt><dd>VEYRA Research Engine<\/dd>/);
  assert.match(markup, /<details[^>]*><summary>Technical details<\/summary>/);
  assert.match(markup, /Groq/);
  assert.match(markup, /openai\/gpt-oss-20b/);
  assert.match(markup, /does not claim a proprietary trained model/i);
});
