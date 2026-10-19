import { NETWORKS } from "@/lib/config/networks";
import { readRobinhoodNetwork, RobinhoodRpcError } from "@/features/wallet/public-rpc";
import type { NetworkId } from "@/types/network";

const NO_STORE = { "cache-control": "no-store" };

function publicError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ networkId: string }> },
): Promise<Response> {
  const { networkId } = await context.params;
  if (!NETWORKS.some((network) => network.id === networkId && network.available)) {
    return publicError("network_not_available", "This network is not enabled for public reads.", 404);
  }

  try {
    const snapshot = await readRobinhoodNetwork(networkId as NetworkId);
    return Response.json(snapshot, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof RobinhoodRpcError) {
      const status = error.code === "rpc_timeout" || error.code === "rpc_unavailable" ? 503 : 502;
      return publicError(error.code, error.message, status);
    }
    return publicError("rpc_unavailable", "The public Robinhood RPC could not be reached.", 503);
  }
}
