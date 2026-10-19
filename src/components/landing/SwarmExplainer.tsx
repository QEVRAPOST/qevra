"use client";

import { useEffect, useRef, useState } from "react";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { SWARM_PARAGRAPH_A, SWARM_PARAGRAPH_B } from "@/lib/content/copy-lock";
import { SWARM_CAN, SWARM_CANNOT, SWARM_CAN_FOCUS, SWARM_CANNOT_FOCUS, SWARM_DEFINITION } from "@/lib/content/landing";
import { brandizeProjectName, PROJECT_NAME } from "@/lib/project-brand";
import { SwarmDiagram } from "./SwarmDiagram";

const STEPS = [
  ...SWARM_CAN.map((text, i) => ({ text, focus: SWARM_CAN_FOCUS[i], group: "can" as const })),
  ...SWARM_CANNOT.map((text, i) => ({ text, focus: SWARM_CANNOT_FOCUS[i], group: "cannot" as const })),
];

/**
 * What the Swarm can and cannot do, as a pinned walkthrough: the diagram stays on screen while each line of the two
 * lists passes through the middle of the window, and the part of the diagram that line is about lights up.
 * Selecting a part by hand takes over until you scroll to the next line. With no JavaScript, or on a phone, the lists
 * and the diagram simply stack.
 */
export function SwarmExplainer() {
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
      },
      /* a band through the middle of the window: the line inside it is the one being read */
      { rootMargin: "-42% 0px -48% 0px", threshold: 0 },
    );
    el.querySelectorAll("[data-i]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  const focus = active >= 0 ? STEPS[active].focus : null;
  const item = (i: number) => {
    const s = STEPS[i];
    return (
      <li key={s.text} className={i === active ? "swstep on" : "swstep"} data-i={i}>
        <p className="swt">{s.text}</p>
        <p className="swref">{s.focus.ref}</p>
      </li>
    );
  };

  return (
    <div className="swgrid" ref={root}>
      <div className="swcopy">
        <div className="swintro" data-i={-1}>
          <h2 id="h-limits">What the Swarm can and cannot do</h2>
          <p className="sub swdef">{brandizeProjectName(SWARM_DEFINITION, PROJECT_NAME)}</p>
          <p className="sub">{brandizeProjectName(SWARM_PARAGRAPH_A, PROJECT_NAME)}</p>
          <p className="sub">{brandizeProjectName(SWARM_PARAGRAPH_B, PROJECT_NAME)}</p>
        </div>
        <h3 className="swgroup">
          <StatusMaterial material="outline" />
          It can
        </h3>
        <ul className="swlist">{SWARM_CAN.map((_, i) => item(i))}</ul>
        <h3 className="swgroup">
          <StatusMaterial material="solid" />
          It cannot
        </h3>
        <ul className="swlist">{SWARM_CANNOT.map((_, i) => item(SWARM_CAN.length + i))}</ul>
      </div>
      <div className="swfig">
        <SwarmDiagram focus={focus} focusKey={active} />
      </div>
    </div>
  );
}
