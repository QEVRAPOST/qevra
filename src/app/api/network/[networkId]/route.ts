import { NETWORKS } from "@/lib/config/networks";
import { readRobinhoodMainnetInfrastructure, readRobinhoodNetwork, readRobinhoodPublicAddress, RobinhoodRpcError } from "@/features/wallet/public-rpc";
import type { NetworkId } from "@/types/network";

const NO_STORE = { "cache-control": "no-store" };

function publicError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ networkId: string }> },
): Promise<Response> {
  const { networkId } = await context.params;
  if (!NETWORKS.some((network) => network.id === networkId && network.available)) {
    return publicError("network_not_available", "This network is not enabled for public reads.", 404);
  }

  const searchParams = new URL(request.url).searchParams;
  const addresses = searchParams.getAll("address");
  const infrastructure = searchParams.getAll("infrastructure");
  if (addresses.length > 1) {
    return publicError("invalid_address", "Provide exactly one EVM address to inspect.", 400);
  }
  const address = addresses[0];
  if (infrastructure.length > 1
    || (infrastructure.length > 0 && (infrastructure[0] !== "1" || address !== undefined))) {
    return publicError("invalid_request", "Provide one supported public network read.", 400);
  }
  if (infrastructure.length > 0 && networkId !== "mainnet") {
    return publicError("network_not_available", "Configured external infrastructure reads are available on Robinhood Mainnet only.", 400);
  }

  try {
    const snapshot = infrastructure.length > 0
      ? await readRobinhoodMainnetInfrastructure()
      : address === undefined
        ? await readRobinhoodNetwork(networkId as NetworkId)
        : await readRobinhoodPublicAddress(networkId as NetworkId, address);
    return Response.json(snapshot, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof RobinhoodRpcError) {
      if (error.code === "invalid_address") return publicError(error.code, error.message, 400);
      const status = error.code === "rpc_timeout" || error.code === "rpc_unavailable" ? 503 : 502;
      return publicError(error.code, error.message, status);
    }
    return publicError("rpc_unavailable", "The public Robinhood RPC could not be reached.", 503);
  }
}
