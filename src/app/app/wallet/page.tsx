import type { Metadata } from "next";
import { WalletView } from "@/components/dashboard/WalletView";

export const metadata: Metadata = { title: "Wallet and PQ Vault" };

export default function Page() {
  return <WalletView />;
}
