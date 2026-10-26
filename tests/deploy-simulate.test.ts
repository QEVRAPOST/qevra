import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDeploymentArgs, simulateDeployment } from "../scripts/deploy-simulate";
import mainnetManifest from "../contracts/deployments/robinhood-mainnet.json";
import testnetManifest from "../contracts/deployments/robinhood-testnet.json";
import {
  ROBINHOOD_MAINNET_TOKENS,
  ZEROX_ALLOWANCE_HOLDER,
  ZEROX_SETTLER_REGISTRY,
} from "../src/lib/config/robinhood-mainnet-contracts";

const jsonRpc = (id: number, result: string) => Response.json({ jsonrpc: "2.0", id, result });

function mainnetInfrastructureFixture(options: { unavailableAddress?: string } = {}) {
  const currentSettler = "0x00000000000000000000000000000000000000a5";
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
    calls.push({ method: request.method, params: request.params });
    if (request.method === "eth_chainId") return jsonRpc(request.id, "0x1237");
    if (request.method === "eth_blockNumber") return jsonRpc(request.id, "0x2a");
    if (request.method === "eth_call") {
      return jsonRpc(request.id, `0x${"0".repeat(24)}${currentSettler.slice(2).toLowerCase()}`);
    }
    if (request.method === "eth_getCode") {
      const [address] = request.params as [string, string];
      if (address.toLowerCase() === options.unavailableAddress?.toLowerCase()) {
        return new Response("rpc observation unavailable", { status: 503 });
      }
      return jsonRpc(request.id, "0x60006000");
    }
    return new Response("unexpected RPC method", { status: 400 });
  };
  return { currentSettler, calls, fetchImpl };
}

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
  assert.match(result.output, /01\s+\/\s+ROBINHOOD TESTNET LIVE NETWORK VALIDATION/);
  assert.match(result.output, /RPC CONNECTIVITY\s+│\s+AVAILABLE/);
  assert.match(result.output, /LATEST BLOCK\s+│\s+42/);
  assert.match(result.output, /FIVE-CONTRACT MVP/);
  assert.match(result.output, /5\/5 MVP contracts deployed/i);
  assert.match(result.output, /FUTURE ARCHITECTURE \/ SECURITY RESEARCH/);
  assert.match(result.output, /VeyraResearchEvidenceAnchor/);
  assert.match(result.output, /0x10A47a16A6A903574Ed4058B67750073cC992632/);
  assert.match(result.output, /0xb512a881c0bfa01d33786a6726c40db9b31f64f2598f02022f10a752e0b2ebae/);
  assert.doesNotMatch(result.output, /ROBINHOOD MAINNET 10-CONTRACT ARCHITECTURE REGISTRY/);
  assert.doesNotMatch(result.output, /STANDALONE MAINNET EVIDENCE ANCHOR/);
  assert.match(result.output, /02\s+\/\s+ROBINHOOD TESTNET FIVE-CONTRACT MVP REGISTRY/);
  assert.match(result.output, /05\s+\/\s+THREE CORE PRODUCT PILLARS/);
  assert.match(result.output, /HISTORICAL THREE-AGENT REPORT\s+│\s+COMPLETED/i);
  assert.match(result.output, /NEW RESEARCH RUNS\s+│\s+READINESS CHECK REQUIRED/i);
  assert.match(result.output, /06\s+\/\s+FINAL READINESS SUMMARY/);
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

test("shows Mainnet deployment readiness through configured chain and RPC reads", async () => {
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
  assert.match(result.output, /ROBINHOOD MAINNET FIVE-CONTRACT MVP REGISTRY/);
  assert.match(result.output, /0\/5 MVP contracts deployed/i);
  assert.doesNotMatch(result.output, /TESTNET/);
  assert.doesNotMatch(result.output, /0x10A47a16A6A903574Ed4058B67750073cC992632/);
});

