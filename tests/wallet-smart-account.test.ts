import assert from "node:assert/strict";
import { test } from "node:test";
import { getAddress } from "viem";
import { encodeFunctionData } from "viem";
import { AccountVersionRegistry, encodeCallsLA } from "@alchemy/smart-accounts";
import { checkAlchemyBundler, predictVeyraSmartWalletAddress, VEYRA_LIGHT_ACCOUNT, VEYRA_LIGHT_ACCOUNT_SALT, VEYRA_LIGHT_ACCOUNT_VERSION } from "@/features/wallet/smart-account";
import { assertTestnetSelfCallFeeWithinLimit, MAX_TESTNET_SELF_CALL_COST_WEI, validateTestnetSelfCallRequest } from "@/features/wallet/testnet-user-operation";
import { linkEip1193OwnerWallet } from "@/features/wallet/owner-link";
import { sendRobinhoodTestnetSelfCall } from "@/features/wallet/testnet-execution";
import { readRobinhoodSmartAccountInfrastructure, readRobinhoodSmartAccountTokenBalances } from "@/features/wallet/public-rpc";
import { ROBINHOOD_MAINNET_TOKENS } from "@/lib/config/robinhood-mainnet-contracts";
import type { ReadOnlyEip1193Provider } from "@/features/wallet/read-only";
import { PostgresResearchStore } from "@/features/security/store";

const OWNER_A = getAddress("0x00000000000000000000000000000000000000a1");
const OWNER_B = getAddress("0x00000000000000000000000000000000000000b2");

function fakeRpcFetch(options: { missing?: string } = {}): typeof fetch {
  return (async (_input: URL | RequestInfo, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
    const codeAddress = request.params[0];
    let result: string;
    if (request.method === "eth_chainId") result = "0x1237";
    else if (request.method === "eth_blockNumber") result = "0x2a";
    else if (request.method === "eth_getCode") result = codeAddress === options.missing ? "0x" : "0x60016000";
    else if (request.method === "eth_call") {
      const call = request.params[0] as { to: string; data: string };
      if (call.data === "0x313ce567") {
        const decimals = call.to.toLowerCase() === ROBINHOOD_MAINNET_TOKENS.WETH.address.toLowerCase() ? 18 : 6;
        result = `0x${BigInt(decimals).toString(16).padStart(64, "0")}`;
      } else {
        const rawBalance = call.to.toLowerCase() === ROBINHOOD_MAINNET_TOKENS.WETH.address.toLowerCase() ? BigInt("1000000000000000000") : BigInt(2_500_000);
        result = `0x${rawBalance.toString(16).padStart(64, "0")}`;
      }
    }
    else throw new Error(`unexpected_rpc_method:${request.method}`);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), { status: 200 });
  }) as typeof fetch;
}

test("Light Account address is deterministic for an owner and changes for a different owner", () => {
  const first = predictVeyraSmartWalletAddress(OWNER_A);
  assert.equal(predictVeyraSmartWalletAddress(OWNER_A), first);
  assert.notEqual(predictVeyraSmartWalletAddress(OWNER_B), first);
  assert.match(first, /^0x[0-9a-f]{40}$/i);
});

test("smart account infrastructure is ready only when factory, implementation, and EntryPoint bytecode exist", async () => {
  const complete = await readRobinhoodSmartAccountInfrastructure("mainnet", fakeRpcFetch());
  assert.equal(complete.chainId, 4_663);
  assert.equal(complete.ready, true);
  assert.equal(complete.factory.address, VEYRA_LIGHT_ACCOUNT.factoryAddress);
  assert.equal(complete.implementation.address, VEYRA_LIGHT_ACCOUNT.accountImplementation);
  assert.equal(complete.entryPoint.address, VEYRA_LIGHT_ACCOUNT.entryPoint.address);

  const missingFactory = await readRobinhoodSmartAccountInfrastructure("mainnet", fakeRpcFetch({ missing: VEYRA_LIGHT_ACCOUNT.factoryAddress }));
  assert.equal(missingFactory.ready, false);
  assert.equal(missingFactory.factory.bytecode, "absent");
});

