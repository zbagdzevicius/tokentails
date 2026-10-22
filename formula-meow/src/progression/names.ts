/** Names a challenge shows for the ids it stores (F12: "Ride 3 loops on Kitchen Counter", "Take the crumb cut ..."). */
import { trackById } from '../core/track/tracks';
import { challengeById, type Challenge } from './challenges';

export const trackName = (id: string): string => trackById(id).name;

/** The alternative route's name on a circuit ("crumb cut"), or a plain "shortcut". */
export const cutName = (id: string): string => trackById(id).branches?.[0]?.label ?? 'shortcut';

/** A stored challenge id with its track and route names filled in. */
export function namedChallenge(id: string): Challenge | null {
  return challengeById(id, trackName, cutName);
}
