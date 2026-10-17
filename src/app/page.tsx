import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: { absolute: "QEVRA · A wallet and simple swap on Robinhood Chain" },
};

export default function Page() {
  return <LandingPage />;
}
