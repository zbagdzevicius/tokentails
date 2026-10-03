/**
 * Which music plays where (plan G14 "Audio").
 *
 * The commissioned looping night theme is deferred (artist brief). Until it lands the lobby loops
 * the best track already in `client/public/music`, a 2:20 acoustic loop. Drop the artist file in
 * and change `LOBBY_MUSIC_TRACK` only; nothing else refers to the file.
 */
import { GameType } from "@/models/game";

/** The lobby's looping theme. The single place to swap in the commissioned night theme. */
export const LOBBY_MUSIC_TRACK = encodeURI("/music/Adam Dib - Over the River Through the Woods.mp3");

const CDN_MUSIC = "https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/music";
const DEFAULT_GAME_TRACK = `${CDN_MUSIC}/music.mp3`;
/** Purrsuit picks one of its in-game songs per level. */
export const PURRSUIT_SONG_COUNT = 45;

/**
 * Per mode. `null` is silence from the shell: the Catnip Heist runs in its own iframe with its own
 * audio (`catnip-heist/src/audio`), so the shell must not play over it. Retired types are listed
 * because `GameType` is shared with the backend.
 */
const GAME_TRACKS: Record<GameType, string | null> = {
  [GameType.SHELTER]: DEFAULT_GAME_TRACK,
  [GameType.CATNIP_CHAOS]: DEFAULT_GAME_TRACK,
  [GameType.HOME]: DEFAULT_GAME_TRACK,
  [GameType.PIXEL_RESCUE]: DEFAULT_GAME_TRACK,
  [GameType.MATCH_3]: DEFAULT_GAME_TRACK,
  [GameType.PURRQUEST]: DEFAULT_GAME_TRACK,
  [GameType.CATBASSADORS]: DEFAULT_GAME_TRACK,
  [GameType.CATNIP_HEIST]: null,
};

/**
 * The track for the current screen: the lobby theme with no mode open, a random Purrsuit song
 * (`random` returns 0..1, injectable for tests), otherwise the mode's track.
 */
export function trackFor(gameType: GameType | null | undefined, random: () => number = Math.random): string | null {
  if (!gameType) return LOBBY_MUSIC_TRACK;
  if (gameType === GameType.CATNIP_CHAOS) {
    const index = Math.min(PURRSUIT_SONG_COUNT - 1, Math.floor(random() * PURRSUIT_SONG_COUNT));
    return `${CDN_MUSIC}/in-game/song${index + 1}.mp3`;
  }
  return GAME_TRACKS[gameType] ?? null;
}
