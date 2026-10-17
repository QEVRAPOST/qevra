import type { SwapButtonKey } from "./swap";
import type { SetupStage } from "./wallet";

/** Which Security Swarm fixtures the preview shows. */
export type RunsMode = "examples" | "more" | "empty" | "unavailable";

/** Which Activity fixtures the preview shows. */
export type ActsMode = "examples" | "empty" | "unavailable";

/**
 * Preview controls exist only in demo mode, so every state can be reviewed and screenshot-tested.
 * A real provider does not supply them.
 */
export interface PreviewControls {
  stage: SetupStage;
  forced: SwapButtonKey | null;
  runsMode: RunsMode;
  actsMode: ActsMode;
  setStage(stage: SetupStage): void;
  setForced(key: SwapButtonKey | null): void;
  setRunsMode(mode: RunsMode): void;
  setActsMode(mode: ActsMode): void;
  reset(): void;
}
