import { GameEvents } from "@/components/Phaser/events";
import { fitCssCamera } from "@/components/Phaser/look/camera";
import {
  LOOK_RESIZE,
  type LookResizeEvent,
} from "@/components/Phaser/look/makeGameConfig";
import { getCanvasPixelRatio } from "@/components/Phaser/look/registry";
import {
  preloadTTFonts,
  refreshTTResolution,
  ttFit,
  ttText,
  TT_FONTS_HEALED,
  type HealableText,
  type TTFitSegment,
  type TTFitTarget,
} from "@/components/Phaser/typography";
import { GOLD } from "@/design/tokens";
import { Scene } from "phaser";
import { GLOVE_TEXTURE_KEY, GLOVE_TEXTURE_URL } from "../glove";
import { computeMatch3Layout, type HudKey, type Insets, type Match3Layout } from "../hudLayout";
import { lastChanceGrant, shouldStartClock } from "../match3Rules";
import { announce, MATCH3_GAME_ID, signalSceneReady } from "../sceneSignals";
import {
  GLOVE_DEPTH,
  GLOVE_GHOSTS,
  GLOVE_SIZE,
  gloveTrack,
  initialInputKind,
  plateTextBox,
  prefersReducedMotion,
  tutorialMessage,
  tutorialPlateRect,
  WRONG_STROKE_MS,
  type InputKind,
} from "../tutorial";
import {
  MATCH3_ARENA_BG,
  MATCH3_LEVEL_BY_ID,
  MATCH3_LEVELS,
  MATCH3_CATNIP_ICONS,
  MATCH3_CATNIP_ICON_SIZES,
  type Match3CatnipIconSize,
  MATCH3_TILE_ASSETS,
  Match3LevelId,
  Match3TileType,
  getMatch3RunTime,
} from "../match3.config";

export interface IMatch3Props {
  level: Match3LevelId;
  bestScore?: number;
  /** PLAY AGAIN on this level (from GameContext); sent with RUN_READY and RUN_BEGIN. */
  isRestart?: boolean;
  /** The player has cleared this level (server `match3Cleared`). Uncleared level 1 gets the grace. */
  levelCleared?: boolean;
  /**
   * Safe-area insets in CSS px. The scene reads the live values from the canvas
   * (`--tt-safe-*`, set by Match3.tsx) on every layout; these are the fallback, so the tutorial
   * plate is clamped above the safe-area bottom even where the custom properties are missing.
   */
  safeArea?: Partial<Insets>;
  /** CSS px the header keeps free on its right for the X. Read live from the canvas otherwise. */
  headerReserveRight?: number;
}

/** Custom properties Match3.tsx sets on the play wrapper (registered `<length>`s, so they compute to px). */
export const MATCH3_HEADER_RESERVE_PROPERTY = "--tt-header-reserve-right";
export const MATCH3_SAFE_AREA_PROPERTIES = {
  top: "--tt-safe-top",
  right: "--tt-safe-right",
  bottom: "--tt-safe-bottom",
  left: "--tt-safe-left",
} as const;

type TilePower = "ROW" | "COL" | "BOMB" | "RAINBOW";

interface ICellPos {
  row: number;
  col: number;
}

interface IMatchLine {
  cells: ICellPos[];
  orientation: "row" | "col";
}

interface IMatchInfo {
  keys: Set<string>;
  lines: IMatchLine[];
}

interface ISpecialCreation {
  pos: ICellPos;
  power: TilePower;
}

type BonusMissionId = "CHAIN_2" | "MATCH_4" | "SPECIAL_TRIGGER" | "OBJECTIVE_HUNT";

interface IPossibleMove {
  from: ICellPos;
  to: ICellPos;
  impact: number;
}

interface IMatch3Cell {
  id: number;
  type: Match3TileType;
  power?: TilePower;
  row: number;
  col: number;
  baseScaleX: number;
  baseScaleY: number;
  field?: Phaser.GameObjects.Rectangle;
  sprite: Phaser.GameObjects.Image;
  /**
   * The special-tile badge: a texture arrow (plan G14) in a container, so tweens keep working in
   * CSS-px scale 1 while the texture is drawn at the canvas pixel ratio. No font (plan G12).
   */
  marker?: Phaser.GameObjects.Container;
}

type Board = Array<Array<IMatch3Cell | null>>;

type TypeBoard = Match3TileType[][];

interface ISwapIntent {
  from: ICellPos;
  to: ICellPos;
}

const BOARD_ROWS = 8;
const BOARD_COLS = 8;
/** The 16 px catnip master for the objective icon (plan G8: integer sizes only). */
/** One texture per objective icon size (16, 24, 32 CSS px), each drawn 1:1 (plan G8). */
const catnipIconKey = (size: Match3CatnipIconSize) => `match3-catnip-icon-${size}`;
const BASE_MATCH_SCORE = 12;
const COMBO_BONUS_STEP = 6;
const SPECIAL_HIT_BONUS = 10;
const SPECIAL_CREATE_BONUS = 20;
const SWAP_MS = 130;
const INVALID_SWAP_PAUSE_MS = 110;
const CLEAR_MS = 170;
const DROP_MS = 180;
const CLEAR_PAUSE_MS = 70;
const SWIPE_THRESHOLD = 16;
const MAX_RESHUFFLES_FALLBACK = 2;
const HINT_IDLE_MS = 3800;
const HINT_REPEAT_MS = 5200;
const FEVER_SECONDS_THRESHOLD = 15;
const FEVER_MULTIPLIER = 2;
const TUTORIAL_STORAGE_KEY = "tokentails-match3-ftue-v1";
const STAR_PROGRESS_THRESHOLDS = [0.4, 0.75, 1];
const AMBIENT_SPARK_DELAY_MS = 820;
const SWAP_SQUISH_FACTOR = 1.14;
const SWAP_SQUASH_FACTOR = 0.86;
const DROP_STRETCH_FACTOR = 1.16;
const DROP_SQUASH_FACTOR = 0.88;
const LAND_BOUNCE_FACTOR = 1.07;
const MATCH3_RETENTION_KEY = "tokentails-match3-retention-v1";
const ASSIST_IDLE_MS = 9800;
const ASSIST_COOLDOWN_MS = 12000;
const ASSIST_MAX_DROPS = 2;
const BONUS_MISSION_LIMIT = 3;
const BONUS_MISSION_REWARD_SCORE = 55;
const BONUS_MISSION_REWARD_SECONDS = 2;
const BACKDROP_TWINKLE_STARS = 84;
const LEVEL_GOAL_NUDGE_MS = 2200;
const SWAP_QUEUE_MAX = 6;
const THUNDER_COOLDOWN_MS = 420;
const SFX_MASTER_VOLUME = 0.22;
const UI_GOLD = 0xf9d27d;
const UI_GOLD_DARK = 0x7b4a1b;
const UI_NAVY = 0x19163a;
const UI_PLUM = 0x2d1f57;
const UI_CREAM = 0xfef3c7;

const BG_KEY = "match3-bg";
const SPARK_KEY = "match3-spark";

const TILE_KEY_BY_TYPE: Record<Match3TileType, string> = MATCH3_TILE_ASSETS.reduce(
  (acc, tile) => {
    acc[tile.type] = `match3-tile-${tile.type.toLowerCase()}`;
    return acc;
  },
  {} as Record<Match3TileType, string>,
);

const TILE_TYPES = MATCH3_TILE_ASSETS.map((tile) => tile.type) as Match3TileType[];

const TILE_LABEL_BY_TYPE: Record<Match3TileType, string> = MATCH3_TILE_ASSETS.reduce(
  (acc, tile) => {
    acc[tile.type] = tile.label.toUpperCase();
    return acc;
  },
  {} as Record<Match3TileType, string>,
);

interface IRetentionState {
  lastPlayedDate: string;
  dayStreak: number;
  totalRuns: number;
  completedRuns: number;
  winStreak: number;
}

interface IBonusMission {
  id: BonusMissionId;
  label: string;
  target: number;
  progress: number;
  rewardScore: number;
  rewardSeconds: number;
}

type SparkPalette = "warm" | "electric" | "violet";

interface ISparkOptions {
  palette?: SparkPalette;
  spreadMultiplier?: number;
  durationMin?: number;
  durationMax?: number;
  depth?: number;
}

type Match3SfxEvent =
  | "tap"
  | "queue"
  | "swap"
  | "invalid"
  | "match"
  | "combo"
  | "specialSpawn"
  | "specialSwap"
  | "drop"
  | "reshuffle"
  | "thunder"
  | "objective"
  | "star"
  | "fever"
  | "countdown"
  | "timeUp"
  | "win"
  | "lose";

let tileIdCounter = 0;

const nextTileId = () => {
  tileIdCounter += 1;
  return tileIdCounter;
};

const getPosKey = (row: number, col: number) => `${row}:${col}`;

const parsePosKey = (key: string): ICellPos => {
  const [rowValue, colValue] = key.split(":");
  return {
    row: Number(rowValue),
    col: Number(colValue),
  };
};

const isSamePos = (a: ICellPos, b: ICellPos) => a.row === b.row && a.col === b.col;

const isAdjacent = (a: ICellPos, b: ICellPos) => {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
};

const cloneTypeBoard = (board: TypeBoard): TypeBoard => {
  return board.map((row) => row.slice());
};

export class Match3Scene extends Scene {
  private props!: IMatch3Props;
  private level = MATCH3_LEVELS[0];
  private allowedTypes: Match3TileType[] = TILE_TYPES;
  private objectiveType: Match3TileType = "CATNIP";
  private objectiveTarget = 0;
  private objectiveCollected = 0;
  private objectiveRewardClaimed = false;
  private starThresholdScores: number[] = [];
  private starsEarned = 0;
  private feverActive = false;
  private levelBestScore = 0;
  private lastChanceUsed = false;
  private tutorialActive = false;
  private tutorialMove: IPossibleMove | null = null;
  private lastPlayerActionAt = 0;
  private nextHintAt = 0;
  private lastAssistAt = 0;
  private assistDropsUsed = 0;
  private hintMove: IPossibleMove | null = null;
  private hintTweens: Phaser.Tweens.Tween[] = [];
  private retentionState: IRetentionState | null = null;
  private streakBonusSeconds = 0;
  private bonusMission: IBonusMission | null = null;
  private completedMissionIds = new Set<BonusMissionId>();
  private renderGameToTextHook?: () => string;
  private advanceTimeHook?: (ms: number) => void;
  private testAdvanceCarryMs = 0;
  private nextThunderAt = 0;

  private board: Board = [];
  private boardStartX = 0;
  private boardStartY = 0;
  private tileSize = 58;
  private tileIconSize = 42;
  private markerOffset = 14;
  private compactHud = false;
  private wideHud = false;
  private smallLandscapeHud = false;
  private layout!: Match3Layout;
  private hudTexts = new Map<HudKey, Phaser.GameObjects.Text>();
  private boardWidth = 0;
  private boardHeight = 0;

  private score = 0;
  private moves = 0;
  private timeLeft = 0;
  /** Seconds actually played this run. Bonus seconds never change it. */
  private elapsedSeconds = 0;
  private reshuffleFallbacks = MAX_RESHUFFLES_FALLBACK;

  private busy = false;
  private ended = false;
  private swapQueue: ISwapIntent[] = [];
  private drainingSwapQueue = false;

  private dragStartCell: ICellPos | null = null;
  private dragStartPoint: { x: number; y: number } | null = null;
  private selectedCell: ICellPos | null = null;

  private timerEvent?: Phaser.Time.TimerEvent;
  private cleanupFns: Array<() => void> = [];

  private titleText?: Phaser.GameObjects.Text;
  private timerText?: Phaser.GameObjects.Text;
  private scoreText?: Phaser.GameObjects.Text;
  private bestScoreText?: Phaser.GameObjects.Text;
  private targetText?: Phaser.GameObjects.Text;
  private movesText?: Phaser.GameObjects.Text;
  private comboText?: Phaser.GameObjects.Text;
  private objectiveText?: Phaser.GameObjects.Text;
  private objectiveIcon?: Phaser.GameObjects.Image;
  private starsText?: Phaser.GameObjects.Text;
  private feverText?: Phaser.GameObjects.Text;
  private comboBurstText?: Phaser.GameObjects.Text;
  private missionText?: Phaser.GameObjects.Text;
  private streakText?: Phaser.GameObjects.Text;
  private rewardText?: Phaser.GameObjects.Text;
  private selectionRect?: Phaser.GameObjects.Rectangle;
  private boardFlash?: Phaser.GameObjects.Rectangle;
  private progressBarFill?: Phaser.GameObjects.Rectangle;
  private progressBarGlow?: Phaser.GameObjects.Rectangle;
  /** The tutorial plate (G12/G14): background and text are separate, so a pulse never scales the text. */
  private tutorialBg?: Phaser.GameObjects.Rectangle;
  private tutorialText?: Phaser.GameObjects.Text;
  private tutorialMessageState: "intro" | "wrong" = "intro";
  /** HUD texts the plate covers on purpose (zero stat cards on short phones), hidden until it goes. */
  private tutorialHiddenHud = new Set<HudKey>();
  /** performance.now() when the tutorial and the glove started, for the e2e's 100 ms check. */
  private tutorialStartedAt = 0;
  private gloveShownAt = 0;
  private tutorialStrokeTimer?: Phaser.Time.TimerEvent;
  private tutorialRevertTimer?: Phaser.Time.TimerEvent;
  /** The glove pointer and its trailing ghosts (G14). */
  private glove?: Phaser.GameObjects.Image;
  private gloveGhosts: Phaser.GameObjects.Image[] = [];
  private gloveTween?: Phaser.Tweens.Tween;
  private gloveTrail: Array<{ t: number; x: number; y: number }> = [];
  /** The glow ring around the hinted pair (static under reduced motion). */
  private hintGlow?: Phaser.GameObjects.Graphics;
  /** The clock and RUN_BEGIN start on the first valid swap (G10). */
  private clockStarted = false;
  private inputKind: InputKind = "mouse";
  private reducedMotion = false;
  /** True while the opening drop is in flight: swaps and the tutorial wait for it. */
  private introDropping = false;
  /** Guards the drop's promise against a restart of this same scene instance. */
  private introToken = 0;
  private sfxGainNode?: GainNode;
  private sfxNoiseBuffer?: AudioBuffer;
  private sfxUnlocked = false;
  private lastCountdownSecond = -1;
  private lastDropSfxAt = 0;
  private lastThunderSfxAt = 0;

  /**
   * Layout size in CSS pixels, fixed when the board is built (F10). `this.scale` is the backing
   * store (CSS x dpr) and must not be used for layout.
   */
  private viewWidth = 0;
  private viewHeight = 0;

  constructor() {
    super("Match3Scene");
  }

  /**
   * The canvas followed a resize (F10 LOOK_RESIZE): keep the board as built and fit it,
   * centred, into the new size, so nothing is cut off. A full relayout is G12's `layoutHud()`.
   *
   * An orientation flip before the first move rebuilds the board for the new shape instead:
   * letterboxing a portrait board into landscape shrinks it to about 46% (tiles under the 44 px
   * touch minimum). Nothing is lost at that point (no move, no score), and no React code
   * listens to GAME_START. Mid-run the fit stays, so a run in progress is never reset.
   */
  private onLookResize(event: LookResizeEvent) {
    if (!this.viewWidth || !this.viewHeight) return;
    const builtPortrait = this.viewHeight >= this.viewWidth;
    const nowPortrait = event.height >= event.width;
    if (builtPortrait !== nowPortrait && this.isPristineRun()) {
      this.scene.restart(this.props);
      return;
    }
    fitCssCamera(
      this.cameras.main,
      this,
      { width: this.viewWidth, height: this.viewHeight },
      { width: event.width, height: event.height },
    );
    // The camera zoom changed: texts pick up the new resolution and are fitted again.
    this.layoutHud();
  }

  /** No move made and nothing scored yet: rebuilding the board costs the player nothing. */
  private isPristineRun() {
    return this.moves === 0 && this.score === 0 && !this.ended && !this.busy;
  }

  /** Pointer position in layout (CSS) pixels, through the fitted camera. */
  private pointerToLayout(pointer: Phaser.Input.Pointer) {
    return pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
  }

  init(props: IMatch3Props) {
    this.props = props;
    this.level = MATCH3_LEVEL_BY_ID[props.level] || MATCH3_LEVELS[0];
    const bestScoreValue = Number(props.bestScore ?? 0);
    this.levelBestScore = Number.isFinite(bestScoreValue)
      ? Math.max(0, Math.floor(bestScoreValue))
      : 0;
    this.allowedTypes = TILE_TYPES.slice(0, this.level.tilePoolSize);
    if (!this.allowedTypes.includes(this.level.objectiveType)) {
      this.allowedTypes.push(this.level.objectiveType);
    }
    this.objectiveType = this.level.objectiveType;
    this.objectiveTarget = this.level.objectiveTarget;
    this.objectiveCollected = 0;
    this.objectiveRewardClaimed = false;
    this.starThresholdScores = STAR_PROGRESS_THRESHOLDS.map((ratio) =>
      Math.max(1, Math.round(this.level.targetScore * ratio)),
    );
    this.starsEarned = 0;
    this.feverActive = false;
    this.lastChanceUsed = false;
    this.tutorialActive = false;
    this.tutorialMove = null;
    this.tutorialMessageState = "intro";
    this.clockStarted = false;
    this.gloveTrail = [];
    this.inputKind = initialInputKind();
    this.reducedMotion = prefersReducedMotion();
    this.lastPlayerActionAt = 0;
    this.nextHintAt = 0;
    this.lastAssistAt = 0;
    this.assistDropsUsed = 0;
    this.hintMove = null;
    this.retentionState = null;
    this.streakBonusSeconds = 0;
    this.bonusMission = null;
    this.completedMissionIds = new Set<BonusMissionId>();
    this.testAdvanceCarryMs = 0;
    this.nextThunderAt = 0;
    this.score = 0;
    this.moves = 0;
    this.timeLeft = this.level.timeLimit;
    this.elapsedSeconds = 0;
    this.busy = false;
    this.ended = false;
    this.swapQueue = [];
    this.drainingSwapQueue = false;
    this.reshuffleFallbacks = MAX_RESHUFFLES_FALLBACK;
    this.dragStartCell = null;
    this.dragStartPoint = null;
    this.selectedCell = null;
    this.lastCountdownSecond = -1;
    this.lastDropSfxAt = 0;
    this.lastThunderSfxAt = 0;
  }

  preload() {
    // Plan F4: the brand faces load before create(), so no Text is rasterised with a fallback.
    preloadTTFonts(this);
    this.load.image(BG_KEY, MATCH3_ARENA_BG);
    MATCH3_CATNIP_ICON_SIZES.forEach((size) => this.load.image(catnipIconKey(size), MATCH3_CATNIP_ICONS[size]));

    MATCH3_TILE_ASSETS.forEach((tile) => {
      this.load.image(TILE_KEY_BY_TYPE[tile.type], tile.src);
    });
    // The glove pointer (G14), a 32x32 pixel PNG from the app's own origin, drawn NEAREST.
    this.load.image(GLOVE_TEXTURE_KEY, GLOVE_TEXTURE_URL);
  }

