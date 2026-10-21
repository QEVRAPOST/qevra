import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NETWORKS } from "@/lib/config/networks";
import { getExplorerAddressUrl, getExplorerTransactionUrl } from "@/lib/config/networks";
import { readRobinhoodNetwork, RobinhoodRpcError } from "@/features/wallet/public-rpc";
import type { NetworkId, NetworkOption } from "@/types/network";
import { createPublicClient, getAddress, http, isAddress, keccak256, type Hash, type Hex } from "viem";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACTS_ROOT = resolve(ROOT, "contracts");

export function resolveRobinhoodNetwork(value: string): NetworkOption {
  const network = NETWORKS.find((candidate) => candidate.id === value && candidate.available);
  if (!network) throw new Error(`Unsupported Robinhood network: ${value}`);
  return network;
}

export function deploymentReadiness(networkId: NetworkId): { ready: false; reason: string } {
  resolveRobinhoodNetwork(networkId);
  return networkId === "mainnet"
    ? { ready: false, reason: "Mainnet deployment is blocked pending independent security review and owner approval." }
    : { ready: false, reason: "No approved deployment artifact exists; the Phase 0 research harness and verifier are excluded." };
}

export interface DeploymentPreflight {
  networkId: NetworkId;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  accountAlias: string | null;
  publicDeployer: `0x${string}` | null;
  keyMaterialAccessed: false;
  deploymentReady: false;
  reason: string;
}

export function buildDeploymentPreflight(
  networkId: NetworkId,
  deployerAddress: string,
  env: NodeJS.ProcessEnv = process.env,
): DeploymentPreflight {
  const network = resolveRobinhoodNetwork(networkId);
  const testnetAccount = "veyra-testnet";
  const requestedMainnetAccount = env.VEYRA_MAINNET_ACCOUNT?.trim() || null;
  const accountAlias = networkId === "testnet" ? testnetAccount : requestedMainnetAccount;
  let reason = deploymentReadiness(networkId).reason;
  const publicDeployer = isAddress(deployerAddress) ? getAddress(deployerAddress) : null;

  if (!publicDeployer) reason = "A valid public deployer address is required; no key material was read.";
  else if (networkId === "mainnet" && !requestedMainnetAccount) {
    reason = "Mainnet requires a separately created encrypted Foundry keystore alias in VEYRA_MAINNET_ACCOUNT.";
  } else if (networkId === "mainnet" && requestedMainnetAccount === testnetAccount) {
    reason = "Mainnet must not reuse the Testnet veyra-testnet keystore account.";
  }

  return {
    networkId,
    chainId: network.chainId,
    rpcUrl: network.rpcUrl,
    explorerUrl: network.explorerUrl,
    accountAlias,
    publicDeployer,
    keyMaterialAccessed: false,
    deploymentReady: false,
    reason,
  };
}

export interface DeploymentReceiptReader {
  getChainId(): Promise<number>;
  getTransactionReceipt(input: { hash: Hash }): Promise<{
    status: "success" | "reverted";
    contractAddress: string | null;
    blockNumber: bigint;
    from: string;
    gasUsed: bigint;
  }>;
  getCode(input: { address: `0x${string}`; blockNumber: bigint }): Promise<Hex | undefined>;
}

export type DeploymentVerification =
  | {
      verified: true;
      evidence: {
        networkId: NetworkId;
        chainId: number;
        deployerAddress: `0x${string}`;
        transactionHash: Hash;
        address: `0x${string}`;
        blockNumber: string;
        gasUsed: string;
        runtimeBytecodeHash: Hash;
        addressExplorerUrl: string;
        transactionExplorerUrl: string;
        sourceVerification: "not_verified";
      };
    }
  | { verified: false; reason: "invalid_address_or_transaction_hash" | "chain_id_mismatch" | "transaction_reverted" | "receipt_address_mismatch" | "runtime_bytecode_missing" | "runtime_bytecode_mismatch" };