test("smart account token reads use only configured Mainnet ERC-20 addresses and do not invent a Testnet token list", async () => {
  let testnetReads = 0;
  const testnet = await readRobinhoodSmartAccountTokenBalances("testnet", OWNER_A, (async () => {
    testnetReads += 1;
    throw new Error("testnet_token_reads_must_not_be_assumed");
  }) as typeof fetch);
  assert.deepEqual(testnet, []);
  assert.equal(testnetReads, 0);

  const balances = await readRobinhoodSmartAccountTokenBalances("mainnet", OWNER_A, fakeRpcFetch());
  assert.deepEqual(balances.map(({ address, symbol, decimals, status, balanceRaw }) => ({ address, symbol, decimals, status, balanceRaw })), [
    { address: ROBINHOOD_MAINNET_TOKENS.WETH.address, symbol: "WETH", decimals: 18, status: "available", balanceRaw: "1000000000000000000" },
    { address: ROBINHOOD_MAINNET_TOKENS.USDG.address, symbol: "USDG", decimals: 6, status: "available", balanceRaw: "2500000" },
  ]);
});

test("Alchemy bundler capability is disabled without a server credential and checks the exact EntryPoint when configured", async () => {
  let requests = 0;
  const noCredential = await checkAlchemyBundler("testnet", undefined, (async () => { requests += 1; throw new Error("must_not_fetch"); }) as typeof fetch);
  assert.equal(noCredential, "not_configured");
  assert.equal(requests, 0);

  let requestUrl = "";
  const supported = await checkAlchemyBundler("testnet", "test-only-api-key", (async (input, init) => {
    requestUrl = String(input);
    assert.equal(JSON.parse(String(init?.body)).method, "eth_supportedEntryPoints");
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: [VEYRA_LIGHT_ACCOUNT.entryPoint.address] }), { status: 200 });
  }) as typeof fetch);
  assert.equal(supported, "available");
  assert.match(requestUrl, /^https:\/\/robinhood-testnet\.g\.alchemy\.com\/v2\//);

  const malformedResponse = await checkAlchemyBundler("testnet", "test-only-api-key", (async () => new Response(
    JSON.stringify({ jsonrpc: "2.0", id: 2, result: [VEYRA_LIGHT_ACCOUNT.entryPoint.address] }),
    { status: 200 },
  )) as typeof fetch);
  assert.equal(malformedResponse, "unavailable");

  const providerError = await checkAlchemyBundler("testnet", "test-only-api-key", (async () => new Response(
    JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "not supported" }, result: [VEYRA_LIGHT_ACCOUNT.entryPoint.address] }),
    { status: 200 },
  )) as typeof fetch);
  assert.equal(providerError, "unavailable");
});

