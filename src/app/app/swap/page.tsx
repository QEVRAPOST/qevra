import type { Metadata } from "next";
import { SwapView } from "@/components/dashboard/SwapView";

export const metadata: Metadata = { title: "Simple swap" };

export default function Page() {
  return <SwapView />;
}
