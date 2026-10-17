import type { Metadata } from "next";
import { SecurityView } from "@/components/dashboard/SecurityView";

export const metadata: Metadata = { title: "Security Swarm" };

export default function Page() {
  return <SecurityView />;
}
