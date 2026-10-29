import { getAddress, isAddress } from "viem";
import { NETWORKS } from "@/lib/config/networks";
import type { NetworkId } from "@/types/network";

export interface WalletLinkChallenge {
  address: string;
  chainId: number;
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface WalletLinkResult {
  linked: true;
  address: string;
  chainId: number;
}

interface Eip1193Signer {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
}

function expectedChainId(networkId: NetworkId): number {
  const network = NETWORKS.find((candidate) => candidate.id === networkId && candidate.available);
  if (!network) throw new Error("wallet_network_not_supported");
  return network.chainId;
}

async function assertOwnerContext(provider: Eip1193Signer, address: string, chainId: number): Promise<void> {
  const [accounts, rawChainId] = await Promise.all([
    provider.request({ method: "eth_accounts" }),
    provider.request({ method: "eth_chainId" }),
  ]);
  const connectedAddress = Array.isArray(accounts) && typeof accounts[0] === "string" && isAddress(accounts[0])
    ? accounts[0]
    : undefined;
  if (!connectedAddress || connectedAddress.toLowerCase() !== address.toLowerCase()) {
    throw new Error("wallet_account_changed");
  }
  const connectedChainId = typeof rawChainId === "string" && /^0x[0-9a-f]+$/i.test(rawChainId)
    ? Number.parseInt(rawChainId, 16)
    : undefined;
  if (connectedChainId !== chainId) throw new Error("wallet_chain_changed");
}

/** Links only a server-issued EIP-191 challenge; it never requests a transaction signature. */
export async function linkEip1193OwnerWallet(input: {
  provider: Eip1193Signer;
  address: string;
  networkId: NetworkId;
  now?: number;
  requestChallenge: (request: { networkId: NetworkId; address: string }) => Promise<WalletLinkChallenge>;
  verify: (request: { nonce: string; signature: string }) => Promise<WalletLinkResult>;
}): Promise<WalletLinkResult> {
  if (!isAddress(input.address)) throw new Error("wallet_owner_address_invalid");
  const address = getAddress(input.address);
  const chainId = expectedChainId(input.networkId);
  await assertOwnerContext(input.provider, address, chainId);

  const challenge = await input.requestChallenge({ networkId: input.networkId, address });
  if (!isAddress(challenge.address) || challenge.address.toLowerCase() !== address.toLowerCase()
    || challenge.chainId !== chainId || !/^[a-f0-9]{32}$/i.test(challenge.nonce)
    || !challenge.message.includes(address) || !challenge.message.includes(`Chain ID: ${chainId}`)
    || !Number.isFinite(Date.parse(challenge.expiresAt)) || Date.parse(challenge.expiresAt) <= (input.now ?? Date.now())) {
    throw new Error("wallet_link_challenge_invalid");
  }

  const rawSignature = await input.provider.request({ method: "personal_sign", params: [challenge.message, address] });
  if (typeof rawSignature !== "string" || !/^0x[0-9a-f]{130}$/i.test(rawSignature)) {
    throw new Error("wallet_link_signature_invalid");
  }
  await assertOwnerContext(input.provider, address, chainId);

  const result = await input.verify({ nonce: challenge.nonce, signature: rawSignature });
  if (result.linked !== true || !isAddress(result.address) || result.address.toLowerCase() !== address.toLowerCase()
    || result.chainId !== chainId) {
    throw new Error("wallet_link_result_invalid");
  }
  return { ...result, address: getAddress(result.address) };
}
