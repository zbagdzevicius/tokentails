/**
 * A standalone hero for the lobby turntable, the results screen and the portraits. Its own module (gaps5, first-load
 * JS): the lobby needs only this, not the match's HeroView.
 */
import type * as THREE from 'three';
import type { HeroId } from '../../sim/api';
import type { Look } from '../cosmetics';
import { DETAIL, makeHero, type Character } from '../chars';

export interface LobbyHero {
  /** Place and turn this (it faces +X at rotation.y 0, like the match models). */
  object: THREE.Group;
  /** The character (animator, mesh) for idle life and the hop. */
  ch: Character;
  dispose(): void;
}

/** A standalone hero for the lobby turntable, the results screen and the portraits (full detail, outlined). */
export function lobbyHero(hero: HeroId, team: 0 | 1 = 0, look?: Look | null, o: { outline?: boolean } = {}): LobbyHero {
  const ch = makeHero(hero, team, look ?? null, { detail: DETAIL.lobby, outline: o.outline ?? true, shadows: true });
  return { object: ch.object, ch, dispose: () => ch.dispose() };
}
