import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NETWORKS } from "@/lib/config/networks";
import { getExplorerAddressUrl, getExplorerTransactionUrl } from "@/lib/config/networks";
import { readRobinhoodNetwork, RobinhoodRpcError } from "@/features/wallet/public-rpc";
import type { NetworkId, NetworkOption } from "@/types/network";
import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  keccak256,
  type Address,
  type Hash,
  type Hex,
} from "viem";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACTS_ROOT = resolve(ROOT, "contracts");

export const ROBINHOOD_MAINNET_SAFE = {
  singleton: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762" as Address,
  singletonCodeHash: "0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff" as Hash,
  proxyFactory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67" as Address,
  proxyFactoryCodeHash: "0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317" as Hash,
  fallbackHandler: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99" as Address,
  fallbackHandlerCodeHash: "0x7c6007a5d711cea8dfd5d91f5940ec29c7f200fe511eb1fc1397b367af3c42f9" as Hash,
  fallbackSlot: "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5" as Hex,
  guardSlot: "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8" as Hex,
  moduleGuardSlot: "0xb104e0b93118902c651344349b610029d694cfdec91c589c91ebafbcd0289947" as Hex,
  moduleSentinel: "0x0000000000000000000000000000000000000001" as Address,
} as const;

const SAFE_PROXY_ABI = [{
  type: "function",
  name: "masterCopy",
  stateMutability: "view",
  inputs: [],
  outputs: [{ name: "singleton", type: "address" }],
}] as const;

