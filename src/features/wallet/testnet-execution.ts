"use client";

import { getAddress, isAddress, parseEventLogs, type Address, type Hash } from "viem";
import type { EIP1193Provider } from "viem";
import { NETWORKS } from "@/lib/config/networks";
import { VEYRA_LIGHT_ACCOUNT_VERSION } from "@/features/wallet/smart-account";
import { ROBINHOOD_TESTNET_CHAIN_ID } from "@/features/wallet/testnet-user-operation";

export interface TestnetSelfCallReceipt {
  userOperationHash: Hash;
  transactionHash: Hash;
  blockNumber: string;
  accountAddress: Address;
  ownerAddress: Address;
}

interface Eip1193RequestProvider {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
}

async function assertCurrentOwner(provider: Eip1193RequestProvider, owner: Address): Promise<void> {
  const [accounts, chainId] = await Promise.all([
    provider.request({ method: "eth_accounts" }),
    provider.request({ method: "eth_chainId" }),
  ]);
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || !isAddress(accounts[0])
    || accounts[0].toLowerCase() !== owner.toLowerCase()) throw new Error("wallet_account_changed");
  if (typeof chainId !== "string" || Number.parseInt(chainId, 16) !== ROBINHOOD_TESTNET_CHAIN_ID) {
    throw new Error("wallet_chain_changed");
  }
}

/** Sends only the consented, zero-value Robinhood Testnet self-call through Alchemy's ERC-4337 bundler. */
export async function sendRobinhoodTestnetSelfCall(input: {
  provider: Eip1193RequestProvider;
  ownerAddress: string;
  expectedAccountAddress: string;
}): Promise<TestnetSelfCallReceipt> {
  if (!isAddress(input.ownerAddress) || !isAddress(input.expectedAccountAddress)) throw new Error("wallet_identity_invalid");
  const ownerAddress = getAddress(input.ownerAddress);
  const expectedAccountAddress = getAddress(input.expectedAccountAddress);
  const network = NETWORKS.find((candidate) => candidate.id === "testnet" && candidate.chainId === ROBINHOOD_TESTNET_CHAIN_ID);
  if (!network) throw new Error("testnet_network_not_configured");
  await assertCurrentOwner(input.provider, ownerAddress);

  const [{ createPublicClient, createWalletClient, custom, defineChain, http }, { createBundlerClient }, { toLightAccount }] = await Promise.all([
    import("viem"),
    import("viem/account-abstraction"),
    import("@alchemy/smart-accounts"),
  ]);
  const chain = defineChain({
    id: ROBINHOOD_TESTNET_CHAIN_ID,
    name: network.label,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [network.rpcUrl] } },
    blockExplorers: { default: { name: "Robinhood Testnet Explorer", url: network.explorerUrl } },
  });
  const guardedProvider = {
    request: async (request: { method: string; params?: unknown }) => {
      if (request.method === "eth_sendTransaction" || request.method === "eth_signTransaction"
        || request.method === "eth_sendUserOperation") throw new Error("unexpected_wallet_transaction_method");
      const isSignature = request.method === "personal_sign" || request.method === "eth_signTypedData_v4";
      if (isSignature) await assertCurrentOwner(input.provider, ownerAddress);
      const params = Array.isArray(request.params) ? request.params as readonly unknown[] : undefined;
      const result = await input.provider.request({ method: request.method, params });
      if (isSignature) await assertCurrentOwner(input.provider, ownerAddress);
      return result;
    },
  } as unknown as EIP1193Provider;
  const walletClient = createWalletClient({ account: ownerAddress, chain, transport: custom(guardedProvider) });
  const walletOwner = walletClient.account;
  if (!walletOwner) throw new Error("wallet_owner_signer_unavailable");
  const publicClient = createPublicClient({ chain, transport: http(network.rpcUrl) });
  const account = await toLightAccount({
    client: walletClient,
    owner: walletOwner,
    version: VEYRA_LIGHT_ACCOUNT_VERSION,
    salt: BigInt(0),
  });
  const accountAddress = getAddress(await account.getAddress());
  if (accountAddress.toLowerCase() !== expectedAccountAddress.toLowerCase()) {
    throw new Error("smart_account_address_mismatch");
  }
  const ownerUrl = `/api/auth/wallet/smart-account/bundler?networkId=testnet&ownerAddress=${encodeURIComponent(ownerAddress)}`;
  const bundlerClient = createBundlerClient({
    account,
    client: publicClient,
    chain,
    transport: http(ownerUrl),
    userOperation: {
      estimateFeesPerGas: async () => {
        const fees = await publicClient.estimateFeesPerGas();
        const maxFeePerGas = fees.maxFeePerGas ?? fees.gasPrice;
        const maxPriorityFeePerGas = fees.maxPriorityFeePerGas ?? fees.maxFeePerGas ?? fees.gasPrice;
        if (maxFeePerGas === undefined || maxPriorityFeePerGas === undefined) throw new Error("testnet_fee_estimate_unavailable");
        return { maxFeePerGas, maxPriorityFeePerGas };
      },
    },
  });
  const supportedEntryPoints = await bundlerClient.getSupportedEntryPoints();
  if (!supportedEntryPoints.some((entryPoint) => entryPoint.toLowerCase() === account.entryPoint.address.toLowerCase())) {
    throw new Error("testnet_entry_point_unsupported");
  }
  await assertCurrentOwner(input.provider, ownerAddress);
  const userOperationHash = await bundlerClient.sendUserOperation({
    calls: [{ to: ownerAddress, value: BigInt(0), data: "0x" }],
  });
  const userOperationReceipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOperationHash,
    pollingInterval: 2_000,
    timeout: 120_000,
  });
  if (!userOperationReceipt.success || userOperationReceipt.sender.toLowerCase() !== accountAddress.toLowerCase()
    || userOperationReceipt.userOpHash.toLowerCase() !== userOperationHash.toLowerCase()) {
    throw new Error("testnet_user_operation_failed");
  }
  const transactionHash = userOperationReceipt.receipt.transactionHash;
  const transactionReceipt = await publicClient.getTransactionReceipt({ hash: transactionHash });
  if (transactionReceipt.status !== "success") throw new Error("testnet_transaction_receipt_failed");
  const events = parseEventLogs({
    abi: account.entryPoint.abi,
    eventName: "UserOperationEvent",
    logs: transactionReceipt.logs,
    strict: false,
  });
  const matchingEvent = events.some((event) => event.args.userOpHash?.toLowerCase() === userOperationHash.toLowerCase()
    && event.args.sender?.toLowerCase() === accountAddress.toLowerCase()
    && event.args.success === true);
  if (!matchingEvent) throw new Error("testnet_user_operation_event_unverified");

  return {
    userOperationHash,
    transactionHash,
    blockNumber: transactionReceipt.blockNumber.toString(),
    accountAddress,
    ownerAddress,
  };
}
