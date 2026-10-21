import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDeploymentArgs, simulateDeployment } from "../scripts/deploy-simulate";

const jsonRpc = (id: number, result: string) => Response.json({ jsonrpc: "2.0", id, result });

test("prints a read-only Testnet preflight using the configured chain and RPC", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const result = await simulateDeployment("testnet", {
    projectName: "VEYRA",
    color: false,
    fetchImpl: async (url, init) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string };
      calls.push({ url: String(url), method: request.method });
      return request.method === "eth_chainId" ? jsonRpc(request.id, "0xb626") : jsonRpc(request.id, "0x2a");
    },
  });

  assert.equal(result.exitCode, 0);
  assert.doesNotMatch(result.output, /Y E V R A|YEVRA/);
  assert.ok(result.output.split("\n").some((line) => line.includes("#   # ##### #   # ####   ###")));
  assert.match(result.output, /READ-ONLY NETWORK AND DEPLOYMENT STATUS/);
  assert.match(result.output, /ROBINHOOD TESTNET/);
  assert.match(result.output, /EXPECTED CHAIN ID\s+│\s+46630/);
  assert.match(result.output, /01\s+\/\s+LIVE NETWORK VALIDATION/);
  assert.match(result.output, /RPC CONNECTIVITY\s+│\s+AVAILABLE/);
  assert.match(result.output, /LATEST BLOCK\s+│\s+42/);
  assert.match(result.output, /10-CONTRACT ARCHITECTURE/);
  assert.match(result.output, /VeyraResearchEvidenceAnchor/);
  assert.match(result.output, /0x10A47a16A6A903574Ed4058B67750073cC992632/);
  assert.match(result.output, /0xb512a881c0bfa01d33786a6726c40db9b31f64f2598f02022f10a752e0b2ebae/);
  assert.match(result.output, /02\s+\/\s+ROBINHOOD TESTNET 10-CONTRACT ARCHITECTURE REGISTRY/);
  assert.match(result.output, /06\s+\/\s+THREE CORE PRODUCT PILLARS/);
  assert.match(result.output, /HISTORICAL THREE-AGENT REPORT\s+│\s+COMPLETED/i);
  assert.match(result.output, /NEW RESEARCH RUNS\s+│\s+READINESS CHECK REQUIRED/i);
  assert.match(result.output, /07\s+\/\s+FINAL READINESS SUMMARY/);
  assert.match(result.output, /ML-DSA security remains NO-GO/i);
  assert.match(result.output, /BROADCAST\s+│\s+DISABLED/);
  assert.match(result.output, /NO PRIVATE KEY LOADED · NO SIGNATURE REQUESTED · NO TRANSACTION BROADCAST/);
  assert.deepEqual(calls, [
    { url: "https://rpc.testnet.chain.robinhood.com", method: "eth_chainId" },
    { url: "https://rpc.testnet.chain.robinhood.com", method: "eth_blockNumber" },
    { url: "https://rpc.testnet.chain.robinhood.com", method: "eth_getTransactionReceipt" },
  ]);
  assert.doesNotMatch(result.output, /awaits explicit owner authorization|awaiting authorization/i);
  assert.doesNotMatch(result.output, /gas estimate/i);
});

test("simulates Mainnet with the configured chain and RPC", async () => {
  const result = await simulateDeployment("mainnet", {
    projectName: "VEYRA",
    color: false,
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string };
      return jsonRpc(request.id, request.method === "eth_chainId" ? "0x1237" : "0x2a");
    },
  });
  assert.equal(result.exitCode, 0);
  assert.match(result.output, /ROBINHOOD MAINNET/);
  assert.match(result.output, /EXPECTED CHAIN ID\s+│\s+4663/);
});

