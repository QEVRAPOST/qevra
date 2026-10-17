"use client";

import { FRAME_CAPTIONS, HOVER_HINT, RING_DESCRIPTIONS, STORY_STEPS, TRY_CAPTIONS, TRY_GROUP_LABEL, TRY_LABEL, TRY_OPTIONS } from "@/lib/content/landing";
import { ToggleGroup } from "@/components/ui/ToggleGroup";

interface FigureCaptionProps {
  /** active frame, 0 is the hero */
  active: number;
  /** Try it state: null before it is used, otherwise 0 (as reviewed) or 1 (amount changed) */
  tryValue: 0 | 1 | null;
  /** hovered ring index, or -1 */
  hoverRing: number;
  /** show the "move over a ring" hint only on devices that can hover */
  canHover: boolean;
  onTry: (value: 0 | 1) => void;
}

function CaptionText({ active, tryValue, hoverRing, canHover }: Omit<FigureCaptionProps, "onTry">) {
  if (hoverRing >= 0) {
    return (
      <>
        <b>Ring {hoverRing + 1} of 8.</b> {RING_DESCRIPTIONS[hoverRing]}
      </>
    );
  }
  if (active === 0) {
    if (tryValue == null) {
      return (
        <>
          <b>Figure.</b> {FRAME_CAPTIONS[0]}
          {canHover ? ` ${HOVER_HINT}` : ""}
        </>
      );
    }
    const t = TRY_CAPTIONS[tryValue];
    return (
      <>
        <b>Figure.</b> <b>{t.lead}</b> {t.body}
      </>
    );
  }
  return (
    <>
      <b>
        Step {active} of {STORY_STEPS.length}.
      </b>{" "}
      {FRAME_CAPTIONS[active]}
    </>
  );
}

export function FigureCaption({ active, tryValue, hoverRing, canHover, onTry }: FigureCaptionProps) {
  const showTry = active === 0;
  return (
    <figcaption className="pcap">
      <p className="cap" aria-live="polite">
        <CaptionText active={active} tryValue={tryValue} hoverRing={hoverRing} canHover={canHover} />
      </p>
      {/* inert while hidden, so keyboard focus never lands on an invisible control */}
      <div className={showTry ? "tryit" : "tryit off"} inert={!showTry}>
        <span>{TRY_LABEL}</span>
        <ToggleGroup
          label={TRY_GROUP_LABEL}
          options={[
            { value: 0, label: TRY_OPTIONS[0] },
            { value: 1, label: TRY_OPTIONS[1] },
          ]}
          value={tryValue ?? 0}
          onChange={onTry}
        />
      </div>
    </figcaption>
  );
}
