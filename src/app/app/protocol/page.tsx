import type { Metadata } from "next";
import { StatusView } from "@/components/dashboard/StatusView";

export const metadata: Metadata = { title: "Status and limits" };

export default function Page() {
  return <StatusView />;
}
