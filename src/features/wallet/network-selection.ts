import type { NetworkId, NetworkRpcState } from "@/types/network";

export interface NetworkSelectionState {
  networkId: NetworkId;
  /** Monotonically increases for both network switches and explicit refreshes. */
  requestId: number;
  rpc: NetworkRpcState;
}

export type NetworkSelectionAction =
  | { type: "select"; networkId: NetworkId }
  | { type: "refresh" }
  | { type: "resolved"; networkId: NetworkId; requestId: number; rpc: NetworkRpcState };

export function createNetworkSelectionState(
  networkId: NetworkId,
  initialRpc: NetworkRpcState = { status: "loading" },
): NetworkSelectionState {
  return { networkId, requestId: 0, rpc: initialRpc };
}

export function networkSelectionReducer(
  state: NetworkSelectionState,
  action: NetworkSelectionAction,
): NetworkSelectionState {
  if (action.type === "select") {
    return {
      networkId: action.networkId,
      requestId: state.requestId + 1,
      rpc: { status: "loading" },
    };
  }

  if (action.type === "refresh") {
    return { ...state, requestId: state.requestId + 1, rpc: { status: "loading" } };
  }

  if (action.networkId !== state.networkId || action.requestId !== state.requestId) {
    return state;
  }

  return { ...state, rpc: action.rpc };
}