  create() {
    // F10: the layout below is in CSS pixels; the camera maps it onto the dpr backing store.
    const dpr = getCanvasPixelRatio(this);
    this.viewWidth = this.scale.width / dpr;
    this.viewHeight = this.scale.height / dpr;
    fitCssCamera(this.cameras.main, this, { width: this.viewWidth, height: this.viewHeight });
    this.game.events.on(LOOK_RESIZE, this.onLookResize, this);
    this.cleanupFns.push(() => this.game.events.off(LOOK_RESIZE, this.onLookResize, this));
    // A face that lands late (a timed-out gate, latin-ext) re-fits every HUD text in its slot.
    this.game.events.on(TT_FONTS_HEALED, this.layoutHud, this);
    this.cleanupFns.push(() => this.game.events.off(TT_FONTS_HEALED, this.layoutHud, this));
    // The catnip tile comes from the 64 px master and is drawn at 30-66 px: LINEAR filtering keeps
    // every leaf row (NEAREST shrinking dropped rows of the old 320 px leaf). Plan G8.
    this.textures.get(TILE_KEY_BY_TYPE.CATNIP)?.setFilter(Phaser.Textures.FilterMode.LINEAR);

    this.createSparkTexture();
    this.computeBoardLayout();
    this.loadRetentionSessionState();
    this.createBackdrop();
    this.createHud();
    this.createBoardFrame();

    const initialTypeBoard = this.createInitialTypeBoard();
    // The intro drop: the tiles fall in from above, unless reduced motion asks for them in place.
    // Input, the tutorial glow and the glove wait for the drop to land, so the ring is never drawn
    // around cells that are still falling (5c review).
    const introDrop = !this.reducedMotion;
    this.introDropping = introDrop;
    const introToken = ++this.introToken;
    const boardLanded = this.buildBoardFromTypes(initialTypeBoard, introDrop);

    this.setupInput();
    // The clock does not start here: it starts with RUN_BEGIN on the first valid swap (plan G10).
    this.startAmbientSparkles();
    this.setupDebugHooks();
    this.updateHud();
    this.registerActivity();
    if (introDrop) {
      void boardLanded.then(() => {
        if (introToken !== this.introToken || this.ended || !this.sys?.isActive()) return;
        this.finishIntro();
      });
    } else {
      this.finishIntro();
    }

    // PLAY AGAIN on this level: the scene restarts itself (plan F6), as a restart.
    const onRestart = () => {
      if (this.sys?.isActive()) this.scene.restart({ ...this.props, isRestart: true });
    };
    GameEvents.GAME_RESTART.addEventListener(onRestart);
    this.cleanupFns.push(() => GameEvents.GAME_RESTART.removeEventListener(onRestart));

    GameEvents.RUN_READY.push({ isRestart: !!this.props.isRestart, level: this.level.id });
    GameEvents.GAME_PROGRESS_UPDATE.push({ progress: 0 });

    this.events.once("shutdown", this.cleanup, this);
    this.events.once("destroy", this.cleanup, this);

    // The container fades the canvas in once the first laid-out frame is drawn (plan G12). The
    // drop itself is part of what fades in; the tutorial follows when it lands.
    this.events.once("postupdate", () => signalSceneReady(MATCH3_GAME_ID));
  }

  /** After the intro drop (or at once under reduced motion): input, tutorial, glove, nudge. */
  private finishIntro() {
    this.introDropping = false;
    this.startTutorialIfNeeded();
    if (!this.tutorialActive) {
      this.showLevelObjectiveNudge();
    }
    this.updateHud();
    this.registerActivity();
    announce(
      MATCH3_GAME_ID,
      this.tutorialActive
        ? this.tutorialText?.text ?? ""
        : `Paw Match level ${this.level.id}. Goal ${this.level.targetScore} points. The clock starts with your first match.`,
    );
  }

  /**
   * The first valid swap starts the run (plan G10, F6): the clock, then RUN_BEGIN, the only start
   * signal GameContext turns into `game_start`.
   */
  private beginRunIfNeeded(valid: boolean) {
    if (!shouldStartClock(this.clockStarted, { valid }) || this.ended) return;
    this.clockStarted = true;
    this.startTimer();
    GameEvents.RUN_BEGIN.push({ isRestart: !!this.props.isRestart, level: this.level.id });
    if (!this.tutorialActive) announce(MATCH3_GAME_ID, `Clock started: ${this.timeLeft} seconds.`);
  }

  private cleanup() {
    if (this.timerEvent) {
      this.timerEvent.remove(false);
      this.timerEvent = undefined;
    }

    this.clearHintPulse();
    this.teardownDebugHooks();
    this.destroyTutorialPlate();

    this.cleanupFns.forEach((cleanup) => cleanup());
    this.cleanupFns = [];
    this.swapQueue = [];
    this.drainingSwapQueue = false;
    this.lastCountdownSecond = -1;
    this.lastDropSfxAt = 0;
    this.lastThunderSfxAt = 0;

    this.sfxGainNode?.disconnect();
    this.sfxGainNode = undefined;
    this.sfxNoiseBuffer = undefined;
    this.sfxUnlocked = false;

    this.destroyBoard();
  }

  private getLocalDayKey(offsetDays: number = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private readRetentionState(): IRetentionState | null {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(MATCH3_RETENTION_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<IRetentionState>;
      if (!parsed.lastPlayedDate) {
        return null;
      }
      return {
        lastPlayedDate: parsed.lastPlayedDate,
        dayStreak: Math.max(1, parsed.dayStreak || 1),
        totalRuns: Math.max(0, parsed.totalRuns || 0),
        completedRuns: Math.max(0, parsed.completedRuns || 0),
        winStreak: Math.max(0, parsed.winStreak || 0),
      };
    } catch {
      return null;
    }
  }

  private persistRetentionState() {
    if (!this.retentionState || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        MATCH3_RETENTION_KEY,
        JSON.stringify(this.retentionState),
      );
    } catch {
      // ignore storage failures
    }
  }

  private buildMission(id: BonusMissionId): IBonusMission {
    const base = {
      progress: 0,
      rewardScore: BONUS_MISSION_REWARD_SCORE,
      rewardSeconds: BONUS_MISSION_REWARD_SECONDS,
    };

    if (id === "CHAIN_2") {
      return { ...base, id, label: "BONUS: HIT 2x COMBO", target: 1 };
    }
    if (id === "MATCH_4") {
      return { ...base, id, label: "BONUS: MAKE A 4+ MATCH", target: 1 };
    }
    if (id === "SPECIAL_TRIGGER") {
      return { ...base, id, label: "BONUS: TRIGGER SPECIAL", target: 1 };
    }

    return {
      ...base,
      id,
      label: `BONUS: COLLECT ${TILE_LABEL_BY_TYPE[this.objectiveType]}`,
      target: 5,
    };
  }

  private assignNextBonusMission() {
    if (this.completedMissionIds.size >= BONUS_MISSION_LIMIT) {
      this.bonusMission = null;
      return;
    }

    const allMissionIds: BonusMissionId[] = [
      "CHAIN_2",
      "MATCH_4",
      "SPECIAL_TRIGGER",
      "OBJECTIVE_HUNT",
    ];
    const available = allMissionIds.filter((id) => !this.completedMissionIds.has(id));
    const nextId = available[Math.floor(Math.random() * available.length)];
    this.bonusMission = this.buildMission(nextId);
  }

  private completeBonusMission() {
    if (!this.bonusMission) {
      return;
    }

    this.completedMissionIds.add(this.bonusMission.id);
    this.score += this.bonusMission.rewardScore;
    this.timeLeft = Math.min(
      this.level.timeLimit,
      this.timeLeft + this.bonusMission.rewardSeconds,
    );
    this.triggerBoardFlash(0x86efac, 0.24, 240);
    this.setComboMessage(
      `BONUS COMPLETE +${this.bonusMission.rewardSeconds}s +${this.bonusMission.rewardScore}`,
    );
    this.playSfx("combo", 3);
    this.bonusMission = null;
    this.assignNextBonusMission();
    this.updateHud();
  }

  private updateBonusMissionProgress(params: {
    comboDepth: number;
    clearCount: number;
    specialTriggered: boolean;
    objectiveGain: number;
  }) {
    if (!this.bonusMission) {
      return;
    }

    if (this.bonusMission.id === "CHAIN_2" && params.comboDepth >= 2) {
      this.bonusMission.progress = this.bonusMission.target;
    }
    if (this.bonusMission.id === "MATCH_4" && params.clearCount >= 4) {
      this.bonusMission.progress = this.bonusMission.target;
    }
    if (this.bonusMission.id === "SPECIAL_TRIGGER" && params.specialTriggered) {
      this.bonusMission.progress = this.bonusMission.target;
    }
    if (this.bonusMission.id === "OBJECTIVE_HUNT" && params.objectiveGain > 0) {
      this.bonusMission.progress = Math.min(
        this.bonusMission.target,
        this.bonusMission.progress + params.objectiveGain,
      );
    }

    if (this.bonusMission.progress >= this.bonusMission.target) {
      this.completeBonusMission();
      return;
    }

    this.updateHud();
  }

  private tryAssistDrop(now: number) {
    if (
      this.assistDropsUsed >= ASSIST_MAX_DROPS ||
      this.moves < 4 ||
      now - this.lastPlayerActionAt < ASSIST_IDLE_MS ||
      now - this.lastAssistAt < ASSIST_COOLDOWN_MS
    ) {
      return;
    }

    const move = this.chooseBestMove();
    if (!move) {
      return;
    }

    const cell = this.board[move.from.row][move.from.col];
    if (!cell || cell.power) {
      return;
    }

    this.clearHintPulse();
    cell.power = Math.random() > 0.5 ? "ROW" : "COL";
    this.applyPowerVisual(cell);
    this.playImpactSquish(cell);
    this.spawnSparkles({ row: cell.row, col: cell.col }, 12);
    this.triggerBoardFlash(0x93c5fd, 0.18, 180);
    this.assistDropsUsed += 1;
    this.lastAssistAt = now;
    this.registerActivity();
    this.setComboMessage("LUCKY PAW BOOST");
  }

  private loadRetentionSessionState() {
    const today = this.getLocalDayKey();
    const yesterday = this.getLocalDayKey(-1);
    const previous = this.readRetentionState();

    const next: IRetentionState = {
      lastPlayedDate: today,
      dayStreak: 1,
      totalRuns: 1,
      completedRuns: 0,
      winStreak: 0,
    };

    if (previous) {
      next.dayStreak =
        previous.lastPlayedDate === today
          ? previous.dayStreak
          : previous.lastPlayedDate === yesterday
            ? previous.dayStreak + 1
            : 1;
      next.totalRuns = previous.totalRuns + 1;
      next.completedRuns = previous.completedRuns;
      next.winStreak = previous.winStreak;
    }

    this.retentionState = next;
    this.streakBonusSeconds = Math.min(4, Math.max(0, next.dayStreak - 1));
    this.timeLeft += this.streakBonusSeconds;
    this.lastAssistAt = -ASSIST_COOLDOWN_MS;
    this.assignNextBonusMission();
    this.persistRetentionState();
  }

  private persistRunOutcome(isTargetReached: boolean) {
    if (!this.retentionState) {
      return;
    }

    if (isTargetReached) {
      this.retentionState.completedRuns += 1;
      this.retentionState.winStreak += 1;
    } else {
      this.retentionState.winStreak = 0;
    }

    this.persistRetentionState();
  }

  private createSparkTexture() {
    if (this.textures.exists(SPARK_KEY)) {
      return;
    }

    const graphics = this.add.graphics();
    graphics.setVisible(false);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture(SPARK_KEY, 8, 8);
    graphics.destroy();
  }

  /**
   * The streak line as prioritised segments (plan G12): when the slot is too narrow, BEST goes
   * first, then W{n}, then the bonus seconds, before anything shrinks.
   */
  private getStreakHudSegments(dayStreak: number, winStreak: number): TTFitSegment[] {
    const name =
      this.layout?.mode === "smallLandscape"
        ? `LEVEL ${this.level.id}`
        : this.level.name.toUpperCase();
    const segments: TTFitSegment[] = [{ text: name }, { text: `D${dayStreak}`, priority: 4 }];
    if (this.streakBonusSeconds > 0) segments.push({ text: `+${this.streakBonusSeconds}s`, priority: 3 });
    if (winStreak > 0) segments.push({ text: `W${winStreak}`, priority: 2 });
    if (this.levelBestScore > 0) segments.push({ text: `BEST ${this.levelBestScore}`, priority: 1 });
    return segments;
  }

  /**
   * The safe-area insets and the header reserve, in CSS px, from the custom properties Match3.tsx
   * sets on the play wrapper (they inherit to the canvas). A property that is missing or not
   * registered (raw `env()` tokens) falls back to the props, then to 0 / the default reserve.
   */
  private readViewportInsets(): { insets: Insets; headerReserveRight?: number } {
    const fallback = this.props?.safeArea ?? {};
    const insets: Insets = {
      top: fallback.top ?? 0,
      right: fallback.right ?? 0,
      bottom: fallback.bottom ?? 0,
      left: fallback.left ?? 0,
    };
    let headerReserveRight = this.props?.headerReserveRight;
    const canvas = this.game?.canvas;
    if (typeof window === "undefined" || !canvas?.isConnected) return { insets, headerReserveRight };
    try {
      const style = window.getComputedStyle(canvas);
      const read = (name: string) => {
        const value = parseFloat(style.getPropertyValue(name));
        return Number.isFinite(value) && value >= 0 ? value : undefined;
      };
      (Object.keys(MATCH3_SAFE_AREA_PROPERTIES) as Array<keyof Insets>).forEach((side) => {
        const value = read(MATCH3_SAFE_AREA_PROPERTIES[side]);
        if (value !== undefined) insets[side] = value;
      });
      headerReserveRight = read(MATCH3_HEADER_RESERVE_PROPERTY) ?? headerReserveRight;
    } catch {
      // No computed style (detached canvas): keep the fallbacks.
    }
    return { insets, headerReserveRight };
  }

  private computeBoardLayout() {
    const layout = computeMatch3Layout(this.viewWidth, this.viewHeight, this.readViewportInsets());
    this.layout = layout;
    this.smallLandscapeHud = layout.mode === "smallLandscape";
    this.wideHud = layout.mode === "wide";
    this.compactHud = layout.compact;
    this.tileSize = layout.tileSize;
    this.boardWidth = layout.board.w;
    this.boardHeight = layout.board.h;
    this.boardStartX = layout.board.x;
    this.boardStartY = layout.board.y;
    this.tileIconSize = layout.tileIconSize;
    this.markerOffset = layout.markerOffset;
  }

  private createBackdrop() {
    const centerX = this.viewWidth / 2;
    const centerY = this.viewHeight / 2;
    const boardCenterX = this.boardStartX + this.boardWidth / 2;
    const boardCenterY = this.boardStartY + this.boardHeight / 2;

    this.add
      .image(centerX, centerY, BG_KEY)
      .setDisplaySize(this.viewWidth, this.viewHeight)
      .setAlpha(0.34)
      .setDepth(0);

    this.add
      .rectangle(centerX, centerY, this.viewWidth, this.viewHeight, 0x050414, 0.56)
      .setDepth(1);

    this.add
      .ellipse(
        centerX - this.boardWidth * 0.42,
        centerY - this.boardHeight * 0.18,
        this.viewWidth * 0.62,
        this.viewHeight * 0.48,
        0x60a5fa,
        0.12,
      )
      .setDepth(1.2)
      .setBlendMode(Phaser.BlendModes.SCREEN);

    this.add
      .ellipse(
        centerX + this.boardWidth * 0.42,
        centerY - this.boardHeight * 0.12,
        this.viewWidth * 0.64,
        this.viewHeight * 0.5,
        0xf472b6,
        0.1,
      )
      .setDepth(1.2)
      .setBlendMode(Phaser.BlendModes.SCREEN);

    this.add
      .rectangle(centerX, 0, this.viewWidth, this.viewHeight * 0.5, 0xa78bfa, 0.1)
      .setOrigin(0.5, 0)
      .setDepth(1.3);

    for (let starIndex = 0; starIndex < BACKDROP_TWINKLE_STARS; starIndex += 1) {
      const star = this.add
        .circle(
          Phaser.Math.Between(0, this.viewWidth),
          Phaser.Math.Between(0, this.viewHeight),
          Phaser.Math.FloatBetween(0.8, 2.2),
          Phaser.Display.Color.GetColor(
            230 + Phaser.Math.Between(0, 25),
            220 + Phaser.Math.Between(0, 35),
            255,
          ),
          Phaser.Math.FloatBetween(0.14, 0.54),
        )
        .setDepth(1.4);

      this.tweens.add({
        targets: star,
        alpha: Phaser.Math.FloatBetween(0.1, 0.75),
        scale: Phaser.Math.FloatBetween(0.8, 1.5),
        duration: Phaser.Math.Between(1100, 3200),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 1800),
        ease: "Sine.InOut",
      });
    }

    this.add
      .image(
        boardCenterX - this.boardWidth * 0.86,
        boardCenterY + this.boardHeight * 0.3,
        TILE_KEY_BY_TYPE["TAILS"],
      )
      .setDisplaySize(102, 102)
      .setAlpha(0.18)
      .setDepth(2.15)
      .setBlendMode(Phaser.BlendModes.SCREEN);

    this.add
      .image(
        boardCenterX + this.boardWidth * 0.86,
        boardCenterY + this.boardHeight * 0.32,
        TILE_KEY_BY_TYPE["PAW"],
      )
      .setDisplaySize(108, 108)
      .setAlpha(0.15)
      .setDepth(2.15)
      .setBlendMode(Phaser.BlendModes.SCREEN);

    const ringOuter = this.add
      .ellipse(boardCenterX, boardCenterY, this.boardWidth * 1.48, this.boardHeight * 1.45)
      .setStrokeStyle(8, 0xfbbf24, 0.2)
      .setDepth(2)
      .setBlendMode(Phaser.BlendModes.ADD);
    const ringInner = this.add
      .ellipse(boardCenterX, boardCenterY, this.boardWidth * 1.2, this.boardHeight * 1.18)
      .setStrokeStyle(4, 0xfef08a, 0.24)
      .setDepth(2.1)
      .setBlendMode(Phaser.BlendModes.ADD);
    const ringThird = this.add
      .ellipse(boardCenterX, boardCenterY + this.boardHeight * 0.03, this.boardWidth * 1.62, this.boardHeight * 1.08)
      .setStrokeStyle(3, 0xf9a8d4, 0.22)
      .setDepth(2.05)
      .setBlendMode(Phaser.BlendModes.SCREEN);

    this.tweens.add({
      targets: ringOuter,
      angle: 360,
      duration: 26000,
      repeat: -1,
      ease: "Linear",
    });
    this.tweens.add({
      targets: ringInner,
      angle: -360,
      duration: 19000,
      repeat: -1,
      ease: "Linear",
    });
    this.tweens.add({
      targets: ringThird,
      angle: 360,
      duration: 31000,
      repeat: -1,
      ease: "Linear",
    });

    this.add
      .ellipse(
        boardCenterX,
        boardCenterY + this.boardHeight * 0.42,
        this.boardWidth * 1.46,
        this.boardHeight * 0.58,
        0x9333ea,
        0.2,
      )
      .setDepth(2.2)
      .setBlendMode(Phaser.BlendModes.SCREEN);

