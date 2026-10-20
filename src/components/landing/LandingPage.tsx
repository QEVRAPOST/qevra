import { StatusBar } from "@/components/ui/StatusBar";
import { getProjectName } from "@/lib/project-brand";
import { STATUS_BAR_ITEMS } from "@/lib/content/status";
import { StatusBand, SwarmLimitsBand } from "./LandingBands";
import { Curtain } from "./Curtain";
import { Splash } from "./Splash";
import { HeroStage } from "./HeroStage";
import { LandingNav } from "./LandingNav";
import { LandingStory } from "./LandingStory";
import { Pillars } from "./Pillars";

/**
 * The public landing page. Server shell; the hero, story, nav and Launch App links are client components.
 * `.landing` gives the whole page one shared side gutter (see landing.css) without adding a box of its own.
 */
export function LandingPage() {
  /* NEXT_PUBLIC_PROJECT_NAME, read here on the server: client components cannot read it from process.env by a dynamic lookup */
  const projectName = getProjectName();
  return (
    <div className="landing">
      <noscript>
        <style>{".splash{display:none}"}</style>
      </noscript>
      <Splash projectName={projectName} />
      <StatusBar items={STATUS_BAR_ITEMS} />
      <LandingNav projectName={projectName} />
      <main id="main" tabIndex={-1} className="curtain-main">
        <HeroStage projectName={projectName} />
        <Pillars projectName={projectName} />
        <LandingStory projectName={projectName} />
        <SwarmLimitsBand />
        <StatusBand projectName={projectName} />
      </main>
      <Curtain projectName={projectName} />
    </div>
  );
}