test("keeps the simulation blocked and reports 403 and 429 RPC responses without response content", async () => {
  for (const status of [403, 429]) {
    const result = await simulateDeployment("testnet", {
      projectName: "VEYRA",
      color: false,
      fetchImpl: async () => new Response("secret response body must not be printed", { status }),
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.output, /ACCESS FAILURE/);
    assert.match(result.output, new RegExp(`HTTP ${status}`));
    assert.match(result.output, /BROADCAST\s+│\s+DISABLED/);
    assert.doesNotMatch(result.output, /secret response body/i);
    assert.match(result.output, /0x10A47a16A6A903574Ed4058B67750073cC992632/);
  }
});

test("reports an actual chain mismatch and does not request a block", async () => {
  let calls = 0;
  const result = await simulateDeployment("mainnet", {
    projectName: "VEYRA",
    color: false,
    fetchImpl: async (_url, init) => {
      calls += 1;
      const request = JSON.parse(String(init?.body)) as { id: number };
      return jsonRpc(request.id, "0x1");
    },
  });
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /OBSERVED CHAIN ID\s+│\s+1/i);
  assert.match(result.output, /EXPECTED CHAIN ID\s+│\s+4663/i);
  assert.equal(calls, 1);
});

test("reports a sanitized timeout and never prints environment secrets", async () => {
  const original = process.env.DEPLOY_PRIVATE_KEY;
  process.env.DEPLOY_PRIVATE_KEY = "do-not-print-this-secret";
  try {
    const result = await simulateDeployment("testnet", {
      projectName: "VEYRA",
      color: false,
      fetchImpl: async () => { throw Object.assign(new Error("secret socket detail"), { name: "TimeoutError" }); },
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.output, /rpc_timeout/);
    assert.match(result.output, /BROADCAST\s+│\s+DISABLED/);
    assert.doesNotMatch(result.output, /do-not-print-this-secret|secret socket detail/);
  } finally {
    if (original === undefined) delete process.env.DEPLOY_PRIVATE_KEY;
    else process.env.DEPLOY_PRIVATE_KEY = original;
  }
});

test("deploy:show flags are mutually exclusive and the legacy network syntax stays supported", () => {
  assert.deepEqual(parseDeploymentArgs(["--testnet"]), { networkId: "testnet", mode: "show" });
  assert.deepEqual(parseDeploymentArgs(["--mainnet"]), { networkId: "mainnet", mode: "show" });
  assert.deepEqual(parseDeploymentArgs(["--network", "testnet"]), { networkId: "testnet", mode: "simulate" });
  assert.deepEqual(parseDeploymentArgs(["--network", "mainnet"]), { networkId: "mainnet", mode: "simulate" });
  assert.throws(() => parseDeploymentArgs(["--testnet", "--mainnet"]), /mutually exclusive/i);
  assert.throws(() => parseDeploymentArgs(["--staging"]), /unknown option/i);
  assert.throws(() => parseDeploymentArgs(["--network", "staging"]), /network must be testnet or mainnet/i);
  assert.throws(() => parseDeploymentArgs([]), /Usage:[\s\S]*deploy:show[\s\S]*deploy:simulate/);
});

test("showcase respects narrow terminal widths and plain output has no ANSI escapes", async () => {
  const result = await simulateDeployment("testnet", {
    projectName: "VEYRA",
    color: false,
    columns: 44,
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string };
      return jsonRpc(request.id, request.method === "eth_chainId" ? "0xb626" : "0x2a");
    },
  });
  assert.doesNotMatch(result.output, /\u001b\[/);
  assert.ok(result.output.split("\n").every((line) => line.length <= 44), "each line should fit the selected terminal width");
});

