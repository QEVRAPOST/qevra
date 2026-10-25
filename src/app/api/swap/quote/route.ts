import { createSwapQuoteHandler, getVerifiedMainnetTokenMetadata, verifyMainnetZeroXContracts } from "@/features/swap/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handleSwapQuote = createSwapQuoteHandler({
  appMode: process.env.QEVRA_APP_MODE,
  apiKey: process.env.ZEROX_API_KEY,
  fetch: globalThis.fetch,
  now: Date.now,
  getTokenMetadata: getVerifiedMainnetTokenMetadata,
  verifyContracts: verifyMainnetZeroXContracts,
  onDiagnostic: (diagnostic) => console.error(JSON.stringify(diagnostic)),
});

export const POST = handleSwapQuote;
