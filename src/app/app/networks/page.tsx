import type { Metadata } from "next";
import { NetworksView } from "@/components/dashboard/NetworksView";

export const metadata: Metadata = { title: "Networks and Contracts" };

export default function Page() {
  return <NetworksView />;
}
