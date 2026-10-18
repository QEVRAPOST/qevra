import type { ApertureScene } from "./engine";

/**
 * The landing hero scene, registered while it is mounted. The Launch App transition reads its current pose so
 * the sculpture it draws starts exactly where the landing left it.
 */
let hero: ApertureScene | null = null;

export function registerHeroScene(scene: ApertureScene | null): void {
  hero = scene;
}

export function getHeroScene(): ApertureScene | null {
  return hero;
}
