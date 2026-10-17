import { StatusBar } from "@/components/ui/StatusBar";
import { STATUS_BAR_ITEMS } from "@/lib/content/status";
import { LandingFooter, StatusBand, SwarmLimitsBand } from "./LandingBands";
import { LandingNav } from "./LandingNav";
import { LandingStory } from "./LandingStory";

/** The public landing page. Server shell; the story, nav and Launch App links are client components. */
export function LandingPage() {
  return (
    <>
      <StatusBar items={STATUS_BAR_ITEMS} />
      <LandingNav />
      <main id="main" tabIndex={-1}>
        <LandingStory />
        <SwarmLimitsBand />
        <StatusBand />
      </main>
      <LandingFooter />
    </>
  );
}
