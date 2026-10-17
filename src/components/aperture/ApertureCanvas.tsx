"use client";

import { useEffect, useRef } from "react";
import { ApertureScene } from "@/lib/aperture/engine";
import type { ApertureMode, ApertureState } from "@/lib/aperture/types";

interface ApertureCanvasProps {
  mode: ApertureMode;
  /** Starting pose. Pass a module-level constant: a new object would rebuild the scene. */
  initial: ApertureState;
  rate?: number;
  fitExplode?: number;
  labels?: boolean;
  /** Pointer parallax and ring hover on this canvas. Touch pointers never drive either. */
  pointer?: boolean;
  /** Accessible name. The engraved text on the rings is decorative; describe the figure here. */
  label: string;
  describedBy?: string;
  /** Receives the live scene after mount and null on unmount. Pass a stable function (a state setter). */
  onSceneChange?: (scene: ApertureScene | null) => void;
  /** Hovered ring index (0..7), or -1. Pass a stable function. */
  onHoverChange?: (ringIndex: number) => void;
}

/**
 * Client-only Canvas 2D view of the Aperture ring stack.
 * The scene is created in an effect and disposed on unmount: no observer, listener or frame outlives it.
 * Scroll and app state drive it through scene.set(), never through React state.
 */
export function ApertureCanvas({
  mode,
  initial,
  rate,
  fitExplode,
  labels,
  pointer = false,
  label,
  describedBy,
  onSceneChange,
  onHoverChange,
}: ApertureCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const scene = new ApertureScene(canvas, { mode, rate, fitExplode, labels, onHoverChange }, initial);
    if (pointer) scene.bindPointer(canvas);
    scene.render();
    onSceneChange?.(scene);
    return () => {
      onSceneChange?.(null);
      scene.dispose();
    };
  }, [mode, initial, rate, fitExplode, labels, pointer, onSceneChange, onHoverChange]);

  return <canvas ref={ref} role="img" aria-label={label} aria-describedby={describedBy} />;
}
