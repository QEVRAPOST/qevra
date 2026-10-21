import type { Metadata } from "next";
import { NetworksView } from "@/components/dashboard/NetworksView";
import { loadVerifiedVeyraDeployments } from "@/lib/config/load-veyra-deployments";

export const metadata: Metadata = { title: "Networks and Contracts" };

export default function Page() {
  return <NetworksView deploymentRecords={loadVerifiedVeyraDeployments()} />;
}