test("renders each architecture slot separately from the Testnet and Mainnet Evidence Anchor records", async () => {
  const result = await simulateDeployment("testnet", {
    color: false,
    columns: 100,
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string };
      return jsonRpc(request.id, request.method === "eth_chainId" ? "0xb626" : "0x2a");
    },
  });
  const names = [
    "VeyraKeyRegistrationValidator",
    "VeyraKeyRegistry",
    "VeyraRecoveryPolicy",
    "VeyraAccount",
    "VeyraAccountFactory",
    "VeyraTokenPolicyRegistry",
    "VeyraRouterRegistry",
    "VeyraSwapIntentGuard",
    "VeyraSwapExecutor",
    "VeyraResearchAttestationRegistry",
  ];

  assert.match(result.output, /TESTNET 10-CONTRACT ARCHITECTURE REGISTRY/);
  assert.match(result.output, /MAINNET 10-CONTRACT ARCHITECTURE REGISTRY/);
  for (const name of names) assert.ok(result.output.includes(name), `${name} should be shown`);
  assert.match(result.output, /STANDALONE TESTNET EVIDENCE ANCHOR/);
  assert.match(result.output, /STANDALONE MAINNET EVIDENCE ANCHOR/);
  assert.match(result.output, /NOT DEPLOYED/);
  assert.match(result.output, /This is a read-only status display; no transaction is simulated\./i);
  assert.doesNotMatch(result.output, /awaits explicit owner authorization|awaiting authorization/i);
});

test("emits real validation steps in a fixed order without delays", async () => {
  const events: Array<{ label: string; state: string }> = [];
  const run = simulateDeployment as unknown as (
    network: "testnet",
    options: Record<string, unknown>,
  ) => Promise<{ exitCode: number; output: string }>;
  const result = await run("testnet", {
    color: false,
    fetchImpl: async (_url: unknown, init: { body?: unknown }) => {
      const request = JSON.parse(String(init.body)) as { id: number; method: string };
      return jsonRpc(request.id, request.method === "eth_chainId" ? "0xb626" : "0x2a");
    },
    onProgress: (event: { label: string; state: string }) => events.push(event),
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(events.filter((event) => event.state === "complete").map((event) => event.label), [
    "Robinhood RPC chain ID",
    "Latest block",
    "Inspect Testnet and Mainnet registries",
    "Verify Testnet Evidence Anchor",
  ]);
});

test("animates only interactive terminals that allow color and cursor updates", async () => {
  const terminalApi = await import("../scripts/deploy-simulate");
  const api = terminalApi as unknown as {
    shouldAnimateTerminal?: (isTTY: boolean, env: Record<string, string | undefined>) => boolean;
  };

  assert.equal(typeof api.shouldAnimateTerminal, "function");
  assert.equal(api.shouldAnimateTerminal!(false, { TERM: "xterm" }), false);
  assert.equal(api.shouldAnimateTerminal!(true, { TERM: "dumb" }), false);
  assert.equal(api.shouldAnimateTerminal!(true, { TERM: "xterm", NO_COLOR: "1" }), false);
  assert.equal(api.shouldAnimateTerminal!(true, { TERM: "xterm" }), true);
});

test("uses VEYRA rather than a stale project name when branding falls back", async () => {
  const result = await simulateDeployment("testnet", {
    projectName: "",
    color: false,
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string };
      return jsonRpc(request.id, request.method === "eth_chainId" ? "0xb626" : "0x2a");
    },
  });
  assert.match(result.output, /VEYRA \/ ROBINHOOD NETWORK READINESS/);
  assert.doesNotMatch(result.output, /YEVRA|Y E V R A/);
});

test("reads the terminal wordmark from NEXT_PUBLIC_PROJECT_NAME", async () => {
  const previous = process.env.NEXT_PUBLIC_PROJECT_NAME;
  process.env.NEXT_PUBLIC_PROJECT_NAME = "VEYRA";
  try {
    const result = await simulateDeployment("testnet", {
      color: false,
      fetchImpl: async (_url, init) => {
        const request = JSON.parse(String(init?.body)) as { id: number; method: string };
        return jsonRpc(request.id, request.method === "eth_chainId" ? "0xb626" : "0x2a");
      },
    });
    assert.match(result.output, /VEYRA \/ ROBINHOOD NETWORK READINESS/);
    assert.doesNotMatch(result.output, /YEVRA|Y E V R A/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_PROJECT_NAME;
    else process.env.NEXT_PUBLIC_PROJECT_NAME = previous;
  }
});