test("renders Mainnet in the shared terminal shell and shows chain-pinned external infrastructure bytecode", async () => {
  const fixture = mainnetInfrastructureFixture();
  const result = await simulateDeployment("mainnet", {
    projectName: "VEYRA",
    color: false,
    columns: 100,
    fetchImpl: fixture.fetchImpl,
  });
  const flattenedOutput = result.output.replace(/[|│]/g, " ").replace(/\s+/g, " ");

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /VEYRA \/ ROBINHOOD NETWORK READINESS/);
  assert.match(result.output, /EXPECTED CHAIN ID\s+│\s+4663/);
  assert.match(result.output, /ROBINHOOD MAINNET FIVE-CONTRACT MVP REGISTRY/);
  assert.match(result.output, /0\/5 MVP contracts deployed/);
  assert.match(result.output, /EXTERNAL MAINNET INFRASTRUCTURE/);
  assert.match(flattenedOutput, /Mainnet firm quotes require live provider and contract validation/);
  assert.match(flattenedOutput, /this terminal does not request quotes or execute swaps/);
  assert.match(result.output, /0x0000000000001fF3684f28c67538d4D072C22734/);
  assert.match(result.output, /0x00000000000004533Fe15556B1E086BB1A72cEae/);
  assert.match(result.output, /0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73/);
  assert.match(result.output, /0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168/);
  assert.match(result.output, new RegExp(fixture.currentSettler, "i"));
  assert.match(result.output, /BYTECODE STATUS\s+│\s+PRESENT/);
  assert.match(result.output, /FINAL READINESS SUMMARY/);
  assert.match(result.output, /READ-ONLY STATUS DISPLAY; NO TRANSACTION IS SIMULATED/);
  assert.ok(fixture.calls.some(({ method, params }) => method === "eth_getCode"
    && params[1] === "0x2a"), "contract code should be checked at the observed Mainnet block");
  assert.ok(fixture.calls.some(({ method, params }) => method === "eth_call"
    && params[1] === "0x2a"), "the current Settler should be resolved at the observed Mainnet block");
  assert.equal(result.output.includes(ROBINHOOD_MAINNET_TOKENS.ETH.address), false, "native ETH is not a deployed contract");
  assert.ok(result.output.includes(ZEROX_ALLOWANCE_HOLDER));
  assert.ok(result.output.includes(ZEROX_SETTLER_REGISTRY));
  assert.ok(result.output.includes(ROBINHOOD_MAINNET_TOKENS.WETH.address));
  assert.ok(result.output.includes(ROBINHOOD_MAINNET_TOKENS.USDG.address));

  const narrow = await simulateDeployment("mainnet", {
    color: false,
    columns: 44,
    fetchImpl: mainnetInfrastructureFixture().fetchImpl,
  });
  assert.ok(narrow.output.split("\n").every((line) => line.length <= 44), "each Mainnet line should fit the narrow terminal");
});

test("keeps unavailable Mainnet bytecode observations explicitly unavailable", async () => {
  const fixture = mainnetInfrastructureFixture({ unavailableAddress: ROBINHOOD_MAINNET_TOKENS.WETH.address });
  const result = await simulateDeployment("mainnet", {
    color: false,
    fetchImpl: fixture.fetchImpl,
  });

  assert.equal(result.exitCode, 0, "an external infrastructure code read does not invalidate the network preflight");
  assert.match(result.output, /EXTERNAL MAINNET INFRASTRUCTURE/);
  assert.match(result.output, /WETH[\s\S]*?BYTECODE STATUS\s+│\s+UNAVAILABLE/);
  assert.doesNotMatch(result.output, /WETH[\s\S]*?BYTECODE STATUS\s+│\s+PASSED/);
});

