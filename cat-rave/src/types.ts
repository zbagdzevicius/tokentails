/**
 * Shared interfaces between the six lanes (SPEC.md "Module ownership"). Changing a signature here
 * is a cross-lane change: only the spec owner edits this file. Lanes implement these in their own
 * folders and may add private types there.
 */
import type { Camera, Object3D, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';

// =============================================================================================
// Common
// =============================================================================================

export type Quality = 'low' | 'mid' | 'high';

export interface QualityProfile {
  quality: Quality;
  /** devicePixelRatio is clamped to this. */
  dprCap: number;
  bloom: boolean;
  /** 'mirror': planar reflection pass; 'fake': reflected glow in the floor shader only. */
  reflections: 'mirror' | 'fake';
  /** Perf ceiling for dancing cats; beyond it the HUD shows "+N more". */
  maxCats: number;
  /** Cats closest to the camera drawn as full meshes; the rest as impostors. */
  nearCats: number;
  lasers: number;
  /** Haze sheet layers. */
  haze: number;
  /** Max live bow confetti particles. */
  confetti: number;
  targetFps: 30 | 60;
}

export type ShotId = 'hero' | 'top' | 'pov' | 'dj' | 'orbit' | 'sweep';

/** What every scene module receives once per frame, before render. */
export interface FrameContext {
  /** Seconds since the previous frame, clamped to 0.1. */
  dt: number;
  /** Seconds since boot (performance clock). */
  time: number;
  beat: BeatInfo;
  camera: PerspectiveCamera;
  profile: QualityProfile;
}

export interface SceneModule {
  update(frame: FrameContext): void;
  setQuality(profile: QualityProfile): void;
  dispose(): void;
}

// =============================================================================================
// L-AUDIO: music + the beat clock everyone syncs to
// =============================================================================================

export type Section = 'intro' | 'groove' | 'build' | 'drop' | 'breakdown';

export interface BeatInfo {
  bpm: number;
  /** Continuous beat count since the clock started (2.5 = halfway through the third beat). */
  beat: number;
  /** Whole bars since start. */
  bar: number;
  /** 0..3 */
  beatInBar: number;
  /** 0..1 position inside the current beat (0 = on the kick). */
  phase: number;
  section: Section;
  /** 0..1 through the current section. */
  sectionProgress: number;
  /** 0..1 musical intensity (low in breakdown, rising through build, 1 in drop). */
  energy: number;
  /** Kick envelope: 1 on each kick, decays to 0 within the beat. Drives pulses and paw glow. */
  kick: number;
  /** Hi-hat/offbeat envelope, same shape, on the off-beats. */
  hat: number;
  /** True while the viewer holds for a build-up. */
  held: boolean;
  /**
   * 0-based pass through the arrangement. Later loops change key and lead, alternate long and short
   * drops, and unlock new crowd moves (wave ripple, conga swirl). Optional for hand-made test beats.
   */
  loop?: number;
}

export type BeatEvent = 'beat' | 'bar' | 'section' | 'build' | 'drop';

export interface BeatEventPayload {
  beat: BeatInfo;
  /** 'drop' only: why it dropped. */
  cause?: 'arrangement' | 'viewer' | 'new-cat';
}

export interface BeatClock {
  readonly bpm: number;
  /**
   * Sample once per frame. Before audio is unlocked (or when muted) the clock still runs on the
   * performance clock so visuals always dance; after unlock it follows AudioContext.currentTime.
   */
  now(): BeatInfo;
  on(event: BeatEvent, cb: (payload: BeatEventPayload) => void): () => void;
  /** Call from a user gesture: creates/resumes the AudioContext and starts the synth. */
  unlock(): Promise<boolean>;
  readonly unlocked: boolean;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  /** Hold: jump into a build-up (riser, snare roll) that lasts while held, up to 8 bars. */
  beginBuild(): void;
  /** Release after a hold: drop on the next downbeat. */
  endBuild(): void;
  /** Force a drop on the next downbeat (double tap, new cat). Ignored if a drop started < 2 bars ago. */
  queueDrop(cause: 'viewer' | 'new-cat'): void;
  /** Per-frame bookkeeping (event dispatch). Called by main before modules update. */
  tick(): void;
  dispose(): void;
}

// =============================================================================================
// L-DATA: payouts → cats
// =============================================================================================

export interface ChainInfo {
  id: number;
  name: string;
  short: string;
  explorer: string;
}

/** Where a payout came from, derived from its memo (raw memos are never shown). */
export type PayoutSource =
  | 'treat' // free sponsored treat from the give page (tt:page / tt:treat)
  | 'heist' // treat from Catnip Heist (tt:heist)
  | 'wallet' // a fan's own wallet gift (tt:wallet)
  | 'adoption' // 50% share of a $5 shelter-cat purchase (tt:cat)
  | 'match' // sponsor match (tt:match)
  | 'paws' // paw settlement (tt:paws)
  | 'partner' // partner campaign (motored:…)
  | 'proof' // the first proof payout per chain
  | 'campaign'
  | 'rave' // a Moon Rave checkout ticket (tt:rave:<order>), paid in full by the keeper
  | 'gift';

export interface Payout {
  /** `${chainId}:${txHash}:${logIndex}`, unique. */
  id: string;
  chainId: number;
  chainName: string;
  txHash: string;
  logIndex: number;
  /** Unix seconds (block time). */
  timestamp: number;
  symbol: string;
  /** Amount in its own token, display text ("0.01"). */
  amountText: string;
  /** USD value in integer micro-USD (EURC converted at EURC_USD). */
  usdMicro: number;
  source: PayoutSource;
  explorerTxUrl: string;
  /**
   * The cat this payout fed: floor(running total before it / $1), set by the count rule. A payout
   * that crosses dollars also completes the cats after it. Unset before `buildSnapshot`.
   */
  fedCat?: number;
}

export interface RaveCat {
  /** 0-based; the HUD shows `#${index + 1}`. */
  index: number;
  /**
   * The payout whose running total crossed this cat's dollar (ordered by time, chainId, logIndex).
   * One $5 payout crosses five dollars, so five cats share it. null only for DEMO cats.
   */
  payout: Payout | null;
  /** Payouts that contributed to this dollar (a dollar of $0.01 treats has ~100). */
  contributors: number;
  /** Unix seconds when this dollar was completed. */
  completedAt: number;
  demo: boolean;
  /** Stable 0..1 seed for looks (fur shade, ear tilt, dance offset), from the payout id. */
  seed: number;
  /**
   * Flag the cat holds (ISO 3166-1 alpha-2). Set only on DEMO cats (a mixed sample so flags show
   * locally); real cats get their buyer's country from the rave orders (`crowd.setCountries`).
   */
  country?: string | null;
}

export interface PayoutSnapshot {
  /** ISO time the numbers are as of (index generatedAt, or the bundled snapshot's asOf). */
  asOf: string;
  origin: 'live' | 'snapshot';
  /** True when `?cats=N` overrides the count. Every surface must say DEMO. */
  demo: boolean;
  /** Real total, integer micro-USD (never includes demo cats). */
  totalUsdMicro: number;
  /** Real cats: floor(total USD). */
  realCats: number;
  /** Cats to show: realCats, or the demo override. */
  cats: number;
  /** 0..1 progress of the next real dollar. */
  progressToNext: number;
  /** Micro-USD still needed for the next cat. */
  microToNext: number;
  /** All real payouts, oldest first. */
  payouts: Payout[];
  /** One entry per shown cat (real first, then demo), index order. */
  catList: RaveCat[];
  byChain: { chainId: number; name: string; usdMicro: number; count: number }[];
  fx: { EURC: number; source: string };
  /** The index lags its chains (indexedThrough older than 15 min) or live fetch failed. */
  stale: boolean;
  /**
   * The most recent live read failed (network, HTTP error) or came back cut short: the numbers are
   * from `asOf`, the last good read, not live. Never set on the bundled snapshot.
   */
  fetchFailed?: boolean;
  /** Short names of the chains whose index is behind (live reads only), e.g. ['Base', 'Avalanche']. */
  delayedChains?: string[];
}

export interface PayoutDiff {
  newPayouts: Payout[];
  /** Cats that did not exist in the previous snapshot (drop these in from the sky). */
  newCats: RaveCat[];
}

export interface PayoutFeed {
  /** Bundled snapshot first (instant), then live; resolves with the best available. Never rejects. */
  load(): Promise<PayoutSnapshot>;
  readonly current: PayoutSnapshot | null;
  /** Called on every snapshot change after load (not for the first load). */
  subscribe(cb: (snapshot: PayoutSnapshot, diff: PayoutDiff) => void): () => void;
  startPolling(): void;
  stopPolling(): void;
  /** Re-fetch now (after the viewer sends a treat). */
  refresh(): Promise<PayoutSnapshot>;
  /** "#12", "12", a full tx hash or a ≥8-char tx prefix. */
  findCat(query: string): RaveCat | null;
  /**
   * All cats a tx hash produced (a $5 gift = 5 cats); a payout that crossed no dollar gives the one
   * completed cat it fed; empty if none (or its cat is still forming).
   */
  catsForTx(txHash: string): RaveCat[];
}

// =============================================================================================
// L-WORLD: scene, moon, floor, booth, lasers, haze, post
// =============================================================================================

export type LaserMode = 'idle' | 'sweep' | 'fan' | 'strobe';

export interface WorldApi extends SceneModule {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  /** Booth table top centre: the DJ and decks stand here. */
  readonly boothTop: Vector3;
  /** Moon centre (camera framing). */
  readonly moonCenter: Vector3;
  resize(width: number, height: number, dpr: number): void;
  /** Renders scene + post (bloom) with this camera. */
  render(camera: Camera): void;
  setLaserMode(mode: LaserMode): void;
  /** Full-scene light flash (drop, new cat). */
  flash(color: 'green' | 'pink' | 'violet' | 'white', strength?: number): void;
  /** A spotlight follows this point (DJ head, a found cat); null returns to the show. */
  setSpotTarget(target: Vector3 | null): void;
  /** PNG of the next rendered frame (share). */
  capture(): Promise<Blob>;
}

// =============================================================================================
// L-CROWD: instanced cats
// =============================================================================================

export type CrowdFormation = 'floor' | 'vortex';

export interface CrowdApi extends SceneModule {
  /** Upper bound for this quality (profile.maxCats). */
  readonly capacity: number;
  /**
   * Cats to show (already min(capacity)); cat i stands in slot i. Slots fill from the booth out,
   * front (+Z) first, so the first cats are always in the hero shot. Growing never moves old cats.
   */
  setCats(cats: readonly RaveCat[]): void;
  /**
   * Animate cat `index` falling from the sky into its slot (it is hidden until then). `delayS`
   * holds it hidden that long first (the camera cuts to the landing spot before it falls).
   */
  dropIn(index: number, delayS?: number): Promise<void>;
  /** Tap: everyone hops (staggered by distance from `origin` if given). */
  jump(strength?: number, origin?: Vector3): void;
  /** Paw pads flash hot pink. */
  pulsePaws(strength?: number): void;
  setFormation(formation: CrowdFormation): void;
  /** Nearest cat under the pointer (NDC −1..1), or null. CPU ray vs slot cylinders, no GPU readback. */
  pick(ndcX: number, ndcY: number, camera: Camera): number | null;
  /** World position of cat `index` (current animated slot), or null if not shown. */
  catPosition(index: number, out: Vector3): Vector3 | null;
  /**
   * Outline + glow cat `index` ("find my cat", hover), plus the next `count - 1` cats (one payout
   * can make several cats: a $5 gift lights up all five). null clears.
   */
  highlight(index: number | null, count?: number): void;
  /** Ghost markers for the next empty slots plus the half-formed next cat at `progress` (0..1). */
  setNextCat(progress: number): void;
  /**
   * Paid Moon Rave cats whose payout is not in the feed yet: pink holograms on the slots after the
   * next-cat hologram (at most ARRIVING_MAX drawn). Never part of the counter or `count`.
   */
  setArriving(n: number): void;
  /** Arriving holograms drawn right now. */
  readonly arrivingShown: number;
  /** Arriving hologram under the pointer (0-based, newest order first), or null. */
  pickArriving(ndcX: number, ndcY: number, camera: Camera): number | null;
  /** Floor position of arriving hologram `k`, or null. */
  arrivingPosition(k: number, out: Vector3): Vector3 | null;
  /** Crowd POV: 0..1 pushes cats out of a ~3 m cone in front of the camera (eased). */
  clearCone(amount: number): void;
  /** Slot radius in use (camera framing). */
  readonly extentRadius: number;
  /** Cats currently on the floor (camera framing: the top shot needs a crowd). */
  readonly count: number;
}

// =============================================================================================
// L-DJ: hero DJ cat, headphones, decks, sword, bow confetti
// =============================================================================================

export interface DjApi extends SceneModule {
  readonly root: Object3D;
  /** World position of the DJ's head (camera target). */
  headPosition(out: Vector3): Vector3;
  /** Sword up overhead for ~2 bars, then back to the decks. Auto on every 'drop' event. */
  raiseSword(): void;
  /** Pink bow confetti burst from the sky over the booth (count capped by profile.confetti). */
  confetti(amount?: number): void;
  /** Point at a world position (shout-out to a new cat) for ~1 bar. */
  pointAt(target: Vector3): void;
}

// =============================================================================================
// L-UI: camera director, HUD, input, share, wiring
// =============================================================================================

export interface Director {
  readonly camera: PerspectiveCamera;
  readonly shot: ShotId;
  /** Auto-director cycles shots on bar boundaries; any drag/orbit pauses it for 12 s. */
  setAuto(on: boolean): void;
  readonly auto: boolean;
  setShot(shot: ShotId, opts?: { cut?: boolean }): void;
  /** Fly to a cat and hold there until cleared (find my cat); `count` cats glow from `index` on. */
  focusCat(index: number | null, count?: number): void;
  /** Pointer drag (pixels) → orbit; pinch/wheel → dolly. */
  orbit(dx: number, dy: number): void;
  dolly(delta: number): void;
  resize(width: number, height: number): void;
  update(frame: FrameContext): void;
}

/** URL parameters (SPEC.md "URL parameters"), parsed once by L-UI. */
export interface RaveParams {
  /** DEMO override of the cat count. */
  cats: number | null;
  shot: ShotId | null;
  mute: boolean;
  /** Focus this cat at boot: "#12", "12" or a tx hash. */
  cat: string | null;
  quality: 'low' | 'mid' | 'high' | null;
  /** auto=0 turns the auto-director off. */
  auto: boolean;
  /** embed=1 hides the CTA chrome (iframe use). */
  embed: boolean;
  debug: boolean;
  /** Dev only: API base override (ignored on tokentails.com). */
  api: string | null;
}