export async function verifyDeploymentEvidence(
  networkId: NetworkId,
  addressInput: string,
  transactionHashInput: string,
  expectedRuntimeBytecodeHash: string,
  reader?: DeploymentReceiptReader,
): Promise<DeploymentVerification> {
  const network = resolveRobinhoodNetwork(networkId);
  if (!isAddress(addressInput) || !/^0x[0-9a-f]{64}$/i.test(transactionHashInput)
    || !/^0x[0-9a-f]{64}$/i.test(expectedRuntimeBytecodeHash)) {
    return { verified: false, reason: "invalid_address_or_transaction_hash" };
  }
  const address = getAddress(addressInput);
  const transactionHash = transactionHashInput as Hash;
  const publicClient = reader ?? createPublicClient({ transport: http(network.rpcUrl) });
  if (await publicClient.getChainId() !== network.chainId) return { verified: false, reason: "chain_id_mismatch" };
  const receipt = await publicClient.getTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== "success") return { verified: false, reason: "transaction_reverted" };
  if (!receipt.contractAddress || !isAddress(receipt.contractAddress) || getAddress(receipt.contractAddress) !== address) {
    return { verified: false, reason: "receipt_address_mismatch" };
  }
  const code = await publicClient.getCode({ address, blockNumber: receipt.blockNumber });
  if (!code || code === "0x") return { verified: false, reason: "runtime_bytecode_missing" };
  const runtimeBytecodeHash = keccak256(code);
  if (runtimeBytecodeHash.toLowerCase() !== expectedRuntimeBytecodeHash.toLowerCase()) {
    return { verified: false, reason: "runtime_bytecode_mismatch" };
  }
  const deployerAddress = getAddress(receipt.from);
  const addressExplorerUrl = getExplorerAddressUrl(networkId, address);
  const transactionExplorerUrl = getExplorerTransactionUrl(networkId, transactionHash);
  if (!addressExplorerUrl || !transactionExplorerUrl) return { verified: false, reason: "invalid_address_or_transaction_hash" };
  return {
    verified: true,
    evidence: {
      networkId,
      chainId: network.chainId,
      deployerAddress,
      transactionHash,
      address,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      runtimeBytecodeHash,
      addressExplorerUrl,
      transactionExplorerUrl,
      sourceVerification: "not_verified",
    },
  };
}

export function explorerReadiness(networkId: NetworkId, explorerUrl?: string): { ready: false; reason: string } {
  resolveRobinhoodNetwork(networkId);
  if (explorerUrl) {
    try {
      const url = new URL(explorerUrl);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
        return { ready: false, reason: "Explorer URL must be a plain HTTPS URL without credentials, query, or fragment." };
      }
    } catch {
      return { ready: false, reason: "Explorer URL is invalid." };
    }
  }
  return { ready: false, reason: "No approved deployment artifact or verified Robinhood explorer API is configured." };
}

function printUsage(): void {
  process.stdout.write([
    "Robinhood read-only tooling:",
    "  bun scripts/robinhood.ts rpc <testnet|mainnet>",
    "  bun scripts/robinhood.ts contracts <build|size|gas>",
    "  bun scripts/robinhood.ts deploy <validate|dry-run> <testnet|mainnet>",
    "  bun scripts/robinhood.ts deploy preflight <testnet|mainnet> <public-deployer-address>",
    "  bun scripts/robinhood.ts deploy verify <testnet|mainnet> <contract-address> <transaction-hash> <expected-runtime-code-hash>",
    "  bun scripts/robinhood.ts explorer readiness <testnet|mainnet> [https://explorer.example]",
    "",
  ].join("\n"));
}

function runForge(args: string[]): number {
  process.stdout.write(`forge ${args.join(" ")} (contracts/; offline; no broadcast)\n`);
  const result = spawnSync("forge", args, { cwd: CONTRACTS_ROOT, stdio: "inherit", shell: false });
  if (result.error) {
    process.stderr.write("Foundry command could not be started. Install Foundry and retry.\n");
    return 1;
  }
  return result.status ?? 1;
}

