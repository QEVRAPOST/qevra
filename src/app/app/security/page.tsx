import type { Metadata } from "next";
import { Suspense } from "react";
import { SecurityView } from "@/components/dashboard/SecurityView";

export const metadata: Metadata = { title: "Security Swarm" };

export default function Page() {
  /* the view reads ?run= (a link from the overview or from Activity), which needs a Suspense boundary */
  return (
    <Suspense fallback={null}>
      <SecurityView />
    </Suspense>
  );
}
