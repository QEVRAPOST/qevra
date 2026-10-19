import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { PROJECT_NAME } from "@/lib/project-brand";

export const metadata: Metadata = {
  title: { absolute: `${PROJECT_NAME} · A wallet and simple swap on Robinhood Chain` },
};

export default function Page() {
  return <LandingPage />;
}