async function runRpc(networkValue: string): Promise<number> {
  const network = resolveRobinhoodNetwork(networkValue);
  try {
    const snapshot = await readRobinhoodNetwork(network.id);
    process.stdout.write(`${network.label}: RPC healthy · chain ${snapshot.chainId} verified · block ${snapshot.latestBlock} · ${snapshot.observedAt}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof RobinhoodRpcError ? error.code : "rpc_unavailable";
    process.stderr.write(`${network.label}: RPC unavailable (${code}). No write request was made.\n`);
    return 1;
  }
}

function runContracts(action: string): number {
  if (action === "build") return runForge(["build", "--offline"]);
  if (action === "size") return runForge(["build", "--offline", "--sizes"]);
  if (action === "gas") {
    process.stdout.write("No deployable VEYRA contract is approved; the Phase 0 research harness is excluded, so there is no eligible gas estimate.\n");
    return 2;
  }
  printUsage();
  return 2;
}

async function runDeployment(
  action: string,
  networkValue: string,
  deployerAddress?: string,
  transactionHash?: string,
  expectedRuntimeBytecodeHash?: string,
): Promise<number> {
  const network = resolveRobinhoodNetwork(networkValue);
  const result = deploymentReadiness(network.id);
  if (action === "verify") {
    if (!deployerAddress || !transactionHash || !expectedRuntimeBytecodeHash) {
      process.stderr.write("Verification requires the observed contract address, transaction hash, and expected runtime-code hash from the built artifact.\n");
      return 2;
    }
    try {
      const verification = await verifyDeploymentEvidence(network.id, deployerAddress, transactionHash, expectedRuntimeBytecodeHash);
      if (!verification.verified) {
        process.stderr.write(`DEPLOYMENT NOT VERIFIED · ${network.label}: ${verification.reason}\n`);
        return 2;
      }
      process.stdout.write(`${JSON.stringify(verification.evidence, null, 2)}\n`);
      process.stdout.write("Source verification: not_verified (reported separately from on-chain deployment verification).\n");
      return 0;
    } catch {
      process.stderr.write(`DEPLOYMENT NOT VERIFIED · ${network.label}: receipt or bytecode read failed.\n`);
      return 2;
    }
  }
  if (action === "preflight") {
    if (!deployerAddress) {
      process.stderr.write("Preflight requires a public deployer address. No private key or keystore contents are read.\n");
      return 2;
    }
    const plan = buildDeploymentPreflight(network.id, deployerAddress);
    process.stdout.write(`${network.label}: expected chain ${plan.chainId} · RPC ${plan.rpcUrl}\n`);
    process.stdout.write(`Encrypted Foundry account alias: ${plan.accountAlias ?? "not configured"} · key material read: no\n`);
    try {
      const snapshot = await readRobinhoodNetwork(network.id);
      process.stdout.write(`Observed chain ${snapshot.chainId} · latest block ${snapshot.latestBlock} · ${snapshot.observedAt}\n`);
      if (snapshot.chainId !== plan.chainId) {
        process.stderr.write("PREFLIGHT BLOCKED · Observed chain does not match the selected network.\n");
        return 2;
      }
    } catch (error) {
      const code = error instanceof RobinhoodRpcError ? error.code : "rpc_unavailable";
      process.stderr.write(`PREFLIGHT BLOCKED · RPC unavailable (${code}). No write request was made.\n`);
      return 2;
    }
    process.stdout.write(`PREFLIGHT BLOCKED · ${plan.reason}\nNo transaction was constructed or broadcast.\n`);
    return 2;
  }
  if (action === "validate") {
    process.stdout.write(`BLOCKED · ${network.label}: ${result.reason}\n`);
    return 2;
  }
  if (action === "dry-run") {
    process.stdout.write(`DRY-RUN BLOCKED · ${network.label}: ${result.reason}\nNo deployment transaction was constructed or broadcast.\n`);
    return 2;
  }
  printUsage();
  return 2;
}

function runExplorer(action: string, networkValue: string, explorerUrl?: string): number {
  if (action !== "readiness") {
    printUsage();
    return 2;
  }
  const network = resolveRobinhoodNetwork(networkValue);
  const result = explorerReadiness(network.id, explorerUrl);
  process.stdout.write(`EXPLORER NOT READY · ${network.label}: ${result.reason}\n`);
  return 2;
}

export async function main(args: string[]): Promise<number> {
  try {
    const [group, action, value, extra, extra2, extra3] = args;
    if (group === "rpc" && action) return await runRpc(action);
    if (group === "contracts" && action) return runContracts(action);
    if (group === "deploy" && action && value) return await runDeployment(action, value, extra, extra2, extra3);
    if (group === "explorer" && action && value) return runExplorer(action, value, extra);
    printUsage();
    return 2;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Robinhood command failed."}\n`);
    return 2;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  void main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