test("smart account owner lookup is scoped to the authenticated VEYRA account and requested linked wallet", async () => {
  const rows = new Map<string, string>([[`user-a:${OWNER_A.toLowerCase()}`, OWNER_A]]);
  const pool = {
    on() {},
    async query(sql: string, values?: unknown[]) {
      if (sql.includes("SELECT provider_subject FROM veyra_auth_identities")) {
        const userId = String(values?.[0]);
        const requested = values?.[1] === undefined ? undefined : String(values[1]).toLowerCase();
        const result = requested ? rows.get(`${userId}:${requested}`) : [...rows.entries()].find(([key]) => key.startsWith(`${userId}:`))?.[1];
        return { rows: result ? [{ provider_subject: result }] : [], rowCount: result ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    },
    async end() {},
  };
  const store = new PostgresResearchStore("postgres://wallet-scope.invalid/test", pool as never);
  assert.equal(await store.getLinkedWalletAddress("user-a", OWNER_A), OWNER_A);
  assert.equal(await store.getLinkedWalletAddress("user-b", OWNER_A), undefined);
  assert.equal(await store.getLinkedWalletAddress("user-a", OWNER_B), undefined);
  await store.close();
});

test("wallet owner linking signs only the server challenge and verifies unchanged account and chain", async () => {
  const calls: Array<{ method: string; params?: readonly unknown[] }> = [];
  const provider = {
    async request(args: { method: string; params?: readonly unknown[] }) {
      calls.push(args);
      if (args.method === "eth_accounts") return [OWNER_A];
      if (args.method === "eth_chainId") return "0x1237";
      if (args.method === "personal_sign") return `0x${"ab".repeat(65)}`;
      throw new Error(`unexpected_method:${args.method}`);
    },
  } as unknown as ReadOnlyEip1193Provider;
  let submitted: unknown;
  const result = await linkEip1193OwnerWallet({
    provider,
    address: OWNER_A,
    networkId: "mainnet",
    now: Date.now(),
    requestChallenge: async ({ address }) => ({
      address,
      chainId: 4_663,
      nonce: "a".repeat(32),
      message: `veyraapp.net wants you to link this wallet to your VEYRA account:\n${address}\nChain ID: 4663\nNonce: ${"a".repeat(32)}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
    verify: async (input) => {
      submitted = input;
      return { linked: true, address: OWNER_A, chainId: 4_663 };
    },
  });

  assert.deepEqual(result, { linked: true, address: OWNER_A, chainId: 4_663 });
  assert.deepEqual(submitted, { nonce: "a".repeat(32), signature: `0x${"ab".repeat(65)}` });
  assert.equal(calls.filter(({ method }) => method === "personal_sign").length, 1);
  assert.equal(calls.some(({ method }) => /sendTransaction|signTransaction|eth_sendUserOperation/.test(method)), false);
});

test("wallet owner linking aborts before signing when the connected account or chain does not match", async () => {
  for (const mismatch of [
    { account: OWNER_B, chain: "0x1237" },
    { account: OWNER_A, chain: "0xb626" },
  ]) {
    const methods: string[] = [];
    const provider = {
      async request({ method }: { method: string }) {
        methods.push(method);
        if (method === "eth_accounts") return [mismatch.account];
        if (method === "eth_chainId") return mismatch.chain;
        throw new Error(`unexpected_method:${method}`);
      },
    } as unknown as ReadOnlyEip1193Provider;
    await assert.rejects(linkEip1193OwnerWallet({
      provider,
      address: OWNER_A,
      networkId: "mainnet",
      requestChallenge: async () => { throw new Error("challenge_must_not_be_requested"); },
      verify: async () => { throw new Error("verify_must_not_be_called"); },
    }), /wallet_(account|chain)_changed/);
    assert.equal(methods.includes("personal_sign"), false);
  }
});

test("wallet owner linking does not submit a signature if the account changes during approval", async () => {
  let accountReads = 0;
  const provider = {
    async request({ method }: { method: string }) {
      if (method === "eth_chainId") return "0x1237";
      if (method === "eth_accounts") return [++accountReads < 2 ? OWNER_A : OWNER_B];
      if (method === "personal_sign") return `0x${"cd".repeat(65)}`;
      throw new Error(`unexpected_method:${method}`);
    },
  } as unknown as ReadOnlyEip1193Provider;
  let verified = false;
  await assert.rejects(linkEip1193OwnerWallet({
    provider,
    address: OWNER_A,
    networkId: "mainnet",
    requestChallenge: async ({ address }) => ({
      address,
      chainId: 4_663,
      nonce: "b".repeat(32),
      message: `Chain ID: 4663\\n${address}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
    verify: async () => { verified = true; return { linked: true, address: OWNER_A, chainId: 4_663 }; },
  }), /wallet_account_changed/);
  assert.equal(verified, false);
});

test("Testnet execution aborts before any signature when the wallet owner is on the wrong chain", async () => {
  const methods: string[] = [];
  const provider = {
    async request({ method }: { method: string }) {
      methods.push(method);
      if (method === "eth_accounts") return [OWNER_A];
      if (method === "eth_chainId") return "0x1237";
      throw new Error(`unexpected_method:${method}`);
    },
  };
  await assert.rejects(sendRobinhoodTestnetSelfCall({
    provider,
    ownerAddress: OWNER_A,
    expectedAccountAddress: predictVeyraSmartWalletAddress(OWNER_A),
  }), /wallet_chain_changed/);
  assert.deepEqual(methods, ["eth_accounts", "eth_chainId"]);
});

test("Testnet UserOperation guard permits only a linked-owner zero-value call and matching LightAccount factory init", () => {
  const account = predictVeyraSmartWalletAddress(OWNER_A);
  const factoryAbi = AccountVersionRegistry.LightAccount[VEYRA_LIGHT_ACCOUNT_VERSION].factoryAbi;
  const userOperation = {
    sender: account,
    nonce: "0x0",
    factory: VEYRA_LIGHT_ACCOUNT.factoryAddress,
    factoryData: encodeFunctionData({ abi: factoryAbi, functionName: "createAccount", args: [OWNER_A, VEYRA_LIGHT_ACCOUNT_SALT] }),
    callData: encodeCallsLA([{ to: OWNER_A, value: BigInt(0), data: "0x" }]),
    callGasLimit: "0x5208",
    verificationGasLimit: "0x186a0",
    preVerificationGas: "0x7530",
    maxFeePerGas: "0x3b9aca00",
    maxPriorityFeePerGas: "0x3b9aca00",
    signature: `0x00${"ab".repeat(65)}`,
  };
  const request = {
    jsonrpc: "2.0" as const,
    id: 1,
    method: "eth_sendUserOperation" as const,
    params: [userOperation, VEYRA_LIGHT_ACCOUNT.entryPoint.address],
  };
  assert.deepEqual(validateTestnetSelfCallRequest({ request, linkedOwner: OWNER_A, expectedAccount: account, accountDeployed: false }), {
    sender: account,
    owner: OWNER_A,
    userOperation,
  });
  assert.doesNotThrow(() => assertTestnetSelfCallFeeWithinLimit({ userOperation }));
  assert.throws(() => assertTestnetSelfCallFeeWithinLimit({
    userOperation: { ...userOperation, maxFeePerGas: (MAX_TESTNET_SELF_CALL_COST_WEI + BigInt(1)).toString() },
  }), /testnet_self_call_fee_limit_exceeded/);

  const withValue = { ...userOperation, callData: encodeCallsLA([{ to: OWNER_A, value: BigInt(1), data: "0x" }]) };
  assert.throws(() => validateTestnetSelfCallRequest({
    request: { ...request, params: [withValue, VEYRA_LIGHT_ACCOUNT.entryPoint.address] },
    linkedOwner: OWNER_A,
    expectedAccount: account,
    accountDeployed: false,
  }), /testnet_self_call_only/);

  const wrongFactoryOwner = {
    ...userOperation,
    factoryData: encodeFunctionData({ abi: factoryAbi, functionName: "createAccount", args: [OWNER_B, VEYRA_LIGHT_ACCOUNT_SALT] }),
  };
  assert.throws(() => validateTestnetSelfCallRequest({
    request: { ...request, params: [wrongFactoryOwner, VEYRA_LIGHT_ACCOUNT.entryPoint.address] },
    linkedOwner: OWNER_A,
    expectedAccount: account,
    accountDeployed: false,
  }), /counterfactual_factory_owner_mismatch/);

  assert.throws(() => validateTestnetSelfCallRequest({
    request: { ...request, params: [{ ...userOperation, paymaster: OWNER_B }, VEYRA_LIGHT_ACCOUNT.entryPoint.address] },
    linkedOwner: OWNER_A,
    expectedAccount: account,
    accountDeployed: false,
  }), /testnet_paymaster_not_allowed/);
});
