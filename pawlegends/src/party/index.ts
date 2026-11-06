/**
 * Party play client entry (docs/plans/moba/MULTIPLAYER.md §5, §8). LAZY: app.ts imports this chunk only when the
 * player taps "Play with friends" or "Join with code", opens a `?party=` link, or reloads with a party seat, so it
 * never counts toward first load.
 */
import './party.css';

export { PartyClient, openParty, reduceParty, screenOf, initialParty, type PartyHooks, type OpenMode, type PartyState } from './partyClient';
