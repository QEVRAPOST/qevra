import { StatusBar } from "@/components/ui/StatusBar";
import { STATUS_BAR_ITEMS } from "@/lib/content/status";
import { LandingFooter, StatusBand, SwarmLimitsBand } from "./LandingBands";
import { HeroStage } from "./HeroStage";
import { LandingNav } from "./LandingNav";
import { LandingStory } from "./LandingStory";

/**
 * The public landing page. Server shell; the hero, story, nav and Launch App links are client components.
 * `.landing` gives the whole page one shared side gutter (see landing.css) without adding a box of its own.
 */
export function LandingPage() {
  return (
    <div className="landing">
      <StatusBar items={STATUS_BAR_ITEMS} />
      <LandingNav />
      <main id="main" tabIndex={-1}>
        <HeroStage />
        <LandingStory />
        <SwarmLimitsBand />
        <StatusBand />
      </main>
      <LandingFooter />
    </div>
  );
}