    this.add
      .ellipse(
        boardCenterX,
        boardCenterY,
        this.boardWidth * 1.32,
        this.boardHeight * 1.28,
        0xf59e0b,
        0.08,
      )
      .setDepth(2)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  private createUiCard(
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number,
    accentColor: number = 0xfcd34d,
    baseColor: number = 0x2a1846,
  ) {
    const cornerSize = Math.max(4, Math.floor(Math.min(width, height) * 0.08));
    const innerWidth = Math.max(20, width - 12);
    const innerHeight = Math.max(20, height - 12);

    this.add
      .rectangle(x + 4, y + 5, width, height, 0x03010a, 0.5)
      .setDepth(depth - 0.45);

    this.add
      .rectangle(x, y, width, height, 0x130e2b, 0.95)
      .setStrokeStyle(5, UI_GOLD_DARK, 0.95)
      .setDepth(depth);

    this.add
      .rectangle(x, y, innerWidth, innerHeight, baseColor, 0.94)
      .setStrokeStyle(3, accentColor, 0.96)
      .setDepth(depth + 0.04);

    this.add
      .rectangle(x, y, innerWidth - 8, innerHeight - 8, UI_PLUM, 0.44)
      .setStrokeStyle(1, UI_CREAM, 0.42)
      .setDepth(depth + 0.08);

    this.add
      .rectangle(
        x,
        y - height * 0.3,
        width - 16,
        Math.max(10, Math.floor(height * 0.24)),
        0xfff7d6,
        0.12,
      )
      .setDepth(depth + 0.18);

    this.add
      .rectangle(
        x,
        y + height * 0.32,
        width - 18,
        Math.max(8, Math.floor(height * 0.18)),
        0x000000,
        0.12,
      )
      .setDepth(depth + 0.2);

    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].forEach(([dirX, dirY]) => {
      this.add
        .rectangle(
          x + dirX * (width / 2 - cornerSize * 0.7),
          y + dirY * (height / 2 - cornerSize * 0.7),
          cornerSize,
          cornerSize,
          UI_GOLD,
          0.95,
        )
        .setStrokeStyle(2, UI_GOLD_DARK, 0.95)
        .setDepth(depth + 0.22);
    });
  }

  /** One HUD text in its layout slot (plan G12): a `ttText` role, fitted to the slot box. */
  private addHudText(
    key: HudKey,
    value: string,
    style: { color: string; stroke?: string; strokeThickness?: number; depth?: number },
  ) {
    const slot = this.layout.slots[key];
    const text = ttText(this, slot.x, slot.y, value, slot.role, {
      size: slot.size,
      color: style.color,
      stroke: style.stroke ?? false,
      strokeThickness: style.strokeThickness,
      align: slot.originX === 0 ? "left" : slot.originX === 1 ? "right" : "center",
      wordWrapWidth: slot.wrap ? slot.box.w : undefined,
      origin: [slot.originX, slot.originY],
      depth: style.depth ?? 60,
    });
    this.hudTexts.set(key, text);
    this.fitHud(key);
    return text;
  }

  /** Fits a HUD text into its slot again (after `setText`, a late font or a resize). */
  private fitHud(key: HudKey, segments?: TTFitSegment[]) {
    const text = this.hudTexts.get(key);
    const slot = this.layout?.slots[key];
    if (!text || !slot || !text.scene) return;
    text.setPosition(slot.x, slot.y);
    ttFit(text as unknown as TTFitTarget, {
      role: slot.role,
      size: slot.size,
      maxWidth: slot.box.w,
      // Slot heights are glyph boxes (cap height plus a little); a Phaser Text's height is its
      // whole line box plus the stroke, so only wrapped slots are held to a height.
      maxHeight: slot.wrap ? slot.box.h + 10 : undefined,
      segments,
      separator: " • ",
    });
  }

  private setHudText(key: HudKey, value: string) {
    const text = this.hudTexts.get(key);
    if (!text) return;
    text.setText(value);
    this.fitHud(key);
  }

  /**
   * The one HUD layout pass (plan G12, F10): runs on create, after late fonts
   * (`TT_FONTS_HEALED`) and after a resize. Every text goes back to its slot at the current text
   * resolution and is fitted again, so a wider fallback face or a new size can never push one text
   * into another.
   */
  private layoutHud() {
    if (!this.layout) return;
    this.hudTexts.forEach((text, key) => {
      if (!text.scene) return;
      refreshTTResolution(text as unknown as HealableText);
      if (key === "streak") {
        this.fitHud(key, this.getStreakHudSegments(this.retentionState?.dayStreak || 1, this.retentionState?.winStreak || 0));
      } else {
        this.fitHud(key);
      }
    });
    // The tutorial plate follows the same passes (create, late fonts, resize): plan G14.
    this.layoutTutorialPlate();
  }

  /** HUD text bounds in layout pixels, for the test hook (`render_game_to_text`). */
  private hudBounds() {
    return Array.from(this.hudTexts.entries())
      .filter(([, text]) => text.scene && text.visible && text.text.length > 0)
      .map(([key, text]) => {
        const b = text.getBounds();
        const slot = this.layout.slots[key];
        return {
          key,
          text: text.text,
          family: String(text.style.fontFamily),
          size: text.style.fontSize,
          x: Math.round(b.x * 10) / 10,
          y: Math.round(b.y * 10) / 10,
          w: Math.round(b.width * 10) / 10,
          h: Math.round(b.height * 10) / 10,
          slot: slot.box,
        };
      });
  }

  private createHud() {
    const layout = this.layout;
    const centerX = this.viewWidth / 2;
    const ink = "#111827";
    this.hudTexts.clear();

    if (layout.title) {
      const plate = layout.title.plate;
      this.createUiCard(plate.x, plate.y, plate.w, plate.h, 56, UI_GOLD, UI_NAVY);
      [-1, 1].forEach((side) => {
        this.add
          .image(plate.x + side * layout.title!.pawOffset, plate.y, TILE_KEY_BY_TYPE["PAW"])
          .setDisplaySize(22, 22)
          .setDepth(57)
          .setAlpha(0.92);
      });
      this.titleText = this.addHudText("title", "TOKEN TAILS  •  PAW MATCH", {
        color: "#fde68a",
        stroke: "#2a1a44",
        strokeThickness: layout.compact ? 5 : 6,
        depth: 58,
      });
    } else {
      this.titleText = undefined;
    }

    layout.cards.forEach((card) => this.createUiCard(card.x, card.y, card.w, card.h, 56, UI_GOLD, UI_NAVY));
    layout.rows.forEach((row) => {
      this.add
        .rectangle(row.x, row.y, row.w, row.h, row.alt ? 0x1b153a : 0x24184d, 0.42)
        .setStrokeStyle(1, UI_CREAM, 0.26)
        .setDepth(58.2);
    });

    const thin = layout.mode === "smallLandscape" ? 3 : 4;
    this.streakText = this.addHudText("streak", "", { color: "#fef3c7", stroke: "#1b1230", strokeThickness: thin });
    this.timerText = this.addHudText("timer", "TIME 0", { color: "#fef3c7", stroke: "#0f172a", strokeThickness: thin + 1 });
    this.scoreText = this.addHudText("score", "SCORE 0", {
      color: layout.mode === "standard" ? "#fef3c7" : "#fde68a",
      stroke: "#0f172a",
      strokeThickness: thin + 1,
    });
    this.bestScoreText = this.addHudText("best", `BEST ${this.levelBestScore}`, {
      color: layout.mode === "standard" ? "#fde68a" : "#fef3c7",
      stroke: "#0f172a",
      strokeThickness: thin,
    });
    this.targetText = this.addHudText("target", `GOAL ${this.level.targetScore}`, {
      color: "#fef3c7",
      stroke: "#0f172a",
      strokeThickness: thin + 1,
    });
    this.movesText = this.addHudText("moves", "MOVES 0", { color: "#fef3c7", stroke: "#0f172a", strokeThickness: thin + 1 });

    // Objective icon: the catnip objective uses the master of its own CSS size (16, 24 or 32 px),
    // an integer scale at any whole pixel ratio (plan G8);
    // other objective tiles keep their tile texture (logged follow-up: NEAREST-shrunk tiles).
    const icon = layout.objectiveIcon;
    this.objectiveIcon = this.add
      .image(icon.x, icon.y, this.objectiveIconKey())
      .setOrigin(icon.originX, 0.5)
      .setDisplaySize(icon.size, icon.size)
      .setDepth(60);
    this.objectiveText = this.addHudText(
      "objective",
      `GOAL ${TILE_LABEL_BY_TYPE[this.objectiveType]} 0/${this.objectiveTarget}`,
      { color: "#fef3c7", stroke: ink, strokeThickness: thin },
    );
    this.starsText = this.addHudText("stars", "STARS ☆☆☆", { color: "#fde68a", stroke: ink, strokeThickness: thin + 1 });

    const progress = layout.progress;
    this.add
      .rectangle(progress.x, progress.y, progress.w, progress.h, 0x120b23, 0.92)
      .setStrokeStyle(3, UI_GOLD, 0.8)
      .setDepth(58)
      .setBlendMode(Phaser.BlendModes.NORMAL);
    this.progressBarFill = this.add
      .rectangle(progress.x - progress.w / 2, progress.y, progress.w, progress.h, 0x34d399, 0.94)
      .setOrigin(0, 0.5)
      .setDepth(59);
    this.progressBarGlow = this.add
      .rectangle(progress.x - progress.w / 2, progress.y - 1, progress.w, progress.glowH, 0xfef08a, 0.45)
      .setOrigin(0, 0.5)
      .setDepth(59.2)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.comboText = this.addHudText("combo", "SWIPE TO MATCH", { color: "#f8e18b", stroke: "#221433", strokeThickness: thin + 1 });
    this.missionText = this.addHudText("mission", "BONUS: START A CHAIN", {
      color: "#fef3c7",
      stroke: "#1b1331",
      strokeThickness: thin,
    });
    this.comboBurstText = this.addHudText("burst", "", { color: GOLD[400], depth: 76 });
    this.comboBurstText.setAlpha(0).setVisible(false).setShadow(0, 0, "#000000", 12, true, true);
    this.feverText = this.addHudText("fever", "FEVER x2", { color: "#fca5a5", stroke: "#711428", strokeThickness: thin + 1, depth: 70 });
    this.feverText.setVisible(false);
    this.rewardText = this.addHudText("reward", `CATNIP 0/${this.level.catnipCap}`, {
      color: "#fde68a",
      stroke: "#1b1331",
      strokeThickness: thin + 1,
    });

    this.selectionRect = this.add
      .rectangle(
        centerX,
        200,
        Math.floor(this.tileSize * 0.92),
        Math.floor(this.tileSize * 0.92),
      )
      .setStrokeStyle(3, 0xfef3c7, 1)
      .setDepth(55)
      .setVisible(false);

    this.layoutHud();
  }

  /** The objective icon texture: the catnip master of the icon's size for catnip, else the tile. */
  private objectiveIconKey() {
    const key = catnipIconKey(this.layout.objectiveIcon.size);
    return this.objectiveType === "CATNIP" && this.textures.exists(key) ? key : TILE_KEY_BY_TYPE[this.objectiveType];
  }

  private createBoardFrame() {
    const boardWidth = this.boardWidth;
    const boardHeight = this.boardHeight;
    const boardCenterX = this.boardStartX + boardWidth / 2;
    const boardCenterY = this.boardStartY + boardHeight / 2;
    const outerFrameWidth = boardWidth + 44;
    const outerFrameHeight = boardHeight + 44;
    const midFrameWidth = boardWidth + 30;
    const midFrameHeight = boardHeight + 30;
    const innerFrameWidth = boardWidth + 14;
    const innerFrameHeight = boardHeight + 14;

    this.add
      .ellipse(
        boardCenterX,
        boardCenterY + boardHeight * 0.56,
        boardWidth * 1.22,
        boardHeight * 0.24,
        0x0f172a,
        0.42,
      )
      .setDepth(10);

    this.add
      .ellipse(
        boardCenterX,
        boardCenterY + boardHeight * 0.54,
        boardWidth * 1.14,
        boardHeight * 0.2,
        0xf59e0b,
        0.12,
      )
      .setDepth(10.05)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.add
      .rectangle(boardCenterX, boardCenterY, outerFrameWidth, outerFrameHeight, 0x100924, 0.95)
      .setStrokeStyle(7, UI_GOLD_DARK, 0.96)
      .setDepth(10.2);

    this.add
      .rectangle(boardCenterX, boardCenterY, midFrameWidth, midFrameHeight, 0x211249, 0.95)
      .setStrokeStyle(4, UI_GOLD, 0.96)
      .setDepth(10.3);

    this.add
      .rectangle(boardCenterX, boardCenterY, innerFrameWidth, innerFrameHeight, 0x2c1a57, 0.56)
      .setStrokeStyle(2, UI_CREAM, 0.42)
      .setDepth(10.4);

    [
      [this.boardStartX - 16, this.boardStartY - 16],
      [this.boardStartX + boardWidth + 16, this.boardStartY - 16],
      [this.boardStartX - 16, this.boardStartY + boardHeight + 16],
      [this.boardStartX + boardWidth + 16, this.boardStartY + boardHeight + 16],
    ].forEach(([x, y]) => {
      this.add
        .rectangle(x, y, 12, 12, 0xf8d277, 0.95)
        .setDepth(10.5)
        .setStrokeStyle(2, UI_GOLD_DARK, 1)
        .setAngle(45);
      this.add
        .circle(x, y, 3.5, 0x7c3aed, 0.78)
        .setDepth(10.55)
        .setStrokeStyle(1, UI_CREAM, 0.72);
    });

    const sideTrimHeight = boardHeight + 20;
    const sideTrimWidth = Math.max(14, Math.floor(this.tileSize * 0.24));
    this.add
      .rectangle(this.boardStartX - 19, boardCenterY, sideTrimWidth, sideTrimHeight, 0x4a2b12, 0.9)
      .setStrokeStyle(2, UI_GOLD, 0.8)
      .setDepth(10.45);
    this.add
      .rectangle(this.boardStartX + boardWidth + 19, boardCenterY, sideTrimWidth, sideTrimHeight, 0x4a2b12, 0.9)
      .setStrokeStyle(2, UI_GOLD, 0.8)
      .setDepth(10.45);

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const world = this.cellToWorld(row, col);
        const alternating = (row + col) % 2 === 0;
        this.add
          .rectangle(
            world.x,
            world.y,
            Math.floor(this.tileSize * 0.9),
            Math.floor(this.tileSize * 0.9),
            alternating ? 0x20184a : 0x2b215a,
            0.5,
          )
          .setStrokeStyle(1, 0xf8fafc, 0.16)
          .setDepth(10.7);
        this.add
          .rectangle(
            world.x,
            world.y - Math.floor(this.tileSize * 0.16),
            Math.floor(this.tileSize * 0.72),
            Math.max(6, Math.floor(this.tileSize * 0.16)),
            0xffffff,
            0.06,
          )
          .setDepth(10.7);
      }
    }

    const gridGraphics = this.add.graphics().setDepth(11);
    gridGraphics.lineStyle(1, UI_CREAM, 0.2);

    for (let row = 0; row <= BOARD_ROWS; row += 1) {
      const y = this.boardStartY + row * this.tileSize;
      gridGraphics.lineBetween(this.boardStartX, y, this.boardStartX + boardWidth, y);
    }

    for (let col = 0; col <= BOARD_COLS; col += 1) {
      const x = this.boardStartX + col * this.tileSize;
      gridGraphics.lineBetween(x, this.boardStartY, x, this.boardStartY + boardHeight);
    }

    this.boardFlash = this.add
      .rectangle(
        boardCenterX,
        boardCenterY,
        boardWidth + 4,
        boardHeight + 4,
        0xfef08a,
        0,
      )
      .setDepth(12)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  private setupInput() {
    const pointerDown = (pointer: Phaser.Input.Pointer) => {
      if (this.ended) {
        return;
      }

      this.unlockSfx();
      this.noteInputKind(pointer);
      const point = this.pointerToLayout(pointer);
      const cell = this.worldToCell(point.x, point.y);
      if (!cell) {
        return;
      }

      this.registerActivity();
      this.playSfx("tap");
      this.dragStartCell = cell;
      this.dragStartPoint = { x: point.x, y: point.y };
      if (!this.busy) {
        this.pulseCellPress(cell);
      }
    };

    const pointerUp = (pointer: Phaser.Input.Pointer) => {
      if (!this.dragStartCell || this.ended) {
        this.dragStartCell = null;
        this.dragStartPoint = null;
        return;
      }

      const startCell = this.dragStartCell;
      const point = this.pointerToLayout(pointer);
      const releaseCell = this.worldToCell(point.x, point.y);
      let targetCell: ICellPos | null = null;

      if (releaseCell && isAdjacent(startCell, releaseCell)) {
        targetCell = releaseCell;
      }

      if (!targetCell && this.dragStartPoint) {
        const dx = point.x - this.dragStartPoint.x;
        const dy = point.y - this.dragStartPoint.y;

        if (Math.abs(dx) > SWIPE_THRESHOLD || Math.abs(dy) > SWIPE_THRESHOLD) {
          if (Math.abs(dx) >= Math.abs(dy)) {
            targetCell = {
              row: startCell.row,
              col: startCell.col + (dx > 0 ? 1 : -1),
            };
          } else {
            targetCell = {
              row: startCell.row + (dy > 0 ? 1 : -1),
              col: startCell.col,
            };
          }
        }
      }

      if (targetCell && this.isValidCell(targetCell.row, targetCell.col)) {
        this.setSelected(null);
        void this.requestSwap(startCell, targetCell);
      } else if (!this.busy) {
        this.handleTapSelection(startCell);
      }

      this.dragStartCell = null;
      this.dragStartPoint = null;
    };

    this.input.on("pointerdown", pointerDown);
    this.input.on("pointerup", pointerUp);

    this.cleanupFns.push(() => {
      this.input.off("pointerdown", pointerDown);
      this.input.off("pointerup", pointerUp);
    });
  }

  /** Touch vs mouse copy (G14): the plate follows the device the player last used. */
  private noteInputKind(pointer: Phaser.Input.Pointer) {
    const type = (pointer.event as PointerEvent | undefined)?.pointerType;
    const kind: InputKind = pointer.wasTouch || type === "touch" || type === "pen" ? "touch" : "mouse";
    if (kind === this.inputKind) return;
    this.inputKind = kind;
    if (this.tutorialActive && this.tutorialMessageState === "intro") {
      this.setTutorialMessage("intro");
    }
  }

  private getSfxContext() {
    const manager = this.sound as unknown as {
      context?: AudioContext;
      masterGainNode?: AudioNode;
      masterGain?: AudioNode;
    };

    return {
      context: manager?.context ?? null,
      destination: manager?.masterGainNode || manager?.masterGain || null,
    };
  }

  private unlockSfx() {
    const { context } = this.getSfxContext();
    if (!context) {
      return;
    }

    if (!this.sfxGainNode) {
      this.sfxGainNode = context.createGain();
      this.sfxGainNode.gain.value = SFX_MASTER_VOLUME;
      const { destination } = this.getSfxContext();
      this.sfxGainNode.connect(destination || context.destination);
    }

    if (context.state === "suspended") {
      void context.resume();
    }

    this.sfxUnlocked = context.state !== "closed";
  }

  private playTone(options: {
    freq: number;
    toFreq?: number;
    duration: number;
    volume: number;
    type?: OscillatorType;
    attack?: number;
    delayMs?: number;
    detune?: number;
    pan?: number;
    filterType?: BiquadFilterType;
    filterFreq?: number;
  }) {
    if (!this.sfxUnlocked || !this.sfxGainNode) {
      return;
    }

    const { context } = this.getSfxContext();
    if (!context || context.state !== "running") {
      return;
    }

    const start = context.currentTime + (options.delayMs || 0) / 1000;
    const duration = Math.max(0.02, options.duration);
    const attack = Math.max(0.003, options.attack ?? 0.008);
    const end = start + duration;
    const osc = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();

    osc.type = options.type || "triangle";
    osc.frequency.setValueAtTime(Math.max(30, options.freq), start);
    if (options.toFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, options.toFreq), end);
    }
    if (options.detune) {
      osc.detune.setValueAtTime(options.detune, start);
    }

    filter.type = options.filterType || "lowpass";
    filter.frequency.setValueAtTime(options.filterFreq ?? 3200, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(options.volume, start + attack);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, options.volume * 0.42),
      start + duration * 0.58,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    let lastNode: AudioNode = filter;
    osc.connect(filter);

    if (typeof context.createStereoPanner === "function") {
      const panner = context.createStereoPanner();
      panner.pan.setValueAtTime(Phaser.Math.Clamp(options.pan || 0, -1, 1), start);
      filter.connect(panner);
      lastNode = panner;
    }

    lastNode.connect(gain);
    gain.connect(this.sfxGainNode);

    osc.start(start);
    osc.stop(end + 0.03);

    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  private playNoise(options: {
    duration: number;
    volume: number;
    delayMs?: number;
    pan?: number;
    filterType?: BiquadFilterType;
    filterFreq?: number;
    playbackRate?: number;
  }) {
    if (!this.sfxUnlocked || !this.sfxGainNode) {
      return;
    }

    const { context } = this.getSfxContext();
    if (!context || context.state !== "running") {
      return;
    }

    if (!this.sfxNoiseBuffer || this.sfxNoiseBuffer.sampleRate !== context.sampleRate) {
      const noiseLength = Math.floor(context.sampleRate * 0.35);
      const buffer = context.createBuffer(1, noiseLength, context.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < noiseLength; index += 1) {
        channel[index] = Math.random() * 2 - 1;
      }
      this.sfxNoiseBuffer = buffer;
    }

    const start = context.currentTime + (options.delayMs || 0) / 1000;
    const duration = Math.max(0.02, options.duration);
    const end = start + duration;
    const source = context.createBufferSource();
    source.buffer = this.sfxNoiseBuffer;
    source.playbackRate.setValueAtTime(options.playbackRate ?? 1, start);

    const filter = context.createBiquadFilter();
    filter.type = options.filterType || "bandpass";
    filter.frequency.setValueAtTime(options.filterFreq ?? 900, start);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(options.volume, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    source.connect(filter);
    let lastNode: AudioNode = filter;

    if (typeof context.createStereoPanner === "function") {
      const panner = context.createStereoPanner();
      panner.pan.setValueAtTime(Phaser.Math.Clamp(options.pan || 0, -1, 1), start);
      filter.connect(panner);
      lastNode = panner;
    }

    lastNode.connect(gain);
    gain.connect(this.sfxGainNode);

    source.start(start);
    source.stop(end + 0.02);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  private playSfx(event: Match3SfxEvent, intensity: number = 1) {
    if (!this.sfxUnlocked) {
      return;
    }

    const strength = Phaser.Math.Clamp(intensity, 1, 4);

    if (event === "tap") {
      this.playTone({ freq: 780, toFreq: 840, duration: 0.03, volume: 0.04, type: "triangle" });
      return;
    }
    if (event === "queue") {
      this.playTone({ freq: 430, toFreq: 600, duration: 0.06, volume: 0.055, type: "square" });
      return;
    }
    if (event === "swap") {
      this.playTone({ freq: 360, toFreq: 510, duration: 0.075, volume: 0.09, pan: -0.1 });
      this.playTone({ freq: 420, toFreq: 580, duration: 0.055, volume: 0.06, delayMs: 24, pan: 0.12 });
      return;
    }
    if (event === "invalid") {
      this.playTone({ freq: 240, toFreq: 140, duration: 0.14, volume: 0.11, type: "sawtooth", filterFreq: 1400 });
      this.playNoise({ duration: 0.11, volume: 0.07, filterType: "highpass", filterFreq: 620 });
      return;
    }
    if (event === "match") {
      const base = 420 + strength * 34;
      this.playTone({ freq: base, toFreq: base + 95, duration: 0.09, volume: 0.085, type: "triangle", filterFreq: 3600 });
      return;
    }
    if (event === "combo") {
      const base = 500 + strength * 28;
      this.playTone({ freq: base, toFreq: base + 110, duration: 0.09, volume: 0.09, type: "square" });
      this.playTone({ freq: base + 120, toFreq: base + 250, duration: 0.08, volume: 0.085, delayMs: 55, type: "triangle" });
      return;
    }
    if (event === "specialSpawn") {
      this.playTone({ freq: 720, toFreq: 1080, duration: 0.12, volume: 0.095, type: "triangle", filterFreq: 4200 });
      this.playNoise({ duration: 0.09, volume: 0.05, delayMs: 24, filterType: "bandpass", filterFreq: 1800, playbackRate: 1.2 });
      return;
    }
    if (event === "specialSwap") {
      this.playTone({ freq: 160, toFreq: 220, duration: 0.14, volume: 0.1, type: "sawtooth", filterFreq: 1200 });
      this.playTone({ freq: 520, toFreq: 860, duration: 0.12, volume: 0.08, delayMs: 34, type: "square", filterFreq: 2400 });
      this.playNoise({ duration: 0.12, volume: 0.07, filterType: "bandpass", filterFreq: 760 });
      return;
    }
    if (event === "drop") {
      if (this.time.now - this.lastDropSfxAt < 85) {
        return;
      }
      this.lastDropSfxAt = this.time.now;
      this.playTone({ freq: 180, toFreq: 130, duration: 0.075, volume: 0.05, type: "triangle", filterFreq: 900 });
      return;
    }
    if (event === "reshuffle") {
      this.playTone({ freq: 300, toFreq: 460, duration: 0.1, volume: 0.08, type: "square" });
      this.playTone({ freq: 380, toFreq: 560, duration: 0.09, volume: 0.075, delayMs: 75, type: "triangle" });
      this.playTone({ freq: 460, toFreq: 680, duration: 0.09, volume: 0.07, delayMs: 142, type: "triangle" });
      return;
    }
    if (event === "thunder") {
      if (this.time.now - this.lastThunderSfxAt < 130) {
        return;
      }
      this.lastThunderSfxAt = this.time.now;
      this.playNoise({ duration: 0.2, volume: 0.095, filterType: "lowpass", filterFreq: 780, playbackRate: 0.78 });
      this.playTone({ freq: 150, toFreq: 90, duration: 0.18, volume: 0.075, type: "sawtooth", filterFreq: 600 });
      return;
    }
    if (event === "objective") {
      this.playTone({ freq: 510, toFreq: 780, duration: 0.13, volume: 0.095, type: "triangle" });
      this.playTone({ freq: 690, toFreq: 980, duration: 0.1, volume: 0.08, delayMs: 74, type: "triangle" });
      return;
    }
    if (event === "star") {
      this.playTone({ freq: 760, toFreq: 1120, duration: 0.11, volume: 0.09, type: "triangle", filterFreq: 4200 });
      return;
    }
    if (event === "fever") {
      this.playTone({ freq: 340, toFreq: 700, duration: 0.2, volume: 0.1, type: "square", filterFreq: 2600 });
      this.playNoise({ duration: 0.12, volume: 0.06, delayMs: 40, filterType: "bandpass", filterFreq: 2000, playbackRate: 1.15 });
      return;
    }
    if (event === "countdown") {
      this.playTone({ freq: 920, toFreq: 980, duration: 0.05, volume: 0.075, type: "square", filterFreq: 3200 });
      return;
    }
    if (event === "timeUp") {
      this.playTone({ freq: 260, toFreq: 120, duration: 0.21, volume: 0.11, type: "sawtooth", filterFreq: 1200 });
      this.playNoise({ duration: 0.1, volume: 0.05, delayMs: 20, filterType: "highpass", filterFreq: 540 });
      return;
    }
    if (event === "win") {
      this.playTone({ freq: 460, toFreq: 700, duration: 0.13, volume: 0.11, type: "square", filterFreq: 3200 });
      this.playTone({ freq: 620, toFreq: 960, duration: 0.14, volume: 0.1, delayMs: 110, type: "triangle", filterFreq: 4000 });
      this.playTone({ freq: 810, toFreq: 1260, duration: 0.15, volume: 0.095, delayMs: 215, type: "triangle", filterFreq: 4300 });
      return;
    }
    if (event === "lose") {
      this.playTone({ freq: 310, toFreq: 170, duration: 0.2, volume: 0.095, type: "sawtooth", filterFreq: 1300 });
      this.playTone({ freq: 240, toFreq: 120, duration: 0.22, volume: 0.085, delayMs: 85, type: "triangle", filterFreq: 900 });
    }
  }

  private handleTapSelection(cell: ICellPos) {
    if (this.busy || this.ended) {
      return;
    }

    if (!this.selectedCell) {
      this.setSelected(cell);
      return;
    }

    if (isSamePos(this.selectedCell, cell)) {
      this.setSelected(null);
      return;
    }

    if (isAdjacent(this.selectedCell, cell)) {
      const from = this.selectedCell;
      this.setSelected(null);
      void this.requestSwap(from, cell);
      return;
    }

    this.setSelected(cell);
  }

  private setSelected(cell: ICellPos | null) {
    this.selectedCell = cell;

    if (!cell || !this.selectionRect) {
      this.selectionRect?.setVisible(false);
      return;
    }

    const world = this.cellToWorld(cell.row, cell.col);
    this.selectionRect
      .setPosition(world.x, world.y)
      .setVisible(true);
  }

  private pulseCellPress(cellPos: ICellPos) {
    const cell = this.board[cellPos.row][cellPos.col];
    if (!cell) {
      return;
    }

    this.tweens.add({
      targets: cell.sprite,
      scaleX: cell.baseScaleX * 1.08,
      scaleY: cell.baseScaleY * 0.84,
      duration: 78,
      yoyo: true,
      ease: "Sine.Out",
    });
  }

  private startTimer() {
    if (this.timerEvent) return;
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.ended || this.tutorialActive) {
          return;
        }

        this.timeLeft = Math.max(0, this.timeLeft - 1);
        this.elapsedSeconds += 1;
        this.updateHud();

        if (this.timeLeft <= 5 && this.timeLeft > 0 && this.timeLeft !== this.lastCountdownSecond) {
          this.lastCountdownSecond = this.timeLeft;
          this.playSfx("countdown");
        }

        if (this.timeLeft <= 0) {
          this.playSfx("timeUp");
          this.handleTimeExpired();
        }
      },
    });
  }

  private calculateCatnipEarned(isTargetReached: boolean) {
    const scoreProgress = this.level.targetScore
      ? Math.min(1, this.score / this.level.targetScore)
      : 0;
    const objectiveProgress = this.objectiveTarget
      ? Math.min(1, this.objectiveCollected / this.objectiveTarget)
      : 1;
    const blendedProgress = Math.min(1, scoreProgress * 0.75 + objectiveProgress * 0.25);

    let earned = Math.round(this.level.catnipCap * blendedProgress);
    if (isTargetReached) {
      earned = Math.max(earned, Math.round(this.level.catnipCap * 0.7));
    }
    if (this.starsEarned >= 3) {
      earned = this.level.catnipCap;
    }

    return Math.max(0, Math.min(this.level.catnipCap, earned));
  }

  private finishGame() {
    if (this.ended) {
      return;
    }

    this.ended = true;
    this.busy = true;
    this.swapQueue = [];

    if (this.timerEvent) {
      this.timerEvent.remove(false);
      this.timerEvent = undefined;
    }

    this.setSelected(null);
    this.clearHintPulse();
    const isTargetReached = this.score >= this.level.targetScore;
    const catnipEarned = this.calculateCatnipEarned(isTargetReached);
    this.persistRunOutcome(isTargetReached);
    const progress = this.level.targetScore ? this.score / this.level.targetScore : 0;
    if (isTargetReached) {
      this.setHudText("combo", `PURR-FECT +${catnipEarned} CATNIP`);
      this.playSfx("win");
    } else if (progress >= 0.8) {
      this.setHudText("combo", "SO CLOSE • RUN IT BACK");
      this.playSfx("lose");
    } else {
      this.setHudText("combo", `RUN COMPLETE +${catnipEarned} CATNIP`);
      this.playSfx("lose");
    }
    this.feverText?.setVisible(false);

    announce(
      MATCH3_GAME_ID,
      isTargetReached
        ? `Level cleared. ${Math.floor(this.score)} points, ${catnipEarned} catnip.`
        : `Time is up. ${Math.floor(this.score)} of ${this.level.targetScore} points, ${catnipEarned} catnip.`,
      "assertive",
    );

    GameEvents.GAME_STOP.push({
      score: catnipEarned,
      // Streak, star and last-chance bonuses push timeLeft past the limit, so
      // the limit minus timeLeft can go negative. Save the seconds played.
      time: getMatch3RunTime(this.elapsedSeconds),
      completedLevel: isTargetReached ? this.level.id : null,
      rawScore: Math.max(0, Math.floor(this.score)),
      catnipEarned,
      // A Paw Match run only ends on the clock: the goal reached, or the time ran out (plan F6).
      outcome: isTargetReached ? "won" : "timeout",
    });
  }

  private updateHud() {
    this.levelBestScore = Math.max(this.levelBestScore, Math.floor(this.score));
    this.updateStars();
    this.setHudText("timer", `TIME ${this.timeLeft}`);
    this.setHudText("score", `SCORE ${this.score}`);
    this.setHudText("best", `BEST ${this.levelBestScore}`);
    this.setHudText("target", `GOAL ${this.level.targetScore}`);
    this.setHudText("moves", `MOVES ${this.moves}`);
    const dayStreak = this.retentionState?.dayStreak || 1;
    const winStreak = this.retentionState?.winStreak || 0;
    this.fitHud("streak", this.getStreakHudSegments(dayStreak, winStreak));

    if (this.missionText) {
      if (this.bonusMission) {
        const missionIndex = Math.min(BONUS_MISSION_LIMIT, this.completedMissionIds.size + 1);
        const missionName = this.bonusMission.label.replace(/^BONUS:\s*/, "");
        this.setHudText(
          "mission",
          `BONUS ${missionIndex}/${BONUS_MISSION_LIMIT} • ${missionName} ${this.bonusMission.progress}/${this.bonusMission.target}`,
        );
      } else {
        this.setHudText(
          "mission",
          this.completedMissionIds.size >= BONUS_MISSION_LIMIT
            ? "BONUS MISSIONS CLEARED"
            : "BONUS: STAY SHARP",
        );
      }
    }

    const scoreProgress = this.level.targetScore
      ? this.score / this.level.targetScore
      : 0;
    const objectiveProgress = this.objectiveTarget
      ? this.objectiveCollected / this.objectiveTarget
      : 1;

    const overallProgress = Math.max(
      0,
      Math.min(
        100,
        Math.round((Math.min(1, scoreProgress) * 0.8 + Math.min(1, objectiveProgress) * 0.2) * 100),
      ),
    );
    const overallProgress01 = overallProgress / 100;
    const progressColor = this.feverActive
      ? 0xfb7185
      : overallProgress01 >= 1
        ? 0x4ade80
        : overallProgress01 >= 0.66
          ? 0xf59e0b
          : 0x34d399;

    this.progressBarFill?.setScale(Math.max(0.02, overallProgress01), 1);
    this.progressBarFill?.setFillStyle(progressColor, 0.94);
    this.progressBarGlow?.setScale(Math.max(0.02, overallProgress01), 1);
    this.progressBarGlow?.setFillStyle(
      this.feverActive ? 0xfda4af : overallProgress01 >= 1 ? 0x86efac : 0xfef08a,
      0.42,
    );
    if (this.objectiveIcon && this.objectiveIcon.texture.key !== this.objectiveIconKey()) {
      this.objectiveIcon.setTexture(this.objectiveIconKey());
      const size = this.layout.objectiveIcon.size;
      this.objectiveIcon.setDisplaySize(size, size);
    }
    this.setHudText(
      "objective",
      `GOAL ${TILE_LABEL_BY_TYPE[this.objectiveType]} ${this.objectiveCollected}/${this.objectiveTarget}`,
    );
    this.setHudText(
      "stars",
      `STARS ${"★".repeat(this.starsEarned)}${"☆".repeat(Math.max(0, 3 - this.starsEarned))}`,
    );
    const catnipPreview = this.calculateCatnipEarned(this.score >= this.level.targetScore);
    const rewardColor =
      catnipPreview >= this.level.catnipCap
        ? "#86efac"
        : catnipPreview >= Math.round(this.level.catnipCap * 0.7)
          ? "#fef08a"
          : "#fde68a";
    this.setHudText("reward", `CATNIP ${catnipPreview}/${this.level.catnipCap}`);
    this.rewardText?.setColor(rewardColor);

    if (!this.feverActive && !this.ended) {
      const shouldEnterFever =
        this.timeLeft <= FEVER_SECONDS_THRESHOLD && scoreProgress >= this.level.feverProgressGate;
      if (shouldEnterFever) {
        this.activateFeverMode();
      }
    }

    GameEvents.GAME_PROGRESS_UPDATE.push({ progress: overallProgress });

    if (this.timeLeft <= 10 && !this.ended) {
      this.timerText?.setColor(this.feverActive ? "#fef08a" : "#fca5a5");
    } else {
      this.timerText?.setColor("#fef3c7");
    }
  }

  private getComboBurstLabel(message: string) {
    if (message.includes("MEGA")) {
      return Phaser.Utils.Array.GetRandom([
        "MEGA COMBO!",
        "WILDEST CHAIN!",
        "BOARD SHOCK!",
      ]);
    }
    if (message.includes("FEVER")) {
      return Phaser.Utils.Array.GetRandom(["FEVER RUSH!", "HOT STREAK!", "FLAME MODE!"]);
    }
    if (message.includes("SPECIAL")) {
      return Phaser.Utils.Array.GetRandom(["SPECIAL HIT!", "POWER SURGE!", "SHOCK CHAIN!"]);
    }
    if (message.includes("OBJECTIVE")) {
      return "GOAL CRUSHED!";
    }
    if (message.includes("STAR")) {
      return "STAR UP!";
    }
    if (message.includes("PURR-FECT")) {
      return "PURR-FECT!";
    }
    return message;
  }

  private resolveComboMessageStyle(message: string) {
    if (message.includes("NO MATCH")) {
      return {
        color: "#fca5a5",
        stroke: "#3f1010",
        shadow: "#2b0a0a",
        pulseScale: 1.05,
        pulseDuration: 150,
        burstIntensity: 0,
      };
    }
    if (message.includes("TRY THIS") || message.includes("SWIPE") || message.includes("FOLLOW")) {
      return {
        color: "#fde68a",
        stroke: "#4a2b12",
        shadow: "#2f1a08",
        pulseScale: 1.06,
        pulseDuration: 150,
        burstIntensity: 0,
      };
    }
    if (message.includes("FEVER") || message.includes("MEGA")) {
      return {
        color: "#fca5a5",
        stroke: "#6b0828",
        shadow: "#4a0620",
        pulseScale: 1.14,
        pulseDuration: 180,
        burstIntensity: 3,
      };
    }
    if (message.includes("COMBO") || message.includes("SPECIAL")) {
      return {
        color: "#fdba74",
        stroke: "#61320f",
        shadow: "#3a1f07",
        pulseScale: 1.12,
        pulseDuration: 170,
        burstIntensity: 2,
      };
    }
    if (message.includes("STAR") || message.includes("PURR-FECT") || message.includes("OBJECTIVE")) {
      return {
        color: "#fef08a",
        stroke: "#5d420f",
        shadow: "#3e2a0a",
        pulseScale: 1.1,
        pulseDuration: 160,
        burstIntensity: 1,
      };
    }
    return {
      color: "#fcd34d",
      stroke: "#4a2b12",
      shadow: "#2f1a08",
      pulseScale: 1.07,
      pulseDuration: 140,
      burstIntensity: 0,
    };
  }

  private spawnComboAura(color: number, intensity: number) {
    const centerX = this.boardStartX + this.boardWidth / 2;
    const centerY = this.boardStartY + this.boardHeight / 2;
    const aura = this.add
      .ellipse(
        centerX,
        centerY,
        this.boardWidth * 0.42,
        this.boardHeight * 0.38,
        color,
        0.32 + intensity * 0.07,
      )
      .setDepth(74)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: aura,
      alpha: 0,
      scaleX: 1.95 + intensity * 0.16,
      scaleY: 1.75 + intensity * 0.14,
      duration: 290 + intensity * 55,
      ease: "Quad.Out",
      onComplete: () => aura.destroy(),
    });
  }

  private spawnSparkStorm(count: number, palette: SparkPalette, spreadMultiplier: number) {
    for (let index = 0; index < count; index += 1) {
      const row = Phaser.Math.Between(0, BOARD_ROWS - 1);
      const col = Phaser.Math.Between(0, BOARD_COLS - 1);
      this.spawnSparkles(
        { row, col },
        Phaser.Math.Between(2, 4),
        {
          palette,
          spreadMultiplier,
          durationMin: 320,
          durationMax: 510,
          depth: 68,
        },
      );
    }
  }

  private spawnLightningSweep(color: number, intensity: number, offset: number) {
    const left = this.boardStartX - 8;
    const right = this.boardStartX + this.boardWidth + 8;
    const startY = this.boardStartY + Phaser.Math.Between(0, this.boardHeight);
    const endY = Phaser.Math.Clamp(
      startY + Phaser.Math.Between(-this.tileSize * 2, this.tileSize * 2),
      this.boardStartY,
      this.boardStartY + this.boardHeight,
    );

    const points: Array<{ x: number; y: number }> = [];
    const segments = 8;
    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      points.push({
        x: Phaser.Math.Linear(left, right, t),
        y:
          Phaser.Math.Linear(startY, endY, t) +
          Phaser.Math.Between(-Math.floor(this.tileSize * 0.35), Math.floor(this.tileSize * 0.35)),
      });
    }

    const glow = this.add.graphics().setDepth(72 + offset * 0.02).setBlendMode(Phaser.BlendModes.ADD);
    glow.lineStyle(6 + intensity * 1.6, 0xffffff, 0.34);
    glow.beginPath();
    glow.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      glow.lineTo(points[index].x, points[index].y);
    }
    glow.strokePath();

    const bolt = this.add.graphics().setDepth(72.2 + offset * 0.02).setBlendMode(Phaser.BlendModes.ADD);
    bolt.lineStyle(2 + intensity, color, 0.95);
    bolt.beginPath();
    bolt.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      bolt.lineTo(points[index].x, points[index].y);
    }
    bolt.strokePath();

    this.tweens.add({
      targets: [glow, bolt],
      alpha: 0,
      duration: 140 + intensity * 26,
      ease: "Quad.Out",
      onComplete: () => {
        glow.destroy();
        bolt.destroy();
      },
    });
  }

  private triggerThunderAcrossBoard(intensity: number = 1, color: number = 0xa5f3fc) {
    const now = this.time.now;
    if (now < this.nextThunderAt) {
      return;
    }
    this.nextThunderAt = now + THUNDER_COOLDOWN_MS;
    this.playSfx("thunder", intensity);

    const sweeps = Math.min(4, 2 + intensity);
    for (let index = 0; index < sweeps; index += 1) {
      this.time.delayedCall(index * 36, () => {
        if (this.ended) {
          return;
        }
        this.spawnLightningSweep(color, intensity, index);
      });
    }

    this.spawnSparkStorm(2 + intensity, "electric", 1.22 + intensity * 0.08);
    this.triggerBoardFlash(color, Math.min(0.42, 0.18 + intensity * 0.08), 160 + intensity * 44);
    this.shakeCamera(85 + intensity * 42, 0.0018 + intensity * 0.0008);
  }

  private setComboMessage(message: string) {
    // One message at a time (plan G14): while the tutorial plate shows, the combo line, its
    // bursts and the mission line stay hidden; completion restores them.
    if (this.tutorialActive) return;
    const style = this.resolveComboMessageStyle(message);
    this.setHudText("combo", message);
    this.comboText?.setColor(style.color);
    // Outline scales with the slot size: a fixed 5 px stroke fills in 13 px Bebas counters.
    const comboStroke = Math.max(2, Math.round((this.layout?.slots.combo.size ?? 24) * 0.2));
    this.comboText?.setStroke(style.stroke, comboStroke);
    this.comboText?.setShadow(0, 2, style.shadow, 4, true, true);

    if (!this.comboText) {
      return;
    }

    this.tweens.killTweensOf(this.comboText);
    this.comboText.setScale(1).setAngle(0);
    this.tweens.add({
      targets: this.comboText,
      scale: style.pulseScale,
      duration: style.pulseDuration,
      yoyo: true,
      ease: "Sine.Out",
    });

    const shouldBurst = /(COMBO|SPECIAL|MEGA|FEVER|STAR|OBJECTIVE|LAST CHANCE|PURR-FECT)/.test(
      message,
    );
    if (shouldBurst && this.comboBurstText) {
      const burstLabel = this.getComboBurstLabel(message);
      this.tweens.killTweensOf(this.comboBurstText);
      this.setHudText("burst", burstLabel);
      this.comboBurstText
        .setVisible(true)
        .setAlpha(0)
        .setScale(0.74)
        .setColor(style.color)
        .setStroke(style.stroke, Math.max(3, Math.round((this.layout?.slots.burst.size ?? 34) * 0.2)))
        .setShadow(0, 0, style.shadow, 14, true, true);

      this.spawnComboAura(
        Phaser.Display.Color.HexStringToColor(style.color).color,
        style.burstIntensity || 1,
      );
      this.spawnSparkStorm(
        Math.max(2, 2 + style.burstIntensity),
        message.includes("FEVER") || message.includes("MEGA") ? "electric" : "warm",
        1.08 + style.burstIntensity * 0.08,
      );

      if (style.burstIntensity >= 3) {
        this.triggerThunderAcrossBoard(3, 0xa5f3fc);
      } else if (message.includes("SPECIAL CHAIN") || message.includes("LAST CHANCE")) {
        this.triggerThunderAcrossBoard(2, 0xc4b5fd);
      }

      this.tweens.add({
        targets: this.comboBurstText,
        alpha: 1,
        scale: 1.22,
        angle: Phaser.Math.Between(-2, 2),
        duration: 180,
        ease: "Back.Out",
        yoyo: true,
        hold: 150 + style.burstIntensity * 36,
        onComplete: () => {
          this.comboBurstText?.setVisible(false);
        },
      });
    }
  }

  private showLevelObjectiveNudge() {
    const objectiveLabel = TILE_LABEL_BY_TYPE[this.objectiveType];
    this.setComboMessage(`COLLECT ${objectiveLabel} x${this.objectiveTarget}`);

    const resetMessageTimer = this.time.delayedCall(LEVEL_GOAL_NUDGE_MS, () => {
      if (!this.ended && !this.tutorialActive) {
        this.setComboMessage("SWIPE TO MATCH");
      }
    });

    this.cleanupFns.push(() => {
      resetMessageTimer.remove(false);
    });
  }

  private playSwapSquish(
    first: IMatch3Cell,
    second: IMatch3Cell,
    from: ICellPos,
    to: ICellPos,
  ) {
    const horizontal = from.row === to.row;
    const stretchX = horizontal ? SWAP_SQUISH_FACTOR : SWAP_SQUASH_FACTOR;
    const stretchY = horizontal ? SWAP_SQUASH_FACTOR : SWAP_SQUISH_FACTOR;

    [first, second].forEach((cell) => {
      this.tweens.add({
        targets: cell.sprite,
        scaleX: cell.baseScaleX * stretchX,
        scaleY: cell.baseScaleY * stretchY,
        duration: 95,
        yoyo: true,
        ease: "Sine.InOut",
      });
    });
  }

  private playImpactSquish(cell: IMatch3Cell) {
    this.tweens.add({
      targets: cell.sprite,
      scaleX: cell.baseScaleX * 1.2,
      scaleY: cell.baseScaleY * 0.78,
      duration: 85,
      yoyo: true,
      ease: "Back.Out",
    });
  }

  private randomTileType(exclude: Match3TileType[] = []): Match3TileType {
    const sourcePool = this.allowedTypes.length ? this.allowedTypes : TILE_TYPES;
    const allowed = sourcePool.filter((type) => !exclude.includes(type));
    const pool = allowed.length ? allowed : sourcePool;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private createInitialTypeBoard(): Match3TileType[][] {
    const board: Match3TileType[][] = Array.from({ length: BOARD_ROWS }, () =>
      Array.from({ length: BOARD_COLS }, () => TILE_TYPES[0]),
    );

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const excluded: Match3TileType[] = [];
        const left1 = col > 0 ? board[row][col - 1] : null;
        const left2 = col > 1 ? board[row][col - 2] : null;
        const top1 = row > 0 ? board[row - 1][col] : null;
        const top2 = row > 1 ? board[row - 2][col] : null;

        if (left1 && left1 === left2) {
          excluded.push(left1);
        }
        if (top1 && top1 === top2) {
          excluded.push(top1);
        }

        board[row][col] = this.randomTileType(excluded);
      }
    }

    if (!this.hasPossibleMoveInTypes(board)) {
      return this.createInitialTypeBoard();
    }

    return board;
  }

  private hasPossibleMoveInTypes(typeBoard: Match3TileType[][]): boolean {
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const right = col + 1;
        const down = row + 1;

        if (right < BOARD_COLS) {
          const swapped = cloneTypeBoard(typeBoard);
          const temp = swapped[row][col];
          swapped[row][col] = swapped[row][right];
          swapped[row][right] = temp;
          if (this.hasTypeMatches(swapped)) {
            return true;
          }
        }

        if (down < BOARD_ROWS) {
          const swapped = cloneTypeBoard(typeBoard);
          const temp = swapped[row][col];
          swapped[row][col] = swapped[down][col];
          swapped[down][col] = temp;
          if (this.hasTypeMatches(swapped)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private hasTypeMatches(typeBoard: Match3TileType[][]): boolean {
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      let streak = 1;
      for (let col = 1; col < BOARD_COLS; col += 1) {
        if (typeBoard[row][col] === typeBoard[row][col - 1]) {
          streak += 1;
          if (streak >= 3) {
            return true;
          }
        } else {
          streak = 1;
        }
      }
    }

    for (let col = 0; col < BOARD_COLS; col += 1) {
      let streak = 1;
      for (let row = 1; row < BOARD_ROWS; row += 1) {
        if (typeBoard[row][col] === typeBoard[row - 1][col]) {
          streak += 1;
          if (streak >= 3) {
            return true;
          }
        } else {
          streak = 1;
        }
      }
    }

    return false;
  }

  /** Builds the board; resolves when the drop has landed (at once when `fromTop` is false). */
  private buildBoardFromTypes(typeBoard: Match3TileType[][], fromTop: boolean): Promise<void> {
    fromTop = fromTop && !this.reducedMotion;
    this.destroyBoard();

    this.board = Array.from({ length: BOARD_ROWS }, () =>
      Array.from({ length: BOARD_COLS }, () => null),
    );

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        const spawnRows = fromTop ? row + 2 : 0;
        const cell = this.createCell(row, col, typeBoard[row][col], undefined, spawnRows);
        this.board[row][col] = cell;
      }
    }

    if (fromTop) {
      const promises: Array<Promise<void>> = [];
      this.board.forEach((row) => {
        row.forEach((cell) => {
          if (cell) {
            promises.push(this.animateCellTo(cell, DROP_MS, "drop"));
          }
        });
      });

      return Promise.all(promises).then(() => undefined);
    }
    return Promise.resolve();
  }

  private destroyBoard() {
    this.board.forEach((row) => {
      row.forEach((cell) => {
        if (cell) {
          cell.field?.destroy();
          cell.sprite.destroy();
          cell.marker?.destroy();
        }
      });
    });
    this.board = [];
  }

  private createCell(
    row: number,
    col: number,
    type: Match3TileType,
    power?: TilePower,
    spawnOffsetRows: number = 0,
  ): IMatch3Cell {
    const pos = this.cellToWorld(row, col);
    const sprite = this.add
      .image(pos.x, pos.y - spawnOffsetRows * this.tileSize, TILE_KEY_BY_TYPE[type])
      .setDepth(20)
      .setDisplaySize(this.tileIconSize, this.tileIconSize)
      .setAlpha(spawnOffsetRows ? 0.74 : 1);

    const cell: IMatch3Cell = {
      id: nextTileId(),
      type,
      power,
      row,
      col,
      baseScaleX: sprite.scaleX,
      baseScaleY: sprite.scaleY,
      sprite,
    };

    this.applyPowerVisual(cell);
    return cell;
  }

  private getSpecialFieldVisual(power: TilePower) {
    if (power === "ROW") {
      return {
        fill: 0x67e8f9,
        stroke: 0x38bdf8,
        marker: "row" as const,
        tint: 0x7dd3fc,
        alpha: 0.22,
      };
    }
    if (power === "COL") {
      return {
        fill: 0x93c5fd,
        stroke: 0x60a5fa,
        marker: "col" as const,
        tint: 0x93c5fd,
        alpha: 0.22,
      };
    }
    if (power === "BOMB") {
      return {
        fill: 0xfda4af,
        stroke: 0xfb7185,
        marker: "burst" as const,
        tint: 0xfca5a5,
        alpha: 0.24,
      };
    }

    return {
      fill: 0xfef08a,
      stroke: 0xfacc15,
      marker: "star" as const,
      tint: 0xfef08a,
      alpha: 0.26,
    };
  }

  private applyPowerVisual(cell: IMatch3Cell) {
    cell.marker?.destroy();
    cell.marker = undefined;

    if (cell.field) {
      this.tweens.killTweensOf(cell.field);
    }
    this.tweens.killTweensOf(cell.sprite);
    cell.sprite.clearTint();
    if (!cell.power) {
      cell.sprite.setAlpha(1);
      cell.field?.setVisible(false).setAlpha(0).setScale(1).setAngle(0);
      return;
    }

    if (!cell.field) {
      cell.field = this.add
        .rectangle(
          cell.sprite.x,
          cell.sprite.y,
          Math.floor(this.tileSize * 0.78),
          Math.floor(this.tileSize * 0.78),
        )
        .setDepth(18.5)
        .setBlendMode(Phaser.BlendModes.SCREEN);
    }
    const fieldVisual = this.getSpecialFieldVisual(cell.power);

    cell.field
      .setVisible(true)
      .setPosition(cell.sprite.x, cell.sprite.y)
      .setFillStyle(fieldVisual.fill, fieldVisual.alpha)
      .setStrokeStyle(2, fieldVisual.stroke, 0.8)
      .setAngle(0)
      .setAlpha(0.92);

    cell.sprite.setTint(fieldVisual.tint);

    cell.marker = this.drawPowerMarker(fieldVisual.marker)
      .setPosition(cell.sprite.x + this.markerOffset, cell.sprite.y - this.markerOffset)
      .setDepth(24);

    this.tweens.add({
      targets: cell.field,
      alpha: 0.55,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    this.tweens.add({
      targets: cell.sprite,
      alpha: 0.76,
      duration: 430,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }

  /**
   * A special-tile badge (plan G14 "texture arrows for special tiles"): a cream disc with a dark
   * arrow pair, burst or star, rasterised once per kind and size into a texture at the canvas pixel
   * ratio, then drawn 1:1. No font is involved (the old badge was a font glyph, plan G12).
   * The image sits in a container at scale 1, so the existing tweens (scale, alpha, angle) keep
   * their CSS-px meaning.
   */
  private drawPowerMarker(kind: "row" | "col" | "burst" | "star") {
    const r = Math.max(5, Math.floor(this.tileSize * 0.15));
    const dpr = getCanvasPixelRatio(this);
    const key = `match3-marker-${kind}-${r}-${dpr}`;
    if (!this.textures.exists(key)) {
      const size = Math.ceil((2 * r + 2) * dpr);
      const g = this.add.graphics().setVisible(false);
      this.paintPowerMarker(g, kind, r * dpr, size / 2);
      g.generateTexture(key, size, size);
      g.destroy();
      this.textures.get(key)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    const image = this.add.image(0, 0, key).setScale(1 / dpr);
    return this.add.container(0, 0, [image]);
  }

  /** Draws the badge centred on (c, c) with radius `r` (texture pixels). */
  private paintPowerMarker(g: Phaser.GameObjects.Graphics, kind: "row" | "col" | "burst" | "star", r: number, c: number) {
    g.fillStyle(0xfef3c7, 1).fillCircle(c, c, r);
    g.lineStyle(Math.max(1, r * 0.18), 0x111827, 1).strokeCircle(c, c, r);
    g.fillStyle(0x111827, 1);
    const arm = r * 0.62;
    const head = r * 0.32;
    if (kind === "row" || kind === "col") {
      const horizontal = kind === "row";
      const p = (a: number, b: number) => (horizontal ? { x: c + a, y: c + b } : { x: c + b, y: c + a });
      g.fillRect(
        c + (horizontal ? -arm + head : -r * 0.09),
        c + (horizontal ? -r * 0.09 : -arm + head),
        horizontal ? 2 * (arm - head) : r * 0.18,
        horizontal ? r * 0.18 : 2 * (arm - head),
      );
      [-1, 1].forEach((dir) => {
        const tip = p(dir * arm, 0);
        const back1 = p(dir * (arm - head), -head);
        const back2 = p(dir * (arm - head), head);
        g.fillTriangle(tip.x, tip.y, back1.x, back1.y, back2.x, back2.y);
      });
    } else {
      const points = kind === "star" ? 5 : 4;
      const outer = r * 0.72;
      const inner = kind === "star" ? outer * 0.45 : outer * 0.32;
      const vertices: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < points * 2; i += 1) {
        const angle = -Math.PI / 2 + (i * Math.PI) / points;
        const radius = i % 2 === 0 ? outer : inner;
        vertices.push(new Phaser.Math.Vector2(c + Math.cos(angle) * radius, c + Math.sin(angle) * radius));
      }
      g.fillPoints(vertices, true);
    }
  }

  private cellToWorld(row: number, col: number) {
    return {
      x: this.boardStartX + col * this.tileSize + this.tileSize / 2,
      y: this.boardStartY + row * this.tileSize + this.tileSize / 2,
    };
  }

  private worldToCell(x: number, y: number): ICellPos | null {
    const col = Math.floor((x - this.boardStartX) / this.tileSize);
    const row = Math.floor((y - this.boardStartY) / this.tileSize);

    if (!this.isValidCell(row, col)) {
      return null;
    }

    return { row, col };
  }

  private isValidCell(row: number, col: number) {
    return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;
  }

  private enqueueSwapIntent(from: ICellPos, to: ICellPos) {
    if (
      !this.isValidCell(from.row, from.col) ||
      !this.isValidCell(to.row, to.col) ||
      !isAdjacent(from, to)
    ) {
      return;
    }

    const nextIntent: ISwapIntent = {
      from: { row: from.row, col: from.col },
      to: { row: to.row, col: to.col },
    };
    const lastIntent = this.swapQueue[this.swapQueue.length - 1];
    const isDuplicate =
      !!lastIntent &&
      ((isSamePos(lastIntent.from, nextIntent.from) &&
        isSamePos(lastIntent.to, nextIntent.to)) ||
        (isSamePos(lastIntent.from, nextIntent.to) &&
          isSamePos(lastIntent.to, nextIntent.from)));

    if (isDuplicate) {
      return;
    }

    if (this.swapQueue.length >= SWAP_QUEUE_MAX) {
      this.swapQueue.shift();
    }

    this.swapQueue.push(nextIntent);
    this.playSfx("queue");
    this.setComboMessage(
      this.swapQueue.length > 1
        ? `MOVE QUEUED x${this.swapQueue.length}`
        : "MOVE QUEUED",
    );
  }

  private async drainSwapQueue() {
    if (this.drainingSwapQueue || this.ended) {
      return;
    }

    this.drainingSwapQueue = true;
    try {
      while (!this.ended && !this.busy && this.swapQueue.length > 0) {
        const nextIntent = this.swapQueue.shift();
        if (!nextIntent) {
          break;
        }
        if (
          !this.isValidCell(nextIntent.from.row, nextIntent.from.col) ||
          !this.isValidCell(nextIntent.to.row, nextIntent.to.col) ||
          !isAdjacent(nextIntent.from, nextIntent.to)
        ) {
          continue;
        }

        await this.performSwap(nextIntent.from, nextIntent.to);
      }
    } finally {
      this.drainingSwapQueue = false;
    }
  }

  private async requestSwap(from: ICellPos, to: ICellPos) {
    if (this.ended || this.introDropping) {
      return;
    }

    if (this.busy || this.drainingSwapQueue) {
      this.enqueueSwapIntent(from, to);
      return;
    }

    await this.performSwap(from, to);
    await this.drainSwapQueue();
  }

  private async performSwap(a: ICellPos, b: ICellPos) {
    if (this.busy || this.ended) {
      return;
    }

    if (this.tutorialActive && !this.isTutorialSwap(a, b)) {
      this.setTutorialMessage("wrong");
      this.pulseTutorialPrompt();
      return;
    }

    const first = this.board[a.row][a.col];
    const second = this.board[b.row][b.col];

    if (!first || !second) {
      return;
    }

    this.registerActivity();
    this.busy = true;

    this.swapBoardData(a, b);
    this.playSwapSquish(first, second, a, b);
    this.playSfx("swap");
    await Promise.all([
      this.animateCellTo(first, SWAP_MS, "swap"),
      this.animateCellTo(second, SWAP_MS, "swap"),
    ]);

    const hasSpecial = Boolean(first.power || second.power);
    if (hasSpecial) this.beginRunIfNeeded(true);
    const specialSwapResolved = await this.resolveSpecialSwap(first, second);
    if (specialSwapResolved) {
      this.moves += 1;
      this.updateHud();
      await this.resolveMatches();
      this.completeTutorialIfNeeded();
      this.busy = false;
      // The idle-hint clock restarts when the cascade ends, not when the swap began.
      this.registerActivity();
      if (!this.ended) {
        this.setComboMessage("MEGA CHAIN READY");
        this.playSfx("combo", 3);
      }
      return;
    }

    const matchInfo = this.collectMatchInfoFromBoard();
    if (!matchInfo.keys.size) {
      this.swapBoardData(b, a);
      this.playSwapSquish(first, second, b, a);
      await Promise.all([
        this.animateCellTo(first, SWAP_MS, "swap"),
        this.animateCellTo(second, SWAP_MS, "swap"),
      ]);
      await this.delay(INVALID_SWAP_PAUSE_MS);
      this.playImpactSquish(first);
      this.playImpactSquish(second);
      this.shakeCamera(90, 0.0015);
      this.busy = false;
      this.registerActivity();
      this.setComboMessage("NO MATCH");
      this.playSfx("invalid");
      return;
    }

    this.moves += 1;
    this.beginRunIfNeeded(true);
    this.updateHud();

    await this.resolveMatches(b);

    this.completeTutorialIfNeeded();
    this.busy = false;
    this.registerActivity();
    if (!this.ended) {
      this.setComboMessage("CHAIN READY");
      this.playSfx("combo", 2);
    }
  }

  private swapBoardData(a: ICellPos, b: ICellPos) {
    const first = this.board[a.row][a.col];
    const second = this.board[b.row][b.col];

    this.board[a.row][a.col] = second;
    this.board[b.row][b.col] = first;

    if (first) {
      first.row = b.row;
      first.col = b.col;
    }
    if (second) {
      second.row = a.row;
      second.col = a.col;
    }
  }

  private animateCellTo(
    cell: IMatch3Cell,
    duration: number,
    mode: "default" | "swap" | "drop" = "default",
  ): Promise<void> {
    const to = this.cellToWorld(cell.row, cell.col);
    const dx = to.x - cell.sprite.x;
    const dy = to.y - cell.sprite.y;

    if (mode === "drop") {
      this.tweens.add({
        targets: cell.sprite,
        scaleX: cell.baseScaleX * DROP_SQUASH_FACTOR,
        scaleY: cell.baseScaleY * DROP_STRETCH_FACTOR,
        duration: Math.max(70, Math.floor(duration * 0.46)),
        yoyo: true,
        ease: "Sine.InOut",
      });
    } else if (mode === "swap") {
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      this.tweens.add({
        targets: cell.sprite,
        scaleX: cell.baseScaleX * (horizontal ? SWAP_SQUISH_FACTOR : SWAP_SQUASH_FACTOR),
        scaleY: cell.baseScaleY * (horizontal ? SWAP_SQUASH_FACTOR : SWAP_SQUISH_FACTOR),
        duration: Math.max(65, Math.floor(duration * 0.5)),
        yoyo: true,
        ease: "Sine.InOut",
      });
    }

    if (cell.marker) {
      this.tweens.add({
        targets: cell.marker,
        x: to.x + this.markerOffset,
        y: to.y - this.markerOffset,
        alpha: 1,
        duration,
        ease: "Quad.Out",
      });
    }
    if (cell.field) {
      this.tweens.add({
        targets: cell.field,
        x: to.x,
        y: to.y,
        duration,
        ease: "Quad.Out",
      });
    }

    return new Promise((resolve) => {
      this.tweens.add({
        targets: cell.sprite,
        x: to.x,
        y: to.y,
        alpha: 1,
        duration,
        ease: "Quad.Out",
        onComplete: () => {
          if (mode === "drop") {
            this.tweens.add({
              targets: cell.sprite,
              scaleX: cell.baseScaleX * LAND_BOUNCE_FACTOR,
              scaleY: cell.baseScaleY * DROP_SQUASH_FACTOR,
              duration: 90,
              yoyo: true,
              ease: "Back.Out",
              onComplete: () => resolve(),
            });
            return;
          }
          resolve();
        },
      });
    });
  }

  private collectMatchInfoFromBoard(): IMatchInfo {
    const keys = new Set<string>();
    const lines: IMatchLine[] = [];

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      let startCol = 0;
      while (startCol < BOARD_COLS) {
        const start = this.board[row][startCol];
        if (!start) {
          startCol += 1;
          continue;
        }

        let endCol = startCol + 1;
        while (
          endCol < BOARD_COLS &&
          this.board[row][endCol] &&
          this.board[row][endCol]?.type === start.type
        ) {
          endCol += 1;
        }

        if (endCol - startCol >= 3) {
          const cells: ICellPos[] = [];
          for (let col = startCol; col < endCol; col += 1) {
            cells.push({ row, col });
            keys.add(getPosKey(row, col));
          }
          lines.push({ cells, orientation: "row" });
        }

        startCol = endCol;
      }
    }

    for (let col = 0; col < BOARD_COLS; col += 1) {
      let startRow = 0;
      while (startRow < BOARD_ROWS) {
        const start = this.board[startRow][col];
        if (!start) {
          startRow += 1;
          continue;
        }

        let endRow = startRow + 1;
        while (
          endRow < BOARD_ROWS &&
          this.board[endRow][col] &&
          this.board[endRow][col]?.type === start.type
        ) {
          endRow += 1;
        }

        if (endRow - startRow >= 3) {
          const cells: ICellPos[] = [];
          for (let row = startRow; row < endRow; row += 1) {
            cells.push({ row, col });
            keys.add(getPosKey(row, col));
          }
          lines.push({ cells, orientation: "col" });
        }

        startRow = endRow;
      }
    }

    return { keys, lines };
  }

  private pickMostFrequentType(): Match3TileType | null {
    const counter = new Map<Match3TileType, number>();

    this.board.forEach((row) => {
      row.forEach((cell) => {
        if (!cell || cell.power === "RAINBOW") {
          return;
        }
        counter.set(cell.type, (counter.get(cell.type) || 0) + 1);
      });
    });

    let winner: Match3TileType | null = null;
    let bestCount = 0;

    Array.from(counter.entries()).forEach(([type, count]) => {
      if (count > bestCount) {
        winner = type;
        bestCount = count;
      }
    });

    return winner;
  }

  private expandSpecialClear(baseKeys: Set<string>): Set<string> {
    const clearKeys = new Set<string>(baseKeys);
    const queue = Array.from(clearKeys);
    const visited = new Set<string>();

    while (queue.length > 0) {
      const key = queue.shift();
      if (!key || visited.has(key)) {
        continue;
      }

      visited.add(key);
      const pos = parsePosKey(key);
      const cell = this.board[pos.row][pos.col];

      if (!cell?.power) {
        continue;
      }

      const addPos = (row: number, col: number) => {
        if (!this.isValidCell(row, col)) {
          return;
        }
        const targetKey = getPosKey(row, col);
        if (!clearKeys.has(targetKey)) {
          clearKeys.add(targetKey);
          queue.push(targetKey);
        }
      };

      if (cell.power === "ROW") {
        for (let col = 0; col < BOARD_COLS; col += 1) {
          addPos(pos.row, col);
        }
      }

      if (cell.power === "COL") {
        for (let row = 0; row < BOARD_ROWS; row += 1) {
          addPos(row, pos.col);
        }
      }

      if (cell.power === "BOMB") {
        for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
          for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
            addPos(pos.row + rowOffset, pos.col + colOffset);
          }
        }
      }

      if (cell.power === "RAINBOW") {
        const dominantType = this.pickMostFrequentType();
        if (!dominantType) {
          continue;
        }

        for (let row = 0; row < BOARD_ROWS; row += 1) {
          for (let col = 0; col < BOARD_COLS; col += 1) {
            const target = this.board[row][col];
            if (target?.type === dominantType) {
              addPos(row, col);
            }
          }
        }
      }
    }

    return clearKeys;
  }

  private chooseSpecialCreation(
    lines: IMatchLine[],
    preferred?: ICellPos,
  ): ISpecialCreation | null {
    const overlapMap = new Map<string, number>();

    lines.forEach((line) => {
      line.cells.forEach((cell) => {
        const key = getPosKey(cell.row, cell.col);
        overlapMap.set(key, (overlapMap.get(key) || 0) + 1);
      });
    });

    const overlaps = Array.from(overlapMap.entries())
      .filter(([, count]) => count >= 2)
      .map(([key]) => parsePosKey(key));

    if (overlaps.length > 0) {
      const chosen =
        overlaps.find((cell) => preferred && isSamePos(cell, preferred)) || overlaps[0];
      return {
        pos: chosen,
        power: "BOMB",
      };
    }

    const lineFivePlus = lines
      .filter((line) => line.cells.length >= 5)
      .sort((a, b) => b.cells.length - a.cells.length)[0];

    if (lineFivePlus) {
      const chosen =
        lineFivePlus.cells.find(
          (cell) => preferred && isSamePos(cell, preferred),
        ) || lineFivePlus.cells[Math.floor(lineFivePlus.cells.length / 2)];

      return {
        pos: chosen,
        power: "RAINBOW",
      };
    }

    const lineFour = lines.find((line) => line.cells.length === 4);
    if (lineFour) {
      const chosen =
        lineFour.cells.find((cell) => preferred && isSamePos(cell, preferred)) ||
        lineFour.cells[lineFour.cells.length - 1];

      return {
        pos: chosen,
        power: lineFour.orientation === "row" ? "ROW" : "COL",
      };
    }

    return null;
  }

  private async resolveMatches(preferred?: ICellPos) {
    let combo = 0;
    let activePreferred = preferred;

    while (!this.ended) {
      const matchInfo = this.collectMatchInfoFromBoard();
      if (!matchInfo.keys.size) {
        break;
      }

      combo += 1;
      const special = this.chooseSpecialCreation(matchInfo.lines, activePreferred);
      const clearSet = this.expandSpecialClear(matchInfo.keys);

      if (special) {
        clearSet.delete(getPosKey(special.pos.row, special.pos.col));
      }

      const clearCells = Array.from(clearSet).map((key) => parsePosKey(key));
      const objectiveGain = this.collectObjectiveProgress(clearCells);
      const extraSpecialHits = clearSet.size - matchInfo.keys.size;
      const comboMultiplier = BASE_MATCH_SCORE + (combo - 1) * COMBO_BONUS_STEP;
      const rawScoreGain =
        clearSet.size * comboMultiplier +
        Math.max(0, extraSpecialHits) * SPECIAL_HIT_BONUS +
        (special ? SPECIAL_CREATE_BONUS : 0);

      const scoreGain = this.applyScoreMultiplier(rawScoreGain);

      this.score += scoreGain;
      if (clearSet.size >= 4) {
        const bonusSeconds = this.feverActive ? 2 : 1;
        this.timeLeft = Math.min(this.level.timeLimit, this.timeLeft + bonusSeconds);
      }

      if (extraSpecialHits > 0) {
        this.setComboMessage(`SPECIAL CHAIN +${extraSpecialHits}`);
        this.playSfx("combo", Math.min(4, 2 + combo + extraSpecialHits * 0.3));
      } else if (combo > 1) {
        this.setComboMessage(`${combo}x COMBO`);
        this.playSfx("combo", Math.min(4, combo));
      } else {
        this.setComboMessage(`+${scoreGain} SCORE`);
        this.playSfx("match", Math.min(4, Math.max(1, clearSet.size - 2)));
      }

      this.updateBonusMissionProgress({
        comboDepth: combo,
        clearCount: clearSet.size,
        specialTriggered: extraSpecialHits > 0,
        objectiveGain,
      });
      this.updateHud();
      await this.clearCellsAnimated(
        clearCells,
        !!special || extraSpecialHits > 0,
        Math.min(16, 6 + combo * 2 + Math.max(0, extraSpecialHits)),
      );

      if (special) {
        this.createSpecialTile(special);
      }

      await this.delay(CLEAR_PAUSE_MS);
      await this.collapseAndRefill();

      activePreferred = undefined;
    }

    if (!this.ended && !this.hasPossibleMoveInCurrentBoard()) {
      if (this.reshuffleFallbacks > 0) {
        this.reshuffleFallbacks -= 1;
        await this.shuffleBoardAnimated();
      } else {
        this.reshuffleFallbacks = MAX_RESHUFFLES_FALLBACK;
        const fallbackBoard = this.createInitialTypeBoard();
        void this.buildBoardFromTypes(fallbackBoard, true);
        this.setComboMessage("BOARD RESET");
        this.playSfx("reshuffle");
      }
    }
  }

  private async clearCellsAnimated(
    cells: ICellPos[],
    withShake: boolean,
    sparkleCount: number = 7,
  ) {
    if (withShake) {
      this.shakeCamera(140, 0.0034);
      this.triggerBoardFlash(this.feverActive ? 0xfca5a5 : 0xfef08a, 0.28, 180);
    }

    if (cells.length >= 8) {
      this.triggerThunderAcrossBoard(cells.length >= 12 ? 2 : 1, 0xc4b5fd);
    }

    const promises: Array<Promise<void>> = [];

    cells.forEach((cellPos) => {
      const cell = this.board[cellPos.row][cellPos.col];
      if (!cell) {
        return;
      }

      this.spawnSparkles(cellPos, sparkleCount, {
        palette: withShake ? "electric" : "warm",
        spreadMultiplier: withShake ? 1.18 : 1,
        durationMin: withShake ? 320 : 360,
        durationMax: withShake ? 520 : 470,
        depth: withShake ? 66 : 35,
      });

      promises.push(
        new Promise((resolve) => {
          this.tweens.add({
            targets: cell.sprite,
            scaleX: cell.baseScaleX * 1.2,
            scaleY: cell.baseScaleY * 0.78,
            duration: 80,
            yoyo: true,
            ease: "Sine.InOut",
            onComplete: () => {
              this.tweens.add({
                targets: cell.sprite,
                alpha: 0,
                angle: 18,
                scaleX: cell.baseScaleX * 1.32,
                scaleY: cell.baseScaleY * 1.24,
                duration: CLEAR_MS,
                ease: "Back.In",
                onComplete: () => {
                  cell.field?.destroy();
                  cell.sprite.destroy();
                  cell.marker?.destroy();
                  this.board[cellPos.row][cellPos.col] = null;
                  resolve();
                },
              });
            },
          });

          if (cell.marker) {
            this.tweens.add({
              targets: cell.marker,
              scaleX: 1.22,
              scaleY: 0.78,
              duration: 80,
              yoyo: true,
              ease: "Sine.InOut",
              onComplete: () => {
                this.tweens.add({
                  targets: cell.marker,
                  alpha: 0,
                  angle: 18,
                  scaleX: 1.28,
                  scaleY: 1.28,
                  duration: CLEAR_MS,
                  ease: "Back.In",
                });
              },
            });
          }
          if (cell.field) {
            this.tweens.add({
              targets: cell.field,
              alpha: 0,
              scaleX: 1.26,
              scaleY: 1.14,
              angle: 12,
              duration: CLEAR_MS,
              ease: "Back.In",
            });
          }
        }),
      );
    });

    await Promise.all(promises);
  }

  private createSpecialTile(special: ISpecialCreation) {
    const existing = this.board[special.pos.row][special.pos.col];
    if (existing) {
      existing.power = special.power;
      existing.sprite.setAlpha(1);
      this.applyPowerVisual(existing);
      this.playImpactSquish(existing);
      this.playSfx("specialSpawn");
      return;
    }

    const type = this.randomTileType();
    const created = this.createCell(
      special.pos.row,
      special.pos.col,
      type,
      special.power,
      0,
    );

    created.sprite.setScale(created.baseScaleX * 0.2, created.baseScaleY * 0.2);
    created.field?.setScale(0.2, 0.2);
    created.marker?.setScale(0.2);

    this.board[special.pos.row][special.pos.col] = created;

    this.tweens.add({
      targets: created.sprite,
      scaleX: created.baseScaleX,
      scaleY: created.baseScaleY,
      duration: 190,
      ease: "Back.Out",
    });

    if (created.marker) {
      this.tweens.add({
        targets: created.marker,
        scaleX: 1,
        scaleY: 1,
        duration: 190,
        ease: "Back.Out",
      });
    }
    if (created.field) {
      this.tweens.add({
        targets: created.field,
        scaleX: 1,
        scaleY: 1,
        duration: 190,
        ease: "Back.Out",
      });
    }

    this.tweens.add({
      targets: created.sprite,
      scaleX: created.baseScaleX * 1.14,
      scaleY: created.baseScaleY * 0.88,
      duration: 90,
      delay: 130,
      yoyo: true,
      ease: "Sine.InOut",
    });

    this.playSfx("specialSpawn");
  }

  private async collapseAndRefill() {
    const animations: Array<Promise<void>> = [];

    for (let col = 0; col < BOARD_COLS; col += 1) {
      const existing: IMatch3Cell[] = [];

      for (let row = BOARD_ROWS - 1; row >= 0; row -= 1) {
        const cell = this.board[row][col];
        if (cell) {
          existing.push(cell);
        }
        this.board[row][col] = null;
      }

      let writeRow = BOARD_ROWS - 1;
      existing.forEach((cell) => {
        const previousRow = cell.row;
        cell.row = writeRow;
        cell.col = col;
        this.board[writeRow][col] = cell;
        writeRow -= 1;

        if (cell.marker) {
          cell.marker.setDepth(24);
        }
        if (cell.field) {
          cell.field.setDepth(18.5);
        }

        if (previousRow !== cell.row) {
          animations.push(this.animateCellTo(cell, DROP_MS, "drop"));
        }
      });

      for (let row = writeRow; row >= 0; row -= 1) {
        const spawnRows = writeRow - row + 1;
        const created = this.createCell(
          row,
          col,
          this.randomTileType(),
          undefined,
          spawnRows,
        );

        this.board[row][col] = created;
        animations.push(this.animateCellTo(created, DROP_MS, "drop"));
      }
    }

    await Promise.all(animations);
    if (animations.length > 0) {
      this.playSfx("drop", Math.min(4, 1 + animations.length / 18));
    }
  }

  private hasPossibleMoveInCurrentBoard(): boolean {
    const hasSpecialTile = this.board.some((row) => row.some((cell) => Boolean(cell?.power)));
    if (hasSpecialTile) {
      return true;
    }

    const fallback = this.allowedTypes[0] || TILE_TYPES[0];
    const typeBoard: Match3TileType[][] = this.board.map((row) =>
      row.map((cell) => cell?.type || fallback),
    );

    return this.hasPossibleMoveInTypes(typeBoard);
  }

  private async shuffleBoardAnimated() {
    if (this.ended) {
      return;
    }

    this.clearHintPulse();
    this.registerActivity();
    this.setComboMessage("RESHUFFLE");
    this.playSfx("reshuffle");

    const oldCells: IMatch3Cell[] = [];
    this.board.forEach((row) => {
      row.forEach((cell) => {
        if (cell) {
          oldCells.push(cell);
        }
      });
    });

    await Promise.all(
      oldCells.map(
        (cell) =>
          new Promise<void>((resolve) => {
            this.tweens.add({
              targets: cell.sprite,
              alpha: 0,
              scaleX: cell.baseScaleX * 0.6,
              scaleY: cell.baseScaleY * 0.6,
              duration: 120,
              onComplete: () => resolve(),
            });

            if (cell.marker) {
              this.tweens.add({
                targets: cell.marker,
                alpha: 0,
                scaleX: 0.6,
                scaleY: 0.6,
                duration: 120,
              });
            }
          }),
      ),
    );

    this.destroyBoard();

    const freshBoard = this.createInitialTypeBoard();
    await this.buildBoardFromTypes(freshBoard, true);
  }

  private startAmbientSparkles() {
    const event = this.time.addEvent({
      delay: AMBIENT_SPARK_DELAY_MS,
      loop: true,
      callback: () => {
        if (this.ended || this.busy) {
          return;
        }

        const row = Phaser.Math.Between(0, BOARD_ROWS - 1);
        const col = Phaser.Math.Between(0, BOARD_COLS - 1);
        const count = this.feverActive ? 3 : 2;
        this.spawnSparkles({ row, col }, count, {
          palette: this.feverActive ? "electric" : "warm",
          spreadMultiplier: this.feverActive ? 1.15 : 1,
        });
      },
    });

    this.cleanupFns.push(() => {
      event.remove(false);
    });
  }

  private getSparkTint(palette: SparkPalette) {
    if (palette === "electric") {
      return Phaser.Display.Color.GetColor(
        140 + Phaser.Math.Between(0, 45),
        225 + Phaser.Math.Between(0, 25),
        255,
      );
    }
    if (palette === "violet") {
      return Phaser.Display.Color.GetColor(
        198 + Phaser.Math.Between(0, 40),
        150 + Phaser.Math.Between(0, 45),
        255,
      );
    }
    return Phaser.Display.Color.GetColor(
      255,
      180 + Phaser.Math.Between(0, 70),
      80 + Phaser.Math.Between(0, 30),
    );
  }

  private spawnSparkles(cell: ICellPos, count: number, options: ISparkOptions = {}) {
    const world = this.cellToWorld(cell.row, cell.col);
    const palette = options.palette ?? "warm";
    const spreadMultiplier = options.spreadMultiplier ?? 1;
    const durationMin = options.durationMin ?? 380;
    const durationMax = options.durationMax ?? 500;
    const depth = options.depth ?? 35;

    for (let index = 0; index < count; index += 1) {
      const spark = this.add
        .image(world.x, world.y, SPARK_KEY)
        .setDepth(depth)
        .setScale(0.4 + Math.random() * 0.45)
        .setTint(this.getSparkTint(palette))
        .setBlendMode(Phaser.BlendModes.ADD);

      const dx = (Math.random() - 0.5) * this.tileSize * 0.9 * spreadMultiplier;
      const dy = -Math.random() * this.tileSize * 0.9 * spreadMultiplier;

      this.tweens.add({
        targets: spark,
        x: world.x + dx,
        y: world.y + dy,
        alpha: 0,
        scale: 0,
        duration: durationMin + Math.random() * Math.max(60, durationMax - durationMin),
        ease: "Quad.Out",
        onComplete: () => spark.destroy(),
      });
    }
  }

  update(time: number) {
    if (this.ended || this.busy || this.tutorialActive || this.introDropping) {
      return;
    }

    if (time >= this.nextHintAt) {
      this.showIdleHint();
      this.nextHintAt = time + HINT_REPEAT_MS;
    }

    this.tryAssistDrop(time);
  }

  private registerActivity() {
    this.lastPlayerActionAt = this.time.now;
    this.nextHintAt = this.lastPlayerActionAt + HINT_IDLE_MS;
    if (!this.tutorialActive) {
      this.clearHintPulse();
    }
  }

  private clearHintPulse() {
    this.hintTweens.forEach((tween) => tween.stop());
    this.hintTweens = [];
    this.hintMove = null;
    this.hintGlow?.destroy();
    this.hintGlow = undefined;

    this.board.forEach((row) => {
      row.forEach((cell) => {
        if (!cell) {
          return;
        }
        cell.sprite.setScale(cell.baseScaleX, cell.baseScaleY);
        cell.marker?.setScale(1);
      });
    });
  }

  private getCurrentTypeBoard(): Match3TileType[][] {
    const fallback = this.allowedTypes[0] || TILE_TYPES[0];
    return this.board.map((row) => row.map((cell) => cell?.type || fallback));
  }

  private countMatchedCellsInTypes(typeBoard: Match3TileType[][]): number {
    const keys = new Set<string>();

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      let startCol = 0;
      while (startCol < BOARD_COLS) {
        const startType = typeBoard[row][startCol];
        let endCol = startCol + 1;
        while (endCol < BOARD_COLS && typeBoard[row][endCol] === startType) {
          endCol += 1;
        }
        if (endCol - startCol >= 3) {
          for (let col = startCol; col < endCol; col += 1) {
            keys.add(getPosKey(row, col));
          }
        }
        startCol = endCol;
      }
    }

    for (let col = 0; col < BOARD_COLS; col += 1) {
      let startRow = 0;
      while (startRow < BOARD_ROWS) {
        const startType = typeBoard[startRow][col];
        let endRow = startRow + 1;
        while (endRow < BOARD_ROWS && typeBoard[endRow][col] === startType) {
          endRow += 1;
        }
        if (endRow - startRow >= 3) {
          for (let row = startRow; row < endRow; row += 1) {
            keys.add(getPosKey(row, col));
          }
        }
        startRow = endRow;
      }
    }

    return keys.size;
  }

  private findPossibleMoves(typeBoard: Match3TileType[][]): IPossibleMove[] {
    const moves: IPossibleMove[] = [];

    const testSwap = (from: ICellPos, to: ICellPos) => {
      const swapped = cloneTypeBoard(typeBoard);
      const first = swapped[from.row][from.col];
      swapped[from.row][from.col] = swapped[to.row][to.col];
      swapped[to.row][to.col] = first;

      if (!this.hasTypeMatches(swapped)) {
        return;
      }

      moves.push({
        from,
        to,
        impact: this.countMatchedCellsInTypes(swapped),
      });
    };

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        if (col + 1 < BOARD_COLS) {
          testSwap({ row, col }, { row, col: col + 1 });
        }

        if (row + 1 < BOARD_ROWS) {
          testSwap({ row, col }, { row: row + 1, col });
        }
      }
    }

    return moves;
  }

  private chooseBestMove(): IPossibleMove | null {
    const moves = this.findPossibleMoves(this.getCurrentTypeBoard());
    if (!moves.length) {
      for (let row = 0; row < BOARD_ROWS; row += 1) {
        for (let col = 0; col < BOARD_COLS; col += 1) {
          const cell = this.board[row][col];
          if (!cell?.power) {
            continue;
          }

          const directions: Array<[number, number]> = [
            [0, 1],
            [1, 0],
            [0, -1],
            [-1, 0],
          ];
          const adjacent = directions
            .map(([rowOffset, colOffset]) => ({ row: row + rowOffset, col: col + colOffset }))
            .find((target) => this.isValidCell(target.row, target.col));

          if (adjacent) {
            return {
              from: { row, col },
              to: adjacent,
              impact: 6,
            };
          }
        }
      }

      return null;
    }

    return moves
      .map((move) => {
        const fromCell = this.board[move.from.row][move.from.col];
        const toCell = this.board[move.to.row][move.to.col];
        const specialBonus = fromCell?.power || toCell?.power ? 4 : 0;
        return {
          ...move,
          impact: move.impact + specialBonus,
        };
      })
      .sort((a, b) => b.impact - a.impact)[0];
  }

  /**
   * Highlights the swap `move`: the two tiles pulse and a glow ring frames the pair. `message`
   * goes to the combo line; the tutorial passes null, since its plate carries the copy (plan G12:
   * one message at a time). Under reduced motion nothing pulses; the ring stays, static.
   */
  private applyHintPulse(move: IPossibleMove, repeat: number, message: string | null) {
    const fromCell = this.board[move.from.row][move.from.col];
    const toCell = this.board[move.to.row][move.to.col];
    if (!fromCell || !toCell) {
      return;
    }

    this.clearHintPulse();
    this.hintMove = move;
    this.drawHintGlow(move, repeat);

    if (!this.reducedMotion) {
      [fromCell, toCell].forEach((cell) => {
        const spriteTween = this.tweens.add({
          targets: cell.sprite,
          scaleX: cell.baseScaleX * 1.16,
          scaleY: cell.baseScaleY * 1.16,
          duration: 300,
          yoyo: true,
          repeat,
          ease: "Sine.InOut",
        });
        this.hintTweens.push(spriteTween);
      });

      const markers = [fromCell.marker, toCell.marker].filter(
        (marker): marker is Phaser.GameObjects.Container => Boolean(marker),
      );
      if (markers.length) {
        const markerTween = this.tweens.add({
          targets: markers,
          scale: 1.18,
          duration: 300,
          yoyo: true,
          repeat,
          ease: "Sine.InOut",
        });
        this.hintTweens.push(markerTween);
      }
    }

    if (message !== null) this.setComboMessage(message);
  }

  /** A gold ring around the two hinted cells (the glow the tutorial copy refers to). */
  private drawHintGlow(move: IPossibleMove, repeat: number) {
    const top = Math.min(move.from.row, move.to.row);
    const left = Math.min(move.from.col, move.to.col);
    const rows = Math.abs(move.from.row - move.to.row) + 1;
    const cols = Math.abs(move.from.col - move.to.col) + 1;
    const inset = 2;
    const x = this.boardStartX + left * this.tileSize + inset;
    const y = this.boardStartY + top * this.tileSize + inset;
    const w = cols * this.tileSize - 2 * inset;
    const h = rows * this.tileSize - 2 * inset;
    const glow = this.add.graphics().setDepth(26);
    glow.lineStyle(6, UI_GOLD, 0.28).strokeRoundedRect(x - 3, y - 3, w + 6, h + 6, 10);
    glow.lineStyle(3, UI_GOLD, 1).strokeRoundedRect(x, y, w, h, 8);
    glow.lineStyle(1, UI_CREAM, 0.85).strokeRoundedRect(x + 3, y + 3, w - 6, h - 6, 6);
    this.hintGlow = glow;
    if (this.reducedMotion) return;
    this.hintTweens.push(
      this.tweens.add({ targets: glow, alpha: 0.45, duration: 300, yoyo: true, repeat, ease: "Sine.InOut" }),
    );
  }

  private showIdleHint() {
    if (this.ended || this.busy || this.tutorialActive) {
      return;
    }

    if (this.time.now - this.lastPlayerActionAt < HINT_IDLE_MS) {
      return;
    }

    const move = this.chooseBestMove();
    if (!move) {
      return;
    }

    this.applyHintPulse(move, 2, "TRY THIS SWAP");
  }

  private shouldRunTutorial() {
    if (this.level.id !== "1" || typeof window === "undefined") {
      return false;
    }

    try {
      return window.localStorage.getItem(TUTORIAL_STORAGE_KEY) !== "done";
    } catch {
      return false;
    }
  }

  /**
   * The first-move tutorial (plan G12 "Tutorial rewrite", G14 "Paw Match hint"): the best swap
   * glows, a `hint` role plate says what to do, and the glove shows the gesture. The combo and
   * mission lines are hidden until the tutorial swap lands.
   */
  private startTutorialIfNeeded() {
    if (!this.shouldRunTutorial()) {
      return;
    }

    const move = this.chooseBestMove();
    if (!move) {
      return;
    }

    this.tutorialActive = true;
    this.tutorialMove = move;
    this.tutorialMessageState = "intro";
    this.tutorialStartedAt = typeof performance !== "undefined" ? performance.now() : 0;
    this.comboText?.setVisible(false);
    this.missionText?.setVisible(false);
    this.comboBurstText?.setVisible(false);
    this.applyHintPulse(move, -1, null);

    this.tutorialBg = this.add
      .rectangle(0, 0, 10, 10, 0x0f172a, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(2, UI_GOLD, 0.95)
      .setDepth(90);
    // The `hint` role (Nunito 800, sentence case, decision #86), wrapped and fitted by
    // layoutTutorialPlate().
    this.tutorialText = ttText(this, 0, 0, tutorialMessage(this.inputKind, "intro"), "hint", {
      size: this.compactHud ? 15 : 16,
      color: "#fef3c7",
      stroke: "#111827",
      strokeThickness: 3,
      align: "center",
      wordWrapWidth: 200,
      origin: 0.5,
      keepCase: true,
      depth: 91,
    });
    this.layoutTutorialPlate();
    this.startGlove(move);
  }

  /**
   * Sizes and places the plate for its current text (plan G14 `layoutTutorialPlate()`): on every
   * message change, resize and late font. The text is fitted (wrapping, then shrinking to the
   * role minimum) into the layout's tutorial region, the background is sized to it, and both sit
   * on whole device pixels, so nothing is clipped or ghosted.
   */
  private layoutTutorialPlate() {
    const text = this.tutorialText;
    const bg = this.tutorialBg;
    if (!text?.scene || !bg?.scene || !this.layout) return;
    const region = this.layout.tutorial;
    const box = plateTextBox(region);
    refreshTTResolution(text as unknown as HealableText);
    text.setWordWrapWidth(box.maxWidth, true);
    ttFit(text as unknown as TTFitTarget, {
      role: "hint",
      size: this.compactHud ? 15 : 16,
      maxWidth: box.maxWidth,
      maxHeight: box.maxHeight,
      applyCase: false,
    });
    const rect = tutorialPlateRect(region, text.width, text.height, this.layout.safe);
    const snap = (value: number) => {
      const dpr = getCanvasPixelRatio(this);
      return Math.round(value * dpr) / dpr;
    };
    bg.setPosition(rect.x, rect.y).setSize(rect.w, rect.h);
    bg.setDisplaySize(rect.w, rect.h);
    text.setPosition(snap(rect.x + rect.w / 2), snap(rect.y + rect.h / 2));

    // Where the plate covers stat texts on purpose (short phones: the four zero cards), those
    // texts are hidden rather than showing through, so no two visible HUD boxes overlap.
    this.restoreTutorialHiddenHud();
    this.hudTexts.forEach((hudText, key) => {
      if (key === "combo" || key === "mission" || key === "burst" || key === "fever") return;
      if (!hudText.scene || !hudText.visible) return;
      const b = hudText.getBounds();
      if (rect.x < b.x + b.width && b.x < rect.x + rect.w && rect.y < b.y + b.height && b.y < rect.y + rect.h) {
        hudText.setVisible(false);
        this.tutorialHiddenHud.add(key);
      }
    });
  }

  private restoreTutorialHiddenHud() {
    this.tutorialHiddenHud.forEach((key) => this.hudTexts.get(key)?.setVisible(true));
    this.tutorialHiddenHud.clear();
  }

  /** Writes a message into the plate. "Follow the glow" gets a red stroke for 300 ms (plan G14). */
  private setTutorialMessage(state: "intro" | "wrong") {
    const text = this.tutorialText;
    if (!text?.scene) return;
    this.tutorialMessageState = state;
    this.tutorialStrokeTimer?.remove(false);
    this.tutorialRevertTimer?.remove(false);
    text.setText(tutorialMessage(this.inputKind, state));
    this.layoutTutorialPlate();
    if (state === "wrong") {
      text.setStroke("#b91c1c", 4);
      this.tutorialStrokeTimer = this.time.delayedCall(WRONG_STROKE_MS, () => {
        if (text.scene) text.setStroke("#111827", 3);
      });
      // Back to the instruction once the player has read the correction.
      this.tutorialRevertTimer = this.time.delayedCall(1800, () => {
        if (this.tutorialActive) this.setTutorialMessage("intro");
      });
      announce(MATCH3_GAME_ID, text.text, "assertive");
    } else {
      text.setStroke("#111827", 3);
    }
  }

  /** The plate's attention pulse: only the background moves, never the text (no ghosting). */
  private pulseTutorialPrompt() {
    const bg = this.tutorialBg;
    if (!bg?.scene || this.reducedMotion) {
      return;
    }

    this.tweens.killTweensOf(bg);
    bg.setFillStyle(0x0f172a, 0.92).setStrokeStyle(2, UI_GOLD, 0.95);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 160,
      yoyo: true,
      ease: "Sine.InOut",
      onUpdate: (tween) => {
        if (!bg.scene) return;
        const t = tween.getValue() ?? 0;
        bg.setStrokeStyle(2 + 2 * t, t > 0.5 ? 0xfca5a5 : UI_GOLD, 0.95);
      },
      onComplete: () => {
        if (bg.scene) bg.setFillStyle(0x0f172a, 0.92).setStrokeStyle(2, UI_GOLD, 0.95);
      },
    });
  }

  /**
   * The glove (plan G14): a 32x32 pixel glove that points at the shared edge of the pair from
   * outside both cells and drags from the first to the second, with two trailing ghosts, at depth
   * 95. It is placed in the same frame the tutorial starts (visible within 100 ms). Under reduced
   * motion it stands still, halfway along the edge, without ghosts.
   */
  private startGlove(move: IPossibleMove) {
    this.stopGlove();
    if (!this.textures.exists(GLOVE_TEXTURE_KEY)) return;
    const track = gloveTrack(move.from, move.to, {
      x: this.boardStartX,
      y: this.boardStartY,
      tileSize: this.tileSize,
      rows: BOARD_ROWS,
      cols: BOARD_COLS,
    });
    const make = (alpha: number, depth: number) =>
      this.add
        .image(track.start.x, track.start.y, GLOVE_TEXTURE_KEY)
        .setDisplaySize(GLOVE_SIZE, GLOVE_SIZE)
        .setAngle(track.angle)
        .setAlpha(alpha)
        .setDepth(depth);
    this.glove = make(1, GLOVE_DEPTH);
    this.gloveShownAt = typeof performance !== "undefined" ? performance.now() : 0;
    if (this.reducedMotion) {
      this.glove.setPosition(track.mid.x, track.mid.y);
      return;
    }
    this.gloveGhosts = GLOVE_GHOSTS.map((ghost, i) => make(0, GLOVE_DEPTH - 0.2 * (i + 1)));
    this.gloveTrail = [];
    const glove = this.glove;
    this.gloveTween = this.tweens.add({
      targets: glove,
      x: track.end.x,
      y: track.end.y,
      delay: 260,
      duration: 620,
      hold: 360,
      repeatDelay: 220,
      repeat: -1,
      ease: "Sine.InOut",
      onRepeat: () => {
        glove.setPosition(track.start.x, track.start.y);
        this.gloveTrail = [];
      },
    });
    // The ghosts follow the scene clock, not the tween: Phaser does not call a tween's onUpdate
    // during `hold` or `repeatDelay`, which froze the ghosts behind a still glove (5c review).
    this.events.on("update", this.updateGloveGhosts, this);
  }

  /** Each ghost replays where the glove was `lagMs` ago; it shows only while the glove moves. */
  private updateGloveGhosts() {
    const glove = this.glove;
    if (!glove?.scene) return;
    const now = this.time.now;
    this.gloveTrail.push({ t: now, x: glove.x, y: glove.y });
    while (this.gloveTrail.length > 2 && now - this.gloveTrail[1].t > 400) this.gloveTrail.shift();
    this.gloveGhosts.forEach((ghost, i) => {
      const spec = GLOVE_GHOSTS[i];
      const target = now - spec.lagMs;
      let sample = this.gloveTrail[0];
      for (const point of this.gloveTrail) {
        if (point.t <= target) sample = point;
      }
      if (!sample) return;
      const moving = Math.abs(sample.x - glove.x) + Math.abs(sample.y - glove.y) > 1;
      ghost.setPosition(sample.x, sample.y).setAlpha(moving ? spec.alpha : 0);
    });
  }

  private stopGlove() {
    this.events?.off("update", this.updateGloveGhosts, this);
    this.gloveTween?.stop();
    this.gloveTween = undefined;
    this.glove?.destroy();
    this.glove = undefined;
    this.gloveGhosts.forEach((ghost) => ghost.destroy());
    this.gloveGhosts = [];
    this.gloveTrail = [];
  }

  private destroyTutorialPlate() {
    this.tutorialStrokeTimer?.remove(false);
    this.tutorialRevertTimer?.remove(false);
    this.tutorialStrokeTimer = undefined;
    this.tutorialRevertTimer = undefined;
    if (this.tutorialBg) this.tweens?.killTweensOf(this.tutorialBg);
    this.tutorialBg?.destroy();
    this.tutorialText?.destroy();
    this.tutorialBg = undefined;
    this.tutorialText = undefined;
    this.restoreTutorialHiddenHud();
    this.stopGlove();
  }

  private isTutorialSwap(a: ICellPos, b: ICellPos) {
    if (!this.tutorialMove) {
      return true;
    }

    const direct =
      isSamePos(a, this.tutorialMove.from) && isSamePos(b, this.tutorialMove.to);
    const reverse =
      isSamePos(a, this.tutorialMove.to) && isSamePos(b, this.tutorialMove.from);
    return direct || reverse;
  }

  private completeTutorialIfNeeded() {
    if (!this.tutorialActive) {
      return;
    }

    this.tutorialActive = false;
    this.tutorialMove = null;
    this.destroyTutorialPlate();
    this.clearHintPulse();
    // No "Try this swap" the moment the plate goes: the idle clock starts over here.
    this.registerActivity();

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(TUTORIAL_STORAGE_KEY, "done");
      } catch {
        // no-op if storage is unavailable
      }
    }

    // One message at a time again: the combo and mission lines come back.
    this.comboText?.setVisible(true);
    this.missionText?.setVisible(true);
    this.updateHud();
    this.setComboMessage("PURR-FECT START");
    announce(MATCH3_GAME_ID, `Purr-fect start. The clock is running: ${this.timeLeft} seconds.`);
  }

  private collectObjectiveProgress(cells: ICellPos[]): number {
    if (!this.objectiveTarget) {
      return 0;
    }

    let gained = 0;
    cells.forEach((pos) => {
      const cell = this.board[pos.row][pos.col];
      if (cell?.type === this.objectiveType) {
        gained += 1;
      }
    });

    if (!gained) {
      return 0;
    }

    if (this.objectiveCollected < this.objectiveTarget) {
      const previous = this.objectiveCollected;
      this.objectiveCollected = Math.min(this.objectiveTarget, this.objectiveCollected + gained);

      if (
        !this.objectiveRewardClaimed &&
        previous < this.objectiveTarget &&
        this.objectiveCollected >= this.objectiveTarget
      ) {
        this.objectiveRewardClaimed = true;
        this.timeLeft = Math.min(this.level.timeLimit, this.timeLeft + 3);
        this.triggerBoardFlash(0x86efac, 0.24, 220);
        this.setComboMessage("OBJECTIVE COMPLETE +3s");
        this.playSfx("objective");
      }
    }

    return gained;
  }

  private updateStars() {
    while (
      this.starsEarned < this.starThresholdScores.length &&
      this.score >= this.starThresholdScores[this.starsEarned]
    ) {
      this.starsEarned += 1;
      this.timeLeft = Math.min(this.level.timeLimit, this.timeLeft + 1);
      this.triggerBoardFlash(0xfef08a, 0.22, 180);
      this.setComboMessage(`STAR ${this.starsEarned} +1s`);
      this.spawnSparkles({ row: 0, col: Math.floor(BOARD_COLS / 2) }, 10 + this.starsEarned * 2);
      this.playSfx("star", this.starsEarned);
    }
  }

  private applyScoreMultiplier(rawScore: number) {
    if (!this.feverActive) {
      return rawScore;
    }
    return Math.round(rawScore * FEVER_MULTIPLIER);
  }

  private activateFeverMode() {
    if (this.feverActive || this.ended) {
      return;
    }

    this.feverActive = true;
    this.feverText?.setVisible(true);
    if (!this.reducedMotion) this.cameras.main.flash(240, 255, 200, 96, true);
    this.triggerBoardFlash(0xfca5a5, 0.22, 240);
    this.setComboMessage("FEVER x2");
    this.playSfx("fever");
  }

  private handleTimeExpired() {
    if (this.tryTriggerLastChance()) {
      return;
    }
    this.finishGame();
  }

  /**
   * The clock ran out: the last chance can save the run once (plan G10). On an uncleared level 1
   * it fires automatically with the one-time +15 s grace; elsewhere it needs the run to be close.
   */
  private tryTriggerLastChance() {
    const grant = lastChanceGrant({
      levelId: this.level.id,
      levelCleared: !!this.props?.levelCleared,
      used: this.lastChanceUsed,
      ended: this.ended,
      score: this.score,
      targetScore: this.level.targetScore,
      objectiveTarget: this.objectiveTarget,
      objectiveCollected: this.objectiveCollected,
      gate: this.level.lastChanceProgressGate,
    });
    if (!grant) {
      return false;
    }

    this.lastChanceUsed = true;
    this.timeLeft = grant.seconds;
    this.lastCountdownSecond = -1;
    this.triggerBoardFlash(0xfda4af, 0.28, 260);
    this.setComboMessage(grant.kind === "grace" ? `EXTRA TIME +${grant.seconds}s` : `LAST CHANCE +${grant.seconds}s`);
    announce(MATCH3_GAME_ID, `Extra time: ${grant.seconds} more seconds.`, "assertive");
    this.updateHud();
    this.playSfx("countdown");
    return true;
  }

  private resolveSpecialSwapPattern(
    power: TilePower,
    anchor: ICellPos,
    addPos: (row: number, col: number) => void,
  ) {
    if (power === "ROW") {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        addPos(anchor.row, col);
      }
      return;
    }

    if (power === "COL") {
      for (let row = 0; row < BOARD_ROWS; row += 1) {
        addPos(row, anchor.col);
      }
      return;
    }

    if (power === "BOMB") {
      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
          addPos(anchor.row + rowOffset, anchor.col + colOffset);
        }
      }
    }
  }

  private resolveSpecialSwap(first: IMatch3Cell, second: IMatch3Cell): Promise<boolean> {
    const firstPower = first.power;
    const secondPower = second.power;

    if (!firstPower && !secondPower) {
      return Promise.resolve(false);
    }

    this.playSfx("specialSwap");

    const clearSet = new Set<string>();
    const addPos = (row: number, col: number) => {
      if (!this.isValidCell(row, col)) {
        return;
      }
      clearSet.add(getPosKey(row, col));
    };
    const clearType = (type: Match3TileType) => {
      for (let row = 0; row < BOARD_ROWS; row += 1) {
        for (let col = 0; col < BOARD_COLS; col += 1) {
          if (this.board[row][col]?.type === type) {
            addPos(row, col);
          }
        }
      }
    };
    const clearRadius = (center: ICellPos, radius: number) => {
      for (let rowOffset = -radius; rowOffset <= radius; rowOffset += 1) {
        for (let colOffset = -radius; colOffset <= radius; colOffset += 1) {
          addPos(center.row + rowOffset, center.col + colOffset);
        }
      }
    };

    addPos(first.row, first.col);
    addPos(second.row, second.col);

    if (firstPower === "RAINBOW" && secondPower === "RAINBOW") {
      for (let row = 0; row < BOARD_ROWS; row += 1) {
        for (let col = 0; col < BOARD_COLS; col += 1) {
          addPos(row, col);
        }
      }
    } else if (firstPower === "RAINBOW" || secondPower === "RAINBOW") {
      const typeToClear = firstPower === "RAINBOW" ? second.type : first.type;
      clearType(typeToClear);
    } else if (firstPower === "BOMB" && secondPower === "BOMB") {
      clearRadius({ row: first.row, col: first.col }, 2);
      clearRadius({ row: second.row, col: second.col }, 2);
    } else if (
      (firstPower === "BOMB" && (secondPower === "ROW" || secondPower === "COL")) ||
      (secondPower === "BOMB" && (firstPower === "ROW" || firstPower === "COL"))
    ) {
      const bombAnchor = firstPower === "BOMB" ? first : second;
      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        const row = bombAnchor.row + rowOffset;
        for (let col = 0; col < BOARD_COLS; col += 1) {
          addPos(row, col);
        }
      }
      for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
        const col = bombAnchor.col + colOffset;
        for (let row = 0; row < BOARD_ROWS; row += 1) {
          addPos(row, col);
        }
      }
    } else {
      if (firstPower) {
        this.resolveSpecialSwapPattern(firstPower, { row: first.row, col: first.col }, addPos);
      }
      if (secondPower) {
        this.resolveSpecialSwapPattern(secondPower, { row: second.row, col: second.col }, addPos);
      }
    }

    const clearCells = Array.from(clearSet).map((key) => parsePosKey(key));
    const objectiveGain = this.collectObjectiveProgress(clearCells);

    const rawScore = clearSet.size * (BASE_MATCH_SCORE + SPECIAL_HIT_BONUS) + SPECIAL_CREATE_BONUS * 2;
    this.score += this.applyScoreMultiplier(rawScore);
    this.timeLeft = Math.min(this.level.timeLimit, this.timeLeft + 1);
    this.triggerThunderAcrossBoard(3, 0x93c5fd);
    this.spawnSparkStorm(5, "electric", 1.32);
    this.setComboMessage("MEGA COMBO");
    this.updateBonusMissionProgress({
      comboDepth: 1,
      clearCount: clearSet.size,
      specialTriggered: true,
      objectiveGain,
    });
    this.updateHud();

    return this.clearCellsAnimated(clearCells, true, 14)
      .then(() => this.delay(CLEAR_PAUSE_MS))
      .then(() => this.collapseAndRefill())
      .then(() => true);
  }

  /** Camera shake, skipped under reduced motion (5c review). */
  private shakeCamera(duration: number, intensity: number) {
    if (this.reducedMotion) return;
    this.cameras.main.shake(duration, intensity);
  }

  /** The board's colour flash; under reduced motion nothing flashes (the HUD line carries it). */
  private triggerBoardFlash(color: number, alpha: number, duration: number) {
    if (!this.boardFlash || this.reducedMotion) {
      return;
    }

    this.tweens.killTweensOf(this.boardFlash);
    this.boardFlash.setFillStyle(color, alpha).setAlpha(alpha);
    this.tweens.add({
      targets: this.boardFlash,
      alpha: 0,
      duration,
      ease: "Quad.Out",
    });
  }

  private setupDebugHooks() {
    if (typeof window === "undefined") {
      return;
    }

    this.renderGameToTextHook = () => this.renderGameToText();
    this.advanceTimeHook = (ms: number) => this.advanceTimeForTests(ms);

    const windowWithHooks = window as unknown as {
      render_game_to_text?: () => string;
      advanceTime?: (ms: number) => void;
    };
    windowWithHooks.render_game_to_text = this.renderGameToTextHook;
    windowWithHooks.advanceTime = this.advanceTimeHook;
  }

  private teardownDebugHooks() {
    if (typeof window === "undefined") {
      return;
    }

    const windowWithHooks = window as unknown as {
      render_game_to_text?: () => string;
      advanceTime?: (ms: number) => void;
    };

    if (windowWithHooks.render_game_to_text === this.renderGameToTextHook) {
      delete windowWithHooks.render_game_to_text;
    }
    if (windowWithHooks.advanceTime === this.advanceTimeHook) {
      delete windowWithHooks.advanceTime;
    }

    this.renderGameToTextHook = undefined;
    this.advanceTimeHook = undefined;
    this.testAdvanceCarryMs = 0;
  }

  private renderGameToText() {
    const isTargetReached = this.score >= this.level.targetScore;
    const payload = {
      mode: "CATNIP_MATCH",
      coordinateSystem: "row,col with row 0 at top and col 0 at left",
      score: this.score,
      targetScore: this.level.targetScore,
      catnipCap: this.level.catnipCap,
      catnipEarnedPreview: this.calculateCatnipEarned(isTargetReached),
      timeLeft: this.timeLeft,
      moves: this.moves,
      stars: this.starsEarned,
      objective: {
        type: this.objectiveType,
        target: this.objectiveTarget,
        collected: this.objectiveCollected,
      },
      feverActive: this.feverActive,
      tutorialActive: this.tutorialActive,
      clockStarted: this.clockStarted,
      lastChanceUsed: this.lastChanceUsed,
      tutorial: this.tutorialSnapshot(),
      ended: this.ended,
      busy: this.busy,
      introDropping: this.introDropping,
      idle: { lastActionAt: this.lastPlayerActionAt, now: this.time.now, nextHintAt: this.nextHintAt },
      queuedSwaps: this.swapQueue.length,
      retention: {
        dayStreak: this.retentionState?.dayStreak || 1,
        totalRuns: this.retentionState?.totalRuns || 1,
        completedRuns: this.retentionState?.completedRuns || 0,
        winStreak: this.retentionState?.winStreak || 0,
        streakBonusSeconds: this.streakBonusSeconds,
        assistDropsUsed: this.assistDropsUsed,
        assistDropsMax: ASSIST_MAX_DROPS,
      },
      bonusMission:
        this.bonusMission &&
        {
          id: this.bonusMission.id,
          label: this.bonusMission.label,
          progress: this.bonusMission.progress,
          target: this.bonusMission.target,
          rewardScore: this.bonusMission.rewardScore,
          rewardSeconds: this.bonusMission.rewardSeconds,
          completedCount: this.completedMissionIds.size,
          totalMissions: BONUS_MISSION_LIMIT,
        },
      hint:
        this.hintMove && {
          from: this.hintMove.from,
          to: this.hintMove.to,
        },
      board: this.board.map((row) =>
        row.map((cell) => {
          if (!cell) {
            return "EMPTY";
          }
          return cell.power ? `${cell.type}:${cell.power}` : cell.type;
        }),
      ),
    };

    return JSON.stringify({
      ...payload,
      hud: this.hudBounds(),
      hudMode: this.layout?.mode,
      safe: this.layout?.safe,
      closeZone: this.layout?.closeZone,
      boardRect: { x: this.boardStartX, y: this.boardStartY, tileSize: this.tileSize },
    });
  }

  /** The tutorial's plate, text, glove and hinted cells in layout pixels, for the e2e. */
  private tutorialSnapshot() {
    if (!this.tutorialActive) return null;
    const round = (r: { x: number; y: number; width: number; height: number }) => ({
      x: Math.round(r.x * 10) / 10,
      y: Math.round(r.y * 10) / 10,
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
    });
    return {
      message: this.tutorialText?.text ?? null,
      messageState: this.tutorialMessageState,
      inputKind: this.inputKind,
      reducedMotion: this.reducedMotion,
      fontSize: this.tutorialText?.style.fontSize ?? null,
      family: this.tutorialText ? String(this.tutorialText.style.fontFamily) : null,
      stroke: this.tutorialText?.style.stroke ?? null,
      plate: this.tutorialBg ? round(this.tutorialBg.getBounds()) : null,
      text: this.tutorialText ? round(this.tutorialText.getBounds()) : null,
      glove: this.glove ? { ...round(this.glove.getBounds()), angle: this.glove.angle, visible: this.glove.visible, alpha: this.glove.alpha } : null,
      ghosts: this.gloveGhosts.length,
      ghostAlphas: this.gloveGhosts.map((ghost) => Math.round(ghost.alpha * 100) / 100),
      // Every tile sits on its cell (the intro drop has landed) while the glow and glove show.
      cellsLanded: this.board.every((row) =>
        row.every((cell) => {
          if (!cell) return true;
          const at = this.cellToWorld(cell.row, cell.col);
          return Math.abs(cell.sprite.x - at.x) < 0.5 && Math.abs(cell.sprite.y - at.y) < 0.5;
        }),
      ),
      gloveDelayMs: this.glove ? Math.round(this.gloveShownAt - this.tutorialStartedAt) : null,
      hiddenHud: Array.from(this.tutorialHiddenHud),
      move: this.tutorialMove && { from: this.tutorialMove.from, to: this.tutorialMove.to },
      comboVisible: !!this.comboText?.visible,
      missionVisible: !!this.missionText?.visible,
    };
  }

  private advanceTimeForTests(ms: number) {
    if (this.ended) {
      return;
    }

    this.testAdvanceCarryMs += Math.max(0, ms);
    const steps = Math.max(0, Math.floor(this.testAdvanceCarryMs / 1000));
    this.testAdvanceCarryMs -= steps * 1000;

    if (!steps) {
      return;
    }

    for (let index = 0; index < steps; index += 1) {
      if (this.ended) {
        break;
      }
      // Same rule as the real clock: nothing ticks before the first valid swap.
      if (this.tutorialActive || !this.clockStarted) {
        continue;
      }

      this.timeLeft = Math.max(0, this.timeLeft - 1);
      this.elapsedSeconds += 1;
      if (this.timeLeft <= 0) {
        this.handleTimeExpired();
        if (this.ended || this.timeLeft > 0) {
          break;
        }
      }
    }

    this.updateHud();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.time.delayedCall(ms, () => resolve());
    });
  }
}
