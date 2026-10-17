"use client";

import Link from "next/link";
import { prefersReducedMotion } from "@/lib/aperture/motion";
import { scrollToFrame } from "@/lib/aperture/scroll";
import { CORE_SENTENCE } from "@/lib/content/copy-lock";
import { FRAME_SWARM, HERO, HERO_FACTS, type StoryStep } from "@/lib/content/landing";
import { StatusMaterial } from "@/components/ui/StatusMaterial";
import { LaunchLink } from "./LaunchLink";

/** Frame 0: the hero. It is never dimmed. */
export function HeroFrame() {
  return (
    <header className="frame hero" data-story-frame id="hero">
      <p className="eyebrow">{HERO.eyebrow}</p>
      <h1>{HERO.headline}</h1>
      <p className="lede">{HERO.lede}</p>
      <div className="ctas">
        <LaunchLink>Launch App</LaunchLink>
        <a
          className="btn ghost"
          href="#swarm"
          onClick={(e) => {
            e.preventDefault();
            scrollToFrame(FRAME_SWARM, prefersReducedMotion());
          }}
        >
          Explore Security
        </a>
      </div>
      <ul className="facts" aria-label="What QEVRA is">
        {HERO_FACTS.map((f) => (
          <li key={f.lead}>
            <StatusMaterial material={f.material} />
            <span>
              <b>{f.lead}.</b>
              {f.body}
            </span>
          </li>
        ))}
      </ul>
      <p className="core">
        <StatusMaterial material="outline" />
        <span>{CORE_SENTENCE}</span>
      </p>
    </header>
  );
}

/** Frames 1 to 6. The active frame is full opacity and the rest are dimmed. */
export function StepFrame({ step, active }: { step: StoryStep; active: boolean }) {
  return (
    <article className={active ? "frame step on" : "frame step"} data-story-frame id={step.id}>
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
        <ol className="path" aria-label="Three steps">
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
        <Link className="btn ghost small" href={step.cta.href}>
          {step.cta.label}
        </Link>
      ) : null}
      {step.launch ? <LaunchLink>Launch App</LaunchLink> : null}
    </article>
  );
}
