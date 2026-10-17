import type { Metadata } from "next";
import { ActivityView } from "@/components/dashboard/ActivityView";

export const metadata: Metadata = { title: "Transaction activity" };

export default function Page() {
  return <ActivityView />;
}
