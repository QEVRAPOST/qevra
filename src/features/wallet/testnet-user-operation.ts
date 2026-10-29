import { AccountVersionRegistry, decodeCallsLA } from "@alchemy/smart-accounts";
import { decodeFunctionData, getAddress, isAddress } from "viem";
import type { Address, Hex } from "viem";
import { VEYRA_LIGHT_ACCOUNT, VEYRA_LIGHT_ACCOUNT_SALT, VEYRA_LIGHT_ACCOUNT_VERSION } from "@/features/wallet/smart-account";

export const ROBINHOOD_TESTNET_CHAIN_ID = 46_630;
export const MAX_TESTNET_SELF_CALL_COST_WEI = BigInt("1000000000000000"); // 0.001 testnet ETH

export type TestnetUserOperationMethod = "eth_estimateUserOperationGas" | "eth_sendUserOperation";

export interface TestnetUserOperationRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: TestnetUserOperationMethod;
  params: readonly unknown[];
}

export interface ValidatedTestnetSelfCall {
  sender: Address;
  owner: Address;
  userOperation: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asHex(value: unknown): Hex | undefined {
  return typeof value === "string" && /^0x(?:[0-9a-f]{2})*$/i.test(value) ? value as Hex : undefined;
}

function asBigInt(value: unknown): bigint | undefined {
  try {
    if (typeof value === "bigint") return value >= BigInt(0) ? value : undefined;
    if (typeof value === "string" && (/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value) || /^\d+$/.test(value))) {
      const result = BigInt(value);
      return result >= BigInt(0) ? result : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Validates one zero-value LightAccount call to its linked EOA before Testnet bundler estimation/submission. */
export function validateTestnetSelfCallRequest(input: {
  request: unknown;
  linkedOwner: string;
  expectedAccount: string;
  accountDeployed: boolean;
}): ValidatedTestnetSelfCall {
  const { request, linkedOwner, expectedAccount, accountDeployed } = input;
  if (!isRecord(request) || request.jsonrpc !== "2.0"
    || (typeof request.id !== "number" && typeof request.id !== "string")
    || (request.method !== "eth_estimateUserOperationGas" && request.method !== "eth_sendUserOperation")
    || !Array.isArray(request.params) || request.params.length !== 2) {
    throw new Error("user_operation_request_invalid");
  }
  if (!isAddress(linkedOwner) || !isAddress(expectedAccount)) throw new Error("wallet_identity_invalid");
  const owner = getAddress(linkedOwner);
  const sender = getAddress(expectedAccount);
  const [rawOperation, rawEntryPoint] = request.params;
  if (!isRecord(rawOperation) || typeof rawEntryPoint !== "string"
    || rawEntryPoint.toLowerCase() !== VEYRA_LIGHT_ACCOUNT.entryPoint.address.toLowerCase()
    || typeof rawOperation.sender !== "string" || !isAddress(rawOperation.sender)
    || rawOperation.sender.toLowerCase() !== sender.toLowerCase()) {
    throw new Error("user_operation_identity_mismatch");
  }
  const allowedFields = new Set([
    "sender", "nonce", "factory", "factoryData", "initCode", "callData", "callGasLimit",
    "verificationGasLimit", "preVerificationGas", "maxFeePerGas", "maxPriorityFeePerGas",
    "paymaster", "paymasterData", "paymasterVerificationGasLimit", "paymasterPostOpGasLimit",
    "paymasterAndData", "paymasterSignature", "signature",
  ]);
  if (Object.keys(rawOperation).some((key) => !allowedFields.has(key))) throw new Error("user_operation_field_not_allowed");

  const callData = asHex(rawOperation.callData);
  if (!callData) throw new Error("user_operation_calldata_invalid");
  let calls;
  try {
    calls = decodeCallsLA(callData, sender);
  } catch {
    throw new Error("user_operation_calldata_invalid");
  }
  if (calls.length !== 1 || calls[0].to.toLowerCase() !== owner.toLowerCase()
    || (calls[0].value ?? BigInt(0)) !== BigInt(0) || (calls[0].data ?? "0x") !== "0x") {
    throw new Error("testnet_self_call_only");
  }

  const factory = rawOperation.factory;
  const factoryData = asHex(rawOperation.factoryData);
  if (rawOperation.initCode !== undefined) {
    throw new Error("legacy_init_code_not_allowed");
  }
  if (rawOperation.paymasterAndData !== undefined && rawOperation.paymasterAndData !== "0x") {
    throw new Error("testnet_paymaster_not_allowed");
  }
  if (rawOperation.paymasterSignature !== undefined && rawOperation.paymasterSignature !== "0x") {
    throw new Error("testnet_paymaster_not_allowed");
  }
  if (accountDeployed) {
    if (factory !== undefined || rawOperation.factoryData !== undefined
      || rawOperation.initCode !== undefined) throw new Error("deployed_account_factory_data_unexpected");
  } else {
    if (typeof factory !== "string" || factory.toLowerCase() !== VEYRA_LIGHT_ACCOUNT.factoryAddress.toLowerCase()
      || !factoryData) throw new Error("counterfactual_factory_data_required");
    try {
      const decodedFactoryData = decodeFunctionData({
        abi: AccountVersionRegistry.LightAccount[VEYRA_LIGHT_ACCOUNT_VERSION].factoryAbi,
        data: factoryData,
      });
      if (decodedFactoryData.functionName !== "createAccount"
        || decodedFactoryData.args[0].toLowerCase() !== owner.toLowerCase()
        || decodedFactoryData.args[1] !== VEYRA_LIGHT_ACCOUNT_SALT) {
        throw new Error("counterfactual_factory_owner_mismatch");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "counterfactual_factory_owner_mismatch") throw error;
      throw new Error("counterfactual_factory_data_invalid");
    }
  }

  const zeroAddress = `0x${"0".repeat(40)}`;
  if (typeof rawOperation.paymaster === "string" && rawOperation.paymaster.toLowerCase() !== zeroAddress) {
    throw new Error("testnet_paymaster_not_allowed");
  }
  if (rawOperation.paymasterData !== undefined && rawOperation.paymasterData !== "0x") {
    throw new Error("testnet_paymaster_not_allowed");
  }
  for (const key of ["paymasterVerificationGasLimit", "paymasterPostOpGasLimit"] as const) {
    if (rawOperation[key] !== undefined && asBigInt(rawOperation[key]) !== BigInt(0)) {
      throw new Error("testnet_paymaster_not_allowed");
    }
  }
  if (request.method === "eth_sendUserOperation") {
    const signature = asHex(rawOperation.signature);
    if (!signature || signature.length <= 2) throw new Error("user_operation_signature_required");
  }

  return { sender, owner, userOperation: rawOperation };
}

/** Enforces the server-side maximum fee for the one permitted Testnet self-call. */
export function assertTestnetSelfCallFeeWithinLimit(input: {
  userOperation: Record<string, unknown>;
  gasEstimate?: Record<string, unknown>;
}): void {
  const gasFields = ["callGasLimit", "verificationGasLimit", "preVerificationGas"] as const;
  const gas = gasFields.map((field) => asBigInt(input.gasEstimate?.[field] ?? input.userOperation[field]));
  const maxFeePerGas = asBigInt(input.userOperation.maxFeePerGas);
  if (gas.some((value) => value === undefined) || maxFeePerGas === undefined) {
    throw new Error("user_operation_fee_unverifiable");
  }
  const maximumCost = gas.reduce<bigint>((total, value) => total + (value ?? BigInt(0)), BigInt(0)) * maxFeePerGas;
  if (maximumCost > MAX_TESTNET_SELF_CALL_COST_WEI) throw new Error("testnet_self_call_fee_limit_exceeded");
}
