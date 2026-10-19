"use client";

import { buttonVariants } from "@/components/ui/Button";
import Link from "next/link";
import type { StoryStep } from "@/lib/content/landing";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { LaunchLink } from "./LaunchLink";

/** The story frames: the intro (frame 0) and the steps (frames 1 to 7). The active frame is full opacity and the rest are dimmed. */
export function StepFrame({ step, active }: { step: StoryStep; active: boolean }) {
  return (
    <article className={["frame", "step", active ? "on" : "", step.long ? "long" : ""].filter(Boolean).join(" ")} data-story-frame id={step.id}>
      {step.kicker ? <p className="kicker">{step.kicker}</p> : null}
      <h2>{step.title}</h2>
      {step.core ? <p className="corep">{step.core}</p> : null}
      <p>{step.body}</p>
      {step.note ? (
        <p className="note">
          <StatusMaterial material="outline" />
          <span>{step.note}</span>
        </p>
      ) : null}
      {step.path ? (
        <ol className="path" aria-label={step.path.length === 2 ? "The two accounts" : "Three steps"}>
          {step.path.map((p) => (
            <li key={p.lead}>
              <StatusMaterial material={p.material} />
              <b>{p.lead}</b>
              <span className="d">{p.detail}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {step.cta ? (
        <Link className={buttonVariants({ variant: "ghost", size: "small" })} href={step.cta.href}>
          {step.cta.label}
        </Link>
      ) : null}
      {step.launch ? <LaunchLink>Launch App</LaunchLink> : null}
    </article>
  );
}
