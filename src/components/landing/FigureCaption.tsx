"use client";

import { brandize, FRAME_CAPTIONS, HOVER_HINT, RING_DESCRIPTIONS } from "@/lib/content/landing";

interface FigureCaptionProps {
  /** active frame, 0 is the story intro */
  active: number;
  /** hovered ring index, or -1 */
  hoverRing: number;
  /** show the "move over a ring" hint only on devices that can hover */
  canHover: boolean;
  projectName: string;
}

function CaptionText({ active, hoverRing, canHover, projectName }: FigureCaptionProps) {
  if (hoverRing >= 0) {
    return (
      <>
        <b>Ring {hoverRing + 1} of 8.</b> {brandize(RING_DESCRIPTIONS[hoverRing]!, projectName)}
      </>
    );
  }
  const c = FRAME_CAPTIONS[active];
  return (
    <>
      <b>{brandize(c.lead, projectName)}</b> {brandize(c.text, projectName)}
      {active === 0 && canHover ? ` ${HOVER_HINT}` : ""}
    </>
  );
}

export function FigureCaption(props: FigureCaptionProps) {
  return (
    <figcaption className="pcap">
      <p className="cap" aria-live="polite">
        <CaptionText {...props} />
      </p>
    </figcaption>
  );
}
