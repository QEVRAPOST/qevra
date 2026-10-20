import type { Metadata } from "next";
import { OverviewView } from "@/components/dashboard/OverviewView";

export const metadata: Metadata = { title: "Overview" };

/** The Launch App target. The app opens on the overview: what works today, and where to start. */
export default function AppIndex() {
  return <OverviewView />;
}