test("keeps deployment disabled and reports 403 and 429 RPC responses without response content", async () => {
  for (const status of [403, 429]) {
    const result = await simulateDeployment("testnet", {
      projectName: "VEYRA",
      color: false,
      fetchImpl: async () => new Response("secret response body must not be printed", { status }),
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.output, /RPC UNAVAILABLE/);
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
  assert.deepEqual(parseDeploymentArgs(["--testnet"]), { networkId: "testnet", mode: "show", fast: false, speed: 1, json: false });
  assert.deepEqual(parseDeploymentArgs(["--mainnet"]), { networkId: "mainnet", mode: "show", fast: false, speed: 1, json: false });
  assert.deepEqual(parseDeploymentArgs(["--network", "testnet"]), { networkId: "testnet", mode: "simulate", fast: false, speed: 1, json: false });
  assert.deepEqual(parseDeploymentArgs(["--network", "mainnet"]), { networkId: "mainnet", mode: "simulate", fast: false, speed: 1, json: false });
  assert.deepEqual(parseDeploymentArgs(["--network", "all"]), { networkId: "all", mode: "simulate", fast: false, speed: 1, json: false });
  assert.throws(() => parseDeploymentArgs(["--testnet", "--mainnet"]), /mutually exclusive/i);
  assert.throws(() => parseDeploymentArgs(["--staging"]), /unknown option/i);
  assert.throws(() => parseDeploymentArgs(["--network", "staging"]), /network must be testnet, mainnet, or all/i);
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

test("renders the five-contract MVP and future slots separately from its Evidence Anchor", async () => {
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

  assert.match(result.output, /TESTNET FIVE-CONTRACT MVP REGISTRY/);
  assert.match(result.output, /FUTURE ARCHITECTURE \/ SECURITY RESEARCH/);
  assert.doesNotMatch(result.output, /MAINNET/);
  for (const name of names) assert.ok(result.output.includes(name), `${name} should be shown`);
  assert.match(result.output, /STANDALONE TESTNET EVIDENCE ANCHOR/);
  assert.match(result.output, /NOT DEPLOYED/);
  assert.match(result.output, /This is a read-only status display; no transaction is simulated\./i);
  assert.doesNotMatch(result.output, /awaits explicit owner authorization|awaiting authorization/i);
});

test("renders both registries only for explicit all-network selection", async () => {
  const calls: string[] = [];
  const result = await simulateDeployment("all", {
    color: false,
    fetchImpl: async (url, init) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string };
      calls.push(`${String(url)}:${request.method}`);
      const chainId = String(url).includes("testnet") ? "0xb626" : "0x1237";
      return jsonRpc(request.id, request.method === "eth_chainId" ? chainId : "0x2a");
    },
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /ROBINHOOD TESTNET FIVE-CONTRACT MVP REGISTRY/);
  assert.match(result.output, /ROBINHOOD MAINNET FIVE-CONTRACT MVP REGISTRY/);
  assert.match(result.output, /EXPECTED CHAIN ID\s+│\s+46630/);
  assert.match(result.output, /EXPECTED CHAIN ID\s+│\s+4663/);
  assert.ok(calls.some((call) => call.startsWith("https://rpc.testnet.chain.robinhood.com:")));
  assert.ok(calls.some((call) => call.startsWith("https://rpc.mainnet.chain.robinhood.com:")));
});

test("renders validated Testnet deployments dynamically and keeps Mainnet empty", async () => {
  const testnetDeployments = testnetManifest.contracts.filter((contract) => contract.deploymentStatus === "verified");
  const mainnetManifestContracts = mainnetManifest.contracts as Array<{ deploymentStatus?: string }>;
  const mainnetDeployments = mainnetManifestContracts.filter((contract) => contract.deploymentStatus === "verified");
  const testnetDeploymentCount = testnetDeployments.length;
  const mainnetDeploymentCount = mainnetDeployments.length;
  const slotTen = testnetDeployments.find((contract) => contract.architectureSlot === 10);
  assert.equal(testnetDeploymentCount, 5, "the current Testnet manifest has five verified architecture deployments");
  assert.equal(mainnetDeploymentCount, 0, "the current Mainnet manifest remains empty");
  assert.equal(slotTen?.address, "0x61c3DC95B31977e6F3a3373eC5BAb52477E96Ba2");

  const result = await simulateDeployment("all", {
    color: true,
    colorDepth: "16",
    columns: 120,
    deploymentManifests: {
      testnet: structuredClone(testnetManifest),
      mainnet: structuredClone(mainnetManifest),
    },
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string };
      const chainId = String(_url).includes("testnet") ? "0xb626" : "0x1237";
      return jsonRpc(request.id, request.method === "eth_chainId" ? chainId : "0x2a");
    },
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.output, new RegExp(`${testnetDeploymentCount}/5 MVP contracts deployed`));
  assert.match(result.output, new RegExp(`${mainnetDeploymentCount}/5 MVP contracts deployed`));
  assert.match(result.output, /DEPLOYED · INACTIVE/);
  assert.match(result.output, /\u001b\[32mDEPLOYMENT STATUS[^\u001b]+DEPLOYED · INACTIVE/);
  assert.match(result.output, /MANIFEST EVIDENCE\s+│\s+VERIFIED/);
  assert.match(result.output, /SECURITY READINESS\s+│\s+SECURITY NO-GO/);
  assert.match(result.output, /\u001b\[31mSECURITY READINESS[^\u001b]+SECURITY NO-GO/);
  for (const contract of testnetDeployments) {
    assert.ok(result.output.includes(contract.solidityName), `${contract.solidityName} should be listed`);
    assert.ok(result.output.includes(contract.address), `${contract.address} should come from the supplied manifest`);
  }
  assert.match(result.output, /STANDALONE TESTNET EVIDENCE ANCHOR/);
  assert.match(result.output, /STANDALONE MAINNET EVIDENCE ANCHOR/);
});

test("reports only slots 6-10 as the MVP and labels slots 1-5 as future research", async () => {
  const result = await simulateDeployment("all", {
    color: false,
    deploymentManifests: {
      testnet: structuredClone(testnetManifest),
      mainnet: structuredClone(mainnetManifest),
    },
    fetchImpl: async (url, init) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string };
      const chainId = String(url).includes("testnet") ? "0xb626" : "0x1237";
      return jsonRpc(request.id, request.method === "eth_chainId" ? chainId : "0x2a");
    },
  });

  assert.match(result.output, /5\/5 MVP contracts deployed/);
  assert.match(result.output, /0\/5 MVP contracts deployed/);
  const testnetFutureStart = result.output.indexOf("FUTURE ARCHITECTURE / SECURITY RESEARCH");
  const testnetAnchorStart = result.output.indexOf("STANDALONE TESTNET EVIDENCE ANCHOR");
  assert.ok(testnetFutureStart >= 0 && testnetAnchorStart > testnetFutureStart);
  const futureSection = result.output.slice(testnetFutureStart, testnetAnchorStart);
  for (const name of [
    "VeyraKeyRegistrationValidator",
    "VeyraKeyRegistry",
    "VeyraRecoveryPolicy",
    "VeyraAccount",
    "VeyraAccountFactory",
  ]) {
    assert.ok(futureSection.includes(name), `${name} should remain in the future research section`);
  }
  assert.match(futureSection, /NOT DEPLOYED/);
  assert.match(result.output, /STANDALONE TESTNET EVIDENCE ANCHOR/);
  assert.match(result.output, /SOURCE VERIFICATION\s+│\s+NOT VERIFIED/i);
  assert.match(result.output, /SECURITY READINESS\s+│\s+SECURITY NO-GO/);
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
    "Robinhood Testnet RPC chain ID",
    "Robinhood Testnet latest block",
    "Verify VeyraResearchEvidenceAnchor on Testnet",
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

test("supports --fast, a bounded animation speed multiplier, and structured JSON output", () => {
  assert.deepEqual(parseDeploymentArgs(["--network", "testnet", "--fast"]), {
    networkId: "testnet", mode: "simulate", fast: true, speed: 1, json: false,
  });
  assert.deepEqual(parseDeploymentArgs(["--network", "mainnet", "--speed", "1.5", "--json"]), {
    networkId: "mainnet", mode: "simulate", fast: false, speed: 1.5, json: true,
  });
  assert.deepEqual(parseDeploymentArgs(["--testnet", "--speed", "4"]), {
    networkId: "testnet", mode: "show", fast: false, speed: 4, json: false,
  });
  assert.throws(() => parseDeploymentArgs(["--network", "testnet", "--speed", "0"]), /speed must be between/i);
  assert.throws(() => parseDeploymentArgs(["--network", "testnet", "--speed", "fast"]), /speed must be a number/i);
});

test("disables terminal animation for tests, structured output, and fast mode", async () => {
  const terminalApiModule = await import("../scripts/deploy-simulate");
  const api = terminalApiModule as unknown as {
    shouldAnimateTerminal?: (isTTY: boolean, env: Record<string, string | undefined>, structuredOutput?: boolean, fast?: boolean) => boolean;
  };
  assert.equal(api.shouldAnimateTerminal!(true, { TERM: "xterm", NODE_ENV: "test" }), false);
  assert.equal(api.shouldAnimateTerminal!(true, { TERM: "xterm", NODE_TEST_CONTEXT: "child-v8" }), false);
  assert.equal(api.shouldAnimateTerminal!(true, { TERM: "xterm" }, true), false);
  assert.equal(api.shouldAnimateTerminal!(true, { TERM: "xterm" }, false, true), false);
  assert.equal(api.shouldAnimateTerminal!(false, { TERM: "xterm" }), false);
  assert.equal(api.shouldAnimateTerminal!(true, { TERM: "xterm" }), true);
});

test("reveals the wordmark, network, contract rows, addresses, and summary in order", async () => {
  const terminalApiModule = await import("../scripts/deploy-simulate");
  const api = terminalApiModule as unknown as {
    revealTerminalOutput?: (value: string, options: {
      speed?: number;
      write?: (value: string) => void;
      wait?: (milliseconds: number) => Promise<void>;
    }) => Promise<void>;
  };
  assert.equal(typeof api.revealTerminalOutput, "function");

  const writes: string[] = [];
  const delays: number[] = [];
  await api.revealTerminalOutput!(
    "  #   # ##### #   #\n01 / LIVE NETWORK VALIDATION\nSLOT 01 · VeyraKeyRegistry · DEPLOYED\nADDRESS │ from verified manifest\n07 / FINAL READINESS SUMMARY\n",
    { speed: 2, write: (value) => writes.push(value), wait: async (milliseconds) => { delays.push(milliseconds); } },
  );

  assert.deepEqual(writes, [
    "  #   # ##### #   #\n",
    "01 / LIVE NETWORK VALIDATION\n",
    "SLOT 01 · VeyraKeyRegistry · DEPLOYED\n",
    "ADDRESS │ from verified manifest\n",
    "07 / FINAL READINESS SUMMARY\n",
  ]);
  assert.equal(delays.length, writes.length);
  assert.ok(delays.every((milliseconds) => milliseconds > 0 && milliseconds < 100));

  const normalSpeedDelays: number[] = [];
  await api.revealTerminalOutput!("VEYRA\n01 / LIVE NETWORK VALIDATION\nSLOT 01 · VeyraKeyRegistry\n", {
    speed: 1,
    write() {},
    wait: async (milliseconds) => { normalSpeedDelays.push(milliseconds); },
  });
  const doubleSpeedDelays: number[] = [];
  await api.revealTerminalOutput!("VEYRA\n01 / LIVE NETWORK VALIDATION\nSLOT 01 · VeyraKeyRegistry\n", {
    speed: 2,
    write() {},
    wait: async (milliseconds) => { doubleSpeedDelays.push(milliseconds); },
  });
  assert.deepEqual(doubleSpeedDelays, normalSpeedDelays.map((milliseconds) => Math.max(4, Math.round(milliseconds / 2))));
});

test("uses explicit deployment, readiness, and RPC-unavailable labels", async () => {
  const result = await simulateDeployment("testnet", {
    color: false,
    fetchImpl: async () => new Response("unavailable", { status: 503 }),
  });
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /RPC UNAVAILABLE/);
  assert.match(result.output, /NOT DEPLOYED/);
  assert.match(result.output, /SECURITY READINESS\s+│\s+PENDING REVIEW/);
  assert.match(result.output, /SECURITY READINESS\s+│\s+SECURITY NO-GO/);
  assert.match(result.output, /DEPLOYED · MANIFEST VERIFIED/);
});

test("reports deployment and security readiness separately with distinct blocker states", async () => {
  const result = await simulateDeployment("testnet", {
    color: false,
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string };
      return jsonRpc(request.id, request.method === "eth_chainId" ? "0xb626" : "0x2a");
    },
  });

  assert.match(result.output, /SLOT 01 · VeyraKeyRegistrationValidator/);
  assert.match(result.output, /DEPLOYMENT STATUS\s+│\s+NOT DEPLOYED/);
  assert.match(result.output, /SECURITY READINESS\s+│\s+PENDING REVIEW/);
  assert.match(result.output, /SECURITY READINESS\s+│\s+SECURITY NO-GO/);
});

test("uses green for verified deployment, amber for pending state, and red only for security NO-GO", async () => {
  const result = await simulateDeployment("testnet", {
    color: true,
    colorDepth: "16",
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string };
      return jsonRpc(request.id, request.method === "eth_chainId" ? "0xb626" : "0x2a");
    },
  });

  assert.match(result.output, /\u001b\[32mDEPLOYMENT STATUS[^\u001b]+DEPLOYED · MANIFEST VERIFIED/);
  assert.match(result.output, /\u001b\[33mDEPLOYMENT STATUS[^\u001b]+NOT DEPLOYED/);
  assert.match(result.output, /\u001b\[33mSECURITY READINESS[^\u001b]+PENDING REVIEW/);
  assert.match(result.output, /\u001b\[31mSECURITY READINESS[^\u001b]+SECURITY NO-GO/);
});

test("renders newly validated manifest addresses dynamically and hides unverified candidates", async () => {
  const verifiedAddress = "0x000000000000000000000000000000000000cafe";
  const unverifiedAddress = "0x000000000000000000000000000000000000babe";
  const manifest = {
    ...testnetManifest,
    contracts: [
      {
        solidityName: "VeyraTokenPolicyRegistry",
        purpose: "Validated test fixture.",
        networkId: "testnet",
        chainId: 46_630,
        observedChainId: 46_630,
        address: verifiedAddress,
        deploymentStatus: "verified",
        deployerAddress: "0x0000000000000000000000000000000000000001",
        transactionHash: `0x${"a".repeat(64)}`,
        receiptStatus: "success",
        blockNumber: "12345",
        runtimeBytecodeHash: `0x${"b".repeat(64)}`,
        sourceVerification: "not_verified",
        architectureSlot: 6,
      },
      {
        solidityName: "VeyraRouterRegistry",
        networkId: "testnet",
        chainId: 46_630,
        address: unverifiedAddress,
        deploymentStatus: "not_verified",
        architectureSlot: 7,
      },
    ],
  };
  const result = await simulateDeployment("testnet", {
    color: false,
    deploymentManifests: { testnet: manifest },
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string };
      return jsonRpc(request.id, request.method === "eth_chainId" ? "0xb626" : "0x2a");
    },
  });

  assert.match(result.output, /1\/5 MVP contracts deployed/);
  assert.match(result.output, new RegExp(verifiedAddress));
  assert.doesNotMatch(result.output, new RegExp(unverifiedAddress));
  assert.match(result.output, /DEPLOYED · INACTIVE/);
  assert.match(result.output, /MANIFEST EVIDENCE\s+│\s+VERIFIED/);
  assert.match(result.output, /ADDRESS PRESENT · NOT VERIFIED/);
});

test("preserves verified manifest evidence when an RPC receipt check times out", async () => {
  const result = await simulateDeployment("testnet", {
    color: false,
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { id: number; method: string };
      if (request.method === "eth_getTransactionReceipt") {
        throw Object.assign(new Error("upstream timeout"), { name: "TimeoutError" });
      }
      return jsonRpc(request.id, request.method === "eth_chainId" ? "0xb626" : "0x2a");
    },
  });

  assert.match(result.output, /DEPLOYED · MANIFEST VERIFIED/);
  assert.match(result.output, /LIVE CHECK UNAVAILABLE · RPC_TIMEOUT/);
  assert.match(result.output, /manifest evidence remains intact; live verification is temporarily unavailable/i);
  assert.match(result.output, /0x10A47a16A6A903574Ed4058B67750073cC992632/);
});