const SAFE_OWNER_ABI = [
  { type: "function", name: "VERSION", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "getOwners", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
  { type: "function", name: "getThreshold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "getModulesPaginated",
    stateMutability: "view",
    inputs: [{ name: "start", type: "address" }, { name: "pageSize", type: "uint256" }],
    outputs: [{ name: "array", type: "address[]" }, { name: "next", type: "address" }],
  },
  {
    type: "function",
    name: "getStorageAt",
    stateMutability: "view",
    inputs: [{ name: "offset", type: "uint256" }, { name: "length", type: "uint256" }],
    outputs: [{ name: "returnData", type: "bytes" }],
  },
] as const;

const SAFE_PROXY_CREATION_EVENT = {
  type: "event",
  name: "ProxyCreation",
  inputs: [
    { name: "proxy", type: "address", indexed: true },
    { name: "singleton", type: "address", indexed: false },
  ],
} as const;

export interface MainnetSafeOwnerReader {
  getChainId(): Promise<number>;
  hasCode(address: Address): Promise<boolean>;
  getCodeHash(address: Address): Promise<Hash | null>;
  getFactoryProxySingleton(owner: Address): Promise<Address | null>;
  getSingleton(owner: Address): Promise<Address>;
  getVersion(owner: Address): Promise<string>;
  getOwners(owner: Address): Promise<readonly Address[]>;
  getThreshold(owner: Address): Promise<bigint>;
  getModules(owner: Address): Promise<{ modules: readonly Address[]; next: Address }>;
  getStorageAddress(owner: Address, slot: Hex): Promise<Address>;
}

export interface MainnetEoaOwnerReader {
  getChainId(): Promise<number>;
  hasCode(address: Address): Promise<boolean>;
}

export type MainnetEoaOwnerVerification =
  | {
      verified: true;
      ownerAddress: Address;
      codeAbsent: true;
      keyControlProven: false;
    }
  | {
      verified: false;
      reason:
        | "invalid_public_role_address"
        | "role_address_overlap"
        | "chain_id_mismatch"
        | "owner_code_present"
        | "eoa_rpc_read_failed";
    };

export async function verifyMainnetEoaOwner(
  ownerInput: string,
  deployerInput: string,
  attestorInput: string,
  reader: MainnetEoaOwnerReader = createMainnetEoaOwnerReader(),
): Promise<MainnetEoaOwnerVerification> {
  if (!isAddress(ownerInput) || !isAddress(deployerInput) || !isAddress(attestorInput)) {
    return { verified: false, reason: "invalid_public_role_address" };
  }
  const ownerAddress = getAddress(ownerInput);
  const deployer = getAddress(deployerInput);
  const attestor = getAddress(attestorInput);
  if (ownerAddress === deployer || ownerAddress === attestor || deployer === attestor) {
    return { verified: false, reason: "role_address_overlap" };
  }

  try {
    if (await reader.getChainId() !== 4_663) return { verified: false, reason: "chain_id_mismatch" };
    if (await reader.hasCode(ownerAddress)) return { verified: false, reason: "owner_code_present" };
    return { verified: true, ownerAddress, codeAbsent: true, keyControlProven: false };
  } catch {
    return { verified: false, reason: "eoa_rpc_read_failed" };
  }
}

function createMainnetEoaOwnerReader(): MainnetEoaOwnerReader {
  const client = createPublicClient({ transport: http(resolveRobinhoodNetwork("mainnet").rpcUrl) });
  return {
    getChainId: () => client.getChainId(),
    hasCode: async (address) => {
      const code = await client.getCode({ address });
      return Boolean(code && code !== "0x");
    },
  };
}

export type MainnetSafeOwnerVerification =
  | {
      verified: true;
      ownerAddress: Address;
      implementation: Address;
      version: "1.4.1";
      signers: readonly Address[];
      threshold: 2;
      enabledModules: readonly [];
      guard: Address;
      moduleGuard: Address;
      fallbackHandler: Address;
      factory: Address;
    }
  | {
      verified: false;
      reason:
        | "invalid_owner_address"
        | "deployer_or_attestor_overlap"
        | "chain_id_mismatch"
        | "owner_code_missing"
        | "safe_component_code_missing"
        | "safe_component_code_mismatch"
        | "owner_not_factory_created_safe"
        | "implementation_mismatch"
        | "safe_version_mismatch"
        | "threshold_or_owner_count_mismatch"
        | "invalid_or_overlapping_signer"
        | "modules_enabled"
        | "guard_enabled"
        | "module_guard_enabled"
        | "fallback_handler_mismatch"
        | "safe_rpc_read_failed";
    };

export async function verifyMainnetSafeOwner(
  ownerInput: string,
  deployerInput: string,
  attestorInput?: string,
  reader: MainnetSafeOwnerReader = createMainnetSafeOwnerReader(),
): Promise<MainnetSafeOwnerVerification> {
  if (!isAddress(ownerInput) || !isAddress(deployerInput)) return { verified: false, reason: "invalid_owner_address" };
  const ownerAddress = getAddress(ownerInput);
  const deployer = getAddress(deployerInput);
  if (ownerAddress === deployer || (attestorInput && (!isAddress(attestorInput) || ownerAddress === getAddress(attestorInput)))) {
    return { verified: false, reason: "deployer_or_attestor_overlap" };
  }

  try {
    if (await reader.getChainId() !== 4_663) return { verified: false, reason: "chain_id_mismatch" };
    if (!await reader.hasCode(ownerAddress)) return { verified: false, reason: "owner_code_missing" };
    const componentAddresses = [
      ROBINHOOD_MAINNET_SAFE.singleton,
      ROBINHOOD_MAINNET_SAFE.proxyFactory,
      ROBINHOOD_MAINNET_SAFE.fallbackHandler,
    ];
    for (const address of componentAddresses) {
      if (!await reader.hasCode(address)) return { verified: false, reason: "safe_component_code_missing" };
    }
    const expectedCodeHashes = [
      [ROBINHOOD_MAINNET_SAFE.singleton, ROBINHOOD_MAINNET_SAFE.singletonCodeHash],
      [ROBINHOOD_MAINNET_SAFE.proxyFactory, ROBINHOOD_MAINNET_SAFE.proxyFactoryCodeHash],
      [ROBINHOOD_MAINNET_SAFE.fallbackHandler, ROBINHOOD_MAINNET_SAFE.fallbackHandlerCodeHash],
    ] as const;
    for (const [address, expectedHash] of expectedCodeHashes) {
      if ((await reader.getCodeHash(address))?.toLowerCase() !== expectedHash.toLowerCase()) {
        return { verified: false, reason: "safe_component_code_mismatch" };
      }
    }
    const factorySingleton = await reader.getFactoryProxySingleton(ownerAddress);
    if (!factorySingleton || getAddress(factorySingleton) !== ROBINHOOD_MAINNET_SAFE.singleton) {
      return { verified: false, reason: "owner_not_factory_created_safe" };
    }

    if (getAddress(await reader.getSingleton(ownerAddress)) !== ROBINHOOD_MAINNET_SAFE.singleton) {
      return { verified: false, reason: "implementation_mismatch" };
    }
    if (await reader.getVersion(ownerAddress) !== "1.4.1") return { verified: false, reason: "safe_version_mismatch" };
    const [signersRaw, threshold, moduleState, guard, moduleGuard, fallbackHandler] = await Promise.all([
      reader.getOwners(ownerAddress),
      reader.getThreshold(ownerAddress),
      reader.getModules(ownerAddress),
      reader.getStorageAddress(ownerAddress, ROBINHOOD_MAINNET_SAFE.guardSlot),
      reader.getStorageAddress(ownerAddress, ROBINHOOD_MAINNET_SAFE.moduleGuardSlot),
      reader.getStorageAddress(ownerAddress, ROBINHOOD_MAINNET_SAFE.fallbackSlot),
    ]);
    if (signersRaw.length !== 3 || threshold !== BigInt(2)) {
      return { verified: false, reason: "threshold_or_owner_count_mismatch" };
    }
    const signers = signersRaw.map((signer) => isAddress(signer) ? getAddress(signer) : null);
    if (signers.some((signer) => !signer)
      || new Set(signers).size !== 3
      || signers.some((signer) => signer === "0x0000000000000000000000000000000000000000"
        || signer === ROBINHOOD_MAINNET_SAFE.moduleSentinel
        || signer === deployer
        || (attestorInput && signer === getAddress(attestorInput)))) {
      return { verified: false, reason: "invalid_or_overlapping_signer" };
    }
    if (moduleState.modules.length > 0 || getAddress(moduleState.next) !== ROBINHOOD_MAINNET_SAFE.moduleSentinel) {
      return { verified: false, reason: "modules_enabled" };
    }
    if (guard !== "0x0000000000000000000000000000000000000000") return { verified: false, reason: "guard_enabled" };
    if (moduleGuard !== "0x0000000000000000000000000000000000000000") {
      return { verified: false, reason: "module_guard_enabled" };
    }
    if (getAddress(fallbackHandler) !== ROBINHOOD_MAINNET_SAFE.fallbackHandler) {
      return { verified: false, reason: "fallback_handler_mismatch" };
    }

    return {
      verified: true,
      ownerAddress,
      implementation: ROBINHOOD_MAINNET_SAFE.singleton,
      version: "1.4.1",
      signers: signers as Address[],
      threshold: 2,
      enabledModules: [],
      guard,
      moduleGuard,
      fallbackHandler: getAddress(fallbackHandler),
      factory: ROBINHOOD_MAINNET_SAFE.proxyFactory,
    };
  } catch {
    return { verified: false, reason: "safe_rpc_read_failed" };
  }
}

function createMainnetSafeOwnerReader(): MainnetSafeOwnerReader {
  const client = createPublicClient({ transport: http(resolveRobinhoodNetwork("mainnet").rpcUrl) });
  return {
    getChainId: () => client.getChainId(),
    hasCode: async (address) => {
      const code = await client.getCode({ address });
      return Boolean(code && code !== "0x");
    },
    getCodeHash: async (address) => {
      const code = await client.getCode({ address });
      return code && code !== "0x" ? keccak256(code) : null;
    },
    getFactoryProxySingleton: async (owner) => {
      const logs = await client.getLogs({
        address: ROBINHOOD_MAINNET_SAFE.proxyFactory,
        event: SAFE_PROXY_CREATION_EVENT,
        args: { proxy: owner },
        fromBlock: BigInt(0),
        toBlock: "latest",
      });
      if (logs.length !== 1 || !logs[0]?.args.singleton) return null;
      return getAddress(logs[0].args.singleton);
    },
    getSingleton: async (owner) => client.readContract({ address: owner, abi: SAFE_PROXY_ABI, functionName: "masterCopy" }),
    getVersion: async (owner) => client.readContract({ address: owner, abi: SAFE_OWNER_ABI, functionName: "VERSION" }),
    getOwners: async (owner) => client.readContract({ address: owner, abi: SAFE_OWNER_ABI, functionName: "getOwners" }),
    getThreshold: async (owner) => client.readContract({ address: owner, abi: SAFE_OWNER_ABI, functionName: "getThreshold" }),
    getModules: async (owner) => {
      const [modules, next] = await client.readContract({
        address: owner,
        abi: SAFE_OWNER_ABI,
        functionName: "getModulesPaginated",
        args: [ROBINHOOD_MAINNET_SAFE.moduleSentinel, BigInt(1)],
      });
      return { modules, next };
    },
    getStorageAddress: async (owner, slot) => {
      const raw = await client.readContract({
        address: owner,
        abi: SAFE_OWNER_ABI,
        functionName: "getStorageAt",
        args: [BigInt(slot), BigInt(1)],
      });
      if (!/^0x[0-9a-f]{64}$/i.test(raw)) throw new Error("Invalid Safe storage response");
      return getAddress(`0x${raw.slice(-40)}`);
    },
  };
}

export function resolveRobinhoodNetwork(value: string): NetworkOption {
  const network = NETWORKS.find((candidate) => candidate.id === value && candidate.available);
  if (!network) throw new Error(`Unsupported Robinhood network: ${value}`);
  return network;
}

export function deploymentReadiness(networkId: NetworkId): { ready: false; reason: string } {
  resolveRobinhoodNetwork(networkId);
  return networkId === "mainnet"
    ? { ready: false, reason: "Mainnet deployment is blocked pending independent security review and owner approval." }
    : { ready: false, reason: "VeyraResearchEvidenceAnchor is prepared for Testnet but awaits explicit owner authorization; the Phase 0 research harness and verifier remain excluded." };
}

export interface DeploymentPreflight {
  networkId: NetworkId;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  accountAlias: string | null;
  publicDeployer: `0x${string}` | null;
  ownerAddress: Address | null;
  ownerMode: "SAFE_2_OF_3" | "EOA_INACTIVE" | null;
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
  const requestedOwnerAddress = env.VEYRA_MAINNET_OWNER?.trim() || null;
  const requestedOwnerMode = env.VEYRA_MAINNET_OWNER_MODE?.trim() || null;
  const ownerMode = requestedOwnerMode === "SAFE_2_OF_3" || requestedOwnerMode === "EOA_INACTIVE"
    ? requestedOwnerMode
    : null;
  const accountAlias = networkId === "testnet" ? testnetAccount : requestedMainnetAccount;
  let reason = deploymentReadiness(networkId).reason;
  const publicDeployer = isAddress(deployerAddress) ? getAddress(deployerAddress) : null;
  const ownerAddress = requestedOwnerAddress && isAddress(requestedOwnerAddress) ? getAddress(requestedOwnerAddress) : null;

  if (!publicDeployer) reason = "A valid public deployer address is required; no key material was read.";
  else if (networkId === "mainnet" && !requestedMainnetAccount) {
    reason = "Mainnet requires a separately created encrypted Foundry keystore alias in VEYRA_MAINNET_ACCOUNT.";
  } else if (networkId === "mainnet" && requestedMainnetAccount === testnetAccount) {
    reason = "Mainnet must not reuse the Testnet veyra-testnet keystore account.";
  } else if (networkId === "mainnet" && !ownerMode) {
    reason = "Mainnet requires VEYRA_MAINNET_OWNER_MODE=SAFE_2_OF_3 or EOA_INACTIVE; invalid or missing modes fail closed.";
  } else if (networkId === "mainnet" && !requestedOwnerAddress) {
    reason = "Mainnet requires VEYRA_MAINNET_OWNER to be a public owner address validated for the selected profile.";
  } else if (networkId === "mainnet" && !ownerAddress) {
    reason = "VEYRA_MAINNET_OWNER must be a valid public address; no key material was read.";
  }

  return {
    networkId,
    chainId: network.chainId,
    rpcUrl: network.rpcUrl,
    explorerUrl: network.explorerUrl,
    accountAlias,
    publicDeployer,
    ownerAddress,
    ownerMode,
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
    if (network.id === "mainnet") {
      process.stdout.write(`Owner profile: ${plan.ownerMode ?? "not configured or invalid"}\n`);
      process.stdout.write(`Configured Mainnet owner: ${plan.ownerAddress ?? "not configured or invalid"}\n`);
    }
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
    if (network.id === "mainnet") {
      if (!plan.ownerAddress || !plan.publicDeployer || !plan.ownerMode) {
        process.stderr.write("OWNER PREFLIGHT BLOCKED · configure a valid owner address and VEYRA_MAINNET_OWNER_MODE; no transaction was constructed.\n");
        return 2;
      }
      if (plan.ownerMode === "EOA_INACTIVE") {
        const ownerCheck = await verifyMainnetEoaOwner(
          plan.ownerAddress,
          plan.publicDeployer,
          process.env.VEYRA_MAINNET_ATTESTOR ?? "",
        );
        if (!ownerCheck.verified) {
          process.stderr.write(`EOA OWNER NOT VERIFIED · ${ownerCheck.reason} · no transaction was constructed.\n`);
          return 2;
        }
        process.stdout.write(
          `EOA OWNER ADDRESS VERIFIED · ${ownerCheck.ownerAddress} · no runtime code at current head; key control is not proven by read-only RPC.\n`,
        );
      } else {
        const ownerCheck = await verifyMainnetSafeOwner(
          plan.ownerAddress,
          plan.publicDeployer,
          process.env.VEYRA_MAINNET_ATTESTOR,
        );
        if (!ownerCheck.verified) {
          process.stderr.write(`SAFE OWNER NOT VERIFIED · ${ownerCheck.reason} · no transaction was constructed.\n`);
          return 2;
        }
        process.stdout.write(
          `SAFE OWNER VERIFIED · ${ownerCheck.ownerAddress} · Safe ${ownerCheck.version} · implementation ${ownerCheck.implementation} · factory ${ownerCheck.factory} · fallback ${ownerCheck.fallbackHandler}\n`,
        );
        process.stdout.write(`Signers: ${ownerCheck.signers.join(", ")}\n`);
        process.stdout.write(
          `SAFE CONTROL STATE · threshold 2/3 · modules ${ownerCheck.enabledModules.length} · guard ${ownerCheck.guard} · module guard ${ownerCheck.moduleGuard} · owners retain Safe transaction and configuration authority\n`,
        );
      }
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
