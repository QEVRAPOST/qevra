import { getAddress, isAddress, type Address } from "viem";
import { NETWORKS } from "./networks";

export type VeyraTokenConfig = {
  address: Address;
  network: (typeof NETWORKS)[number];
};

/** Accept only a real EVM address paired with one of VEYRA's supported Robinhood chain IDs. */
export function parseVeyraTokenConfig(addressValue?: string | null, chainIdValue?: string | null): VeyraTokenConfig | null {
  const addressText = addressValue?.trim();
  const chainIdText = chainIdValue?.trim();
  if (!addressText || !chainIdText || !isAddress(addressText, { strict: false })) return null;

  const network = NETWORKS.find((candidate) => String(candidate.chainId) === chainIdText);
  if (!network) return null;

  try {
    const address = getAddress(addressText);
    if (/^0x0{40}$/i.test(address)) return null;
    return { address, network };
  } catch {
    return null;
  }
}

/** Direct env references allow Next.js to expose only these optional public configuration values. */
export function getVeyraTokenConfig(): VeyraTokenConfig | null {
  return parseVeyraTokenConfig(
    process.env.NEXT_PUBLIC_VEYRA_TOKEN_CA,
    process.env.NEXT_PUBLIC_VEYRA_TOKEN_CHAIN_ID,
  );
}
