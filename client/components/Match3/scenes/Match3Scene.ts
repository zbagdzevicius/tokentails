import { GameEvents } from "@/components/Phaser/events";
import { Scene } from "phaser";
import {
  MATCH3_ARENA_BG,
  MATCH3_LEVEL_BY_ID,
  MATCH3_LEVELS,
  MATCH3_TILE_ASSETS,
  Match3LevelId,
  Match3TileType,
} from "../match3.config";

export interface IMatch3Props {
  level: Match3LevelId;
  bestScore?: number;
}

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
  marker?: Phaser.GameObjects.Text;
}

type Board = Array<Array<IMatch3Cell | null>>;

type TypeBoard = Match3TileType[][];

interface ISwapIntent {
  from: ICellPos;
  to: ICellPos;
}

const BOARD_ROWS = 8;
const BOARD_COLS = 8;
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
const LAST_CHANCE_SECONDS = 5;
const FEVER_SECONDS_THRESHOLD = 15;
const FEVER_MULTIPLIER = 2;
const TUTORIAL_STORAGE_KEY = "tokentails-match3-ftue-v1";
const STAR_PROGRESS_THRESHOLDS = [0.4, 0.75, 1];
const COMBO_BURST_Y_OFFSET = -4;
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
  private streakClampWidth = 0;
  private boardWidth = 0;
  private boardHeight = 0;

  private score = 0;
  private moves = 0;
  private timeLeft = 0;
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
  private tutorialContainer?: Phaser.GameObjects.Container;
  private sfxGainNode?: GainNode;
  private sfxNoiseBuffer?: AudioBuffer;
  private sfxUnlocked = false;
  private lastCountdownSecond = -1;
  private lastDropSfxAt = 0;
  private lastThunderSfxAt = 0;

  constructor() {
    super("Match3Scene");
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
    this.load.image(BG_KEY, MATCH3_ARENA_BG);

    MATCH3_TILE_ASSETS.forEach((tile) => {
      this.load.image(TILE_KEY_BY_TYPE[tile.type], tile.src);
    });
  }

  create() {
    this.createSparkTexture();
    this.computeBoardLayout();
    this.loadRetentionSessionState();
    this.createBackdrop();
    this.createHud();
    this.createBoardFrame();

    const initialTypeBoard = this.createInitialTypeBoard();
    this.buildBoardFromTypes(initialTypeBoard, true);

    this.setupInput();
    this.startTimer();
    this.startAmbientSparkles();
    this.setupDebugHooks();
    this.startTutorialIfNeeded();
    if (!this.tutorialActive) {
      this.showLevelObjectiveNudge();
    }
    this.updateHud();
    this.registerActivity();

    GameEvents.GAME_START.push();
    GameEvents.GAME_PROGRESS_UPDATE.push({ progress: 0 });

    this.events.once("shutdown", this.cleanup, this);
    this.events.once("destroy", this.cleanup, this);
  }

  private cleanup() {
    if (this.timerEvent) {
      this.timerEvent.remove(false);
      this.timerEvent = undefined;
    }

    this.clearHintPulse();
    this.teardownDebugHooks();
    this.tutorialContainer?.destroy();
    this.tutorialContainer = undefined;

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

  private getStreakHudLabel(dayStreak: number, winStreak: number) {
    const streakBonusPart = this.streakBonusSeconds > 0 ? ` +${this.streakBonusSeconds}s` : "";
    const winStreakPart = winStreak > 0 ? ` • W${winStreak}` : "";
    const bestScorePart = this.levelBestScore > 0 ? ` • BEST ${this.levelBestScore}` : "";
    if (this.smallLandscapeHud) {
      return `LEVEL ${this.level.id} • D${dayStreak}${streakBonusPart}${winStreakPart}${bestScorePart}`;
    }
    return `${this.level.name.toUpperCase()} • D${dayStreak}${streakBonusPart}${winStreakPart}${bestScorePart}`;
  }

  private clampTextToWidth(
    textNode: Phaser.GameObjects.Text | undefined,
    maxWidth: number,
    minFontSize: number,
  ) {
    if (!textNode || textNode.width <= maxWidth) {
      return;
    }

    const currentSizeRaw = textNode.style.fontSize;
    const currentSize =
      typeof currentSizeRaw === "number"
        ? currentSizeRaw
        : Number.parseInt(String(currentSizeRaw || "0"), 10);

    if (Number.isNaN(currentSize) || currentSize <= minFontSize) {
      return;
    }

    for (let nextSize = currentSize - 1; nextSize >= minFontSize; nextSize -= 1) {
      textNode.setFontSize(nextSize);
      if (textNode.width <= maxWidth) {
        return;
      }
    }
  }

  private computeBoardLayout() {
    const width = this.scale.width;
    const height = this.scale.height;
    this.smallLandscapeHud = width > height && width <= 960 && height <= 450;
    this.wideHud = !this.smallLandscapeHud && width >= 1220 && height >= 760;
    this.compactHud = !this.wideHud && (width < 980 || height < 760);

    const sideHudReserve = this.wideHud
      ? Math.min(420, width * 0.34)
      : this.smallLandscapeHud
        ? Math.min(300, width * 0.44)
        : 0;
    const safeTop = this.smallLandscapeHud ? 28 : this.compactHud ? 166 : this.wideHud ? 132 : 146;
    const safeBottom = this.smallLandscapeHud ? 20 : this.compactHud ? 146 : this.wideHud ? 122 : 112;
    const maxBoardByWidth =
      this.wideHud || this.smallLandscapeHud ? width - sideHudReserve : width * 0.92;
    const maxTileByWidth = Math.floor(maxBoardByWidth / BOARD_COLS);
    const maxTileByHeight = Math.floor((height - safeTop - safeBottom) / BOARD_ROWS);
    const tileCap = this.smallLandscapeHud ? 52 : this.wideHud ? 82 : 92;
    const tileFloor = this.smallLandscapeHud ? 30 : 44;
    const candidateTile = Math.min(tileCap, maxTileByWidth, maxTileByHeight);

    this.tileSize = this.smallLandscapeHud
      ? Math.max(tileFloor, candidateTile)
      : Math.max(44, candidateTile);

    this.boardWidth = this.tileSize * BOARD_COLS;
    this.boardHeight = this.tileSize * BOARD_ROWS;

    this.boardStartX = Math.floor((width - this.boardWidth) / 2);
    this.boardStartY = Math.max(
      safeTop,
      Math.floor((height - this.boardHeight - safeTop - safeBottom) / 2) + safeTop,
    );

    this.tileIconSize = Math.floor(this.tileSize * 0.72);
    this.markerOffset = Math.floor(this.tileSize * 0.22);
    this.streakClampWidth = Math.max(72, this.boardWidth - 16);
  }

  private createBackdrop() {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;
    const boardCenterX = this.boardStartX + this.boardWidth / 2;
    const boardCenterY = this.boardStartY + this.boardHeight / 2;

    this.add
      .image(centerX, centerY, BG_KEY)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setAlpha(0.34)
      .setDepth(0);

    this.add
      .rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x050414, 0.56)
      .setDepth(1);

    this.add
      .ellipse(
        centerX - this.boardWidth * 0.42,
        centerY - this.boardHeight * 0.18,
        this.scale.width * 0.62,
        this.scale.height * 0.48,
        0x60a5fa,
        0.12,
      )
      .setDepth(1.2)
      .setBlendMode(Phaser.BlendModes.SCREEN);

    this.add
      .ellipse(
        centerX + this.boardWidth * 0.42,
        centerY - this.boardHeight * 0.12,
        this.scale.width * 0.64,
        this.scale.height * 0.5,
        0xf472b6,
        0.1,
      )
      .setDepth(1.2)
      .setBlendMode(Phaser.BlendModes.SCREEN);

    this.add
      .rectangle(centerX, 0, this.scale.width, this.scale.height * 0.5, 0xa78bfa, 0.1)
      .setOrigin(0.5, 0)
      .setDepth(1.3);

    for (let starIndex = 0; starIndex < BACKDROP_TWINKLE_STARS; starIndex += 1) {
      const star = this.add
        .circle(
          Phaser.Math.Between(0, this.scale.width),
          Phaser.Math.Between(0, this.scale.height),
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

  private createHud() {
    const centerX = this.scale.width / 2;
    const boardWidth = this.boardWidth;
    const boardHeight = this.boardHeight;
    const boardTopY = this.boardStartY;
    const boardBottomY = this.boardStartY + boardHeight;
    const titleY = this.smallLandscapeHud ? 22 : this.compactHud ? 40 : 44;
    const titleFontSize = this.compactHud ? "23px" : "31px";
    const statFontSize = this.smallLandscapeHud ? "16px" : this.compactHud ? "18px" : "21px";
    const progressY = boardTopY - (this.smallLandscapeHud ? 10 : this.compactHud ? 18 : 22);
    const objectiveY = boardTopY - (this.smallLandscapeHud ? 19 : this.compactHud ? 44 : 48);
    const comboY = boardBottomY + (this.smallLandscapeHud ? 12 : this.compactHud ? 22 : 24);
    const missionY = comboY + (this.smallLandscapeHud ? 14 : this.compactHud ? 20 : 22);
    const feverY = missionY + (this.smallLandscapeHud ? 12 : this.compactHud ? 18 : 20);
    const rewardY = feverY + (this.smallLandscapeHud ? 12 : this.compactHud ? 16 : 18);
    const titlePlateWidth = this.wideHud ? 470 : this.compactHud ? 350 : 410;
    const titlePlateHeight = this.compactHud ? 48 : 52;
    let smallLandscapeLeftPanelX: number | null = null;
    let smallLandscapeRightPanelX: number | null = null;
    let smallLandscapeRowWidth = 0;
    let smallLandscapeFooterTopY = 0;
    let smallLandscapeFooterBottomY = 0;

    if (!this.smallLandscapeHud) {
      this.createUiCard(centerX, titleY, titlePlateWidth, titlePlateHeight, 56, UI_GOLD, UI_NAVY);

      this.add
        .image(centerX - titlePlateWidth / 2 + 26, titleY, TILE_KEY_BY_TYPE["PAW"])
        .setDisplaySize(22, 22)
        .setDepth(57)
        .setAlpha(0.92);
      this.add
        .image(centerX + titlePlateWidth / 2 - 26, titleY, TILE_KEY_BY_TYPE["PAW"])
        .setDisplaySize(22, 22)
        .setDepth(57)
        .setAlpha(0.92);

      this.titleText = this.add
        .text(centerX, titleY, "TOKEN TAILS  •  PAW MATCH", {
          fontFamily: "Bebas Neue",
          fontSize: titleFontSize,
          color: "#fde68a",
          stroke: "#2a1a44",
          strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setDepth(58)
        .setLetterSpacing(1.55);
    } else {
      this.titleText = undefined;
    }

    this.streakText = this.add
      .text(
        centerX,
        this.smallLandscapeHud ? 16 : titleY + (this.compactHud ? 30 : 34),
        this.getStreakHudLabel(this.retentionState?.dayStreak || 1, this.retentionState?.winStreak || 0),
        {
          fontFamily: "Pixelify Sans",
          fontSize: this.smallLandscapeHud ? "9px" : this.compactHud ? "12px" : "13px",
          color: "#fef3c7",
          stroke: "#1b1230",
          strokeThickness: this.smallLandscapeHud ? 3 : 4,
        },
      )
      .setOrigin(0.5)
      .setDepth(60);
    if (this.smallLandscapeHud) {
      this.clampTextToWidth(this.streakText, this.streakClampWidth, 7);
    }

    if (this.smallLandscapeHud) {
      const sideSlotWidth = Math.max(120, Math.floor((this.scale.width - boardWidth) / 2));
      const panelWidth = Math.min(220, Math.max(132, sideSlotWidth - 12));
      const sideInset = Math.max(6, Math.floor((sideSlotWidth - panelWidth) / 2));
      const panelHeight = Math.max(170, boardHeight - 20);
      const leftPanelX = this.boardStartX - sideInset - panelWidth / 2;
      const rightPanelX = this.boardStartX + boardWidth + sideInset + panelWidth / 2;
      const panelCenterY = boardTopY + boardHeight / 2;
      const panelTopY = panelCenterY - panelHeight / 2;
      const rowWidth = panelWidth - 16;
      const rowHeight = 34;
      const statRowOneY = panelTopY + Math.max(44, Math.floor(panelHeight * 0.2));
      const statRowTwoY = statRowOneY + Math.max(42, Math.floor(panelHeight * 0.14));
      const statRowThreeY = statRowTwoY + Math.max(34, Math.floor(panelHeight * 0.12));
      const statRowFourY = statRowThreeY + Math.max(28, Math.floor(panelHeight * 0.1));
      const headerY = panelTopY + Math.max(14, Math.floor(panelHeight * 0.08));
      const footerTopY = panelTopY + panelHeight - Math.max(46, Math.floor(panelHeight * 0.16));
      const footerBottomY = panelTopY + panelHeight - Math.max(20, Math.floor(panelHeight * 0.07));

      this.createUiCard(leftPanelX, panelCenterY, panelWidth, panelHeight, 56, UI_GOLD, UI_NAVY);
      this.createUiCard(rightPanelX, panelCenterY, panelWidth, panelHeight, 56, UI_GOLD, UI_NAVY);

      [statRowOneY, statRowTwoY, statRowThreeY].forEach((rowY, rowIndex) => {
        this.add
          .rectangle(
            leftPanelX,
            rowY,
            rowWidth,
            rowHeight,
            rowIndex % 2 === 0 ? 0x24184d : 0x1b153a,
            0.42,
          )
          .setStrokeStyle(1, UI_CREAM, 0.26)
          .setDepth(58.2);
      });

      [statRowOneY, statRowTwoY, statRowThreeY, statRowFourY].forEach((rowY, rowIndex) => {
        this.add
          .rectangle(
            rightPanelX,
            rowY,
            rowWidth,
            rowHeight,
            rowIndex % 2 === 0 ? 0x24184d : 0x1b153a,
            0.42,
          )
          .setStrokeStyle(1, UI_CREAM, 0.26)
          .setDepth(58.2);
      });

      smallLandscapeLeftPanelX = leftPanelX;
      smallLandscapeRightPanelX = rightPanelX;
      smallLandscapeRowWidth = rowWidth;
      smallLandscapeFooterTopY = footerTopY;
      smallLandscapeFooterBottomY = footerBottomY;
      this.streakClampWidth = rowWidth - 8;
      this.streakText
        ?.setPosition(leftPanelX, headerY)
        .setOrigin(0.5);
      this.streakText?.setFontSize(8);
      this.clampTextToWidth(this.streakText, this.streakClampWidth, 7);

      this.timerText = this.add
        .text(leftPanelX, statRowOneY, "TIME 0", {
          fontFamily: "Bebas Neue",
          fontSize: "20px",
          color: "#fef3c7",
          stroke: "#0f172a",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setLetterSpacing(1.1);

      this.scoreText = this.add
        .text(leftPanelX, statRowTwoY, "SCORE 0", {
          fontFamily: "Bebas Neue",
          fontSize: "20px",
          color: "#fde68a",
          stroke: "#0f172a",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setLetterSpacing(1.1);

      this.bestScoreText = this.add
        .text(leftPanelX, statRowThreeY, `BEST ${this.levelBestScore}`, {
          fontFamily: "Bebas Neue",
          fontSize: "14px",
          color: "#fef3c7",
          stroke: "#0f172a",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setLetterSpacing(0.9);

      this.targetText = this.add
        .text(rightPanelX, statRowOneY, `GOAL ${this.level.targetScore}`, {
          fontFamily: "Bebas Neue",
          fontSize: "19px",
          color: "#fef3c7",
          stroke: "#0f172a",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setLetterSpacing(1.1);

      this.movesText = this.add
        .text(rightPanelX, statRowTwoY, "MOVES 0", {
          fontFamily: "Bebas Neue",
          fontSize: "19px",
          color: "#fef3c7",
          stroke: "#0f172a",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setLetterSpacing(1.1);

      this.objectiveIcon = this.add
        .image(rightPanelX - rowWidth / 2 + 10, statRowThreeY, TILE_KEY_BY_TYPE[this.objectiveType])
        .setOrigin(0, 0.5)
        .setDisplaySize(14, 14)
        .setDepth(60);

      this.objectiveText = this.add
        .text(
          rightPanelX - rowWidth / 2 + 26,
          statRowThreeY,
          `GOAL ${TILE_LABEL_BY_TYPE[this.objectiveType]} 0/${this.objectiveTarget}`,
          {
            fontFamily: "Pixelify Sans",
            fontSize: "9px",
            color: "#fef3c7",
            stroke: "#111827",
            strokeThickness: 3,
          },
        )
        .setOrigin(0, 0.5)
        .setDepth(60)
        .setWordWrapWidth(rowWidth - 24, true);

      this.starsText = this.add
        .text(rightPanelX, statRowFourY, "STARS ☆☆☆", {
          fontFamily: "Bebas Neue",
          fontSize: "13px",
          color: "#fde68a",
          stroke: "#111827",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setLetterSpacing(0.9);
    } else if (this.wideHud) {
      const panelWidth = Math.min(
        236,
        Math.max(182, Math.floor((this.scale.width - boardWidth) / 2) - 30),
      );
      const panelHeight = Math.max(210, boardHeight - 56);
      const leftPanelX = this.boardStartX - panelWidth / 2 - 28;
      const rightPanelX = this.boardStartX + boardWidth + panelWidth / 2 + 28;
      const panelCenterY = boardTopY + boardHeight / 2;

      this.createUiCard(leftPanelX, panelCenterY, panelWidth, panelHeight, 56, UI_GOLD, UI_NAVY);
      this.createUiCard(rightPanelX, panelCenterY, panelWidth, panelHeight, 56, UI_GOLD, UI_NAVY);

      const leftStatTop = panelCenterY - panelHeight / 2 + 52;
      const rightStatTop = panelCenterY - panelHeight / 2 + 52;
      const rowWidth = panelWidth - 26;
      const rowHeight = 52;

      [leftStatTop, leftStatTop + 74, leftStatTop + 148].forEach((rowY, rowIndex) => {
        this.add
          .rectangle(
            leftPanelX,
            rowY,
            rowWidth,
            rowHeight,
            rowIndex % 2 === 0 ? 0x24184d : 0x1b153a,
            0.42,
          )
          .setStrokeStyle(1, UI_CREAM, 0.26)
          .setDepth(58.2);
      });

      [rightStatTop, rightStatTop + 78, rightStatTop + 148].forEach((rowY, rowIndex) => {
        this.add
          .rectangle(
            rightPanelX,
            rowY,
            rowWidth,
            rowHeight,
            rowIndex % 2 === 0 ? 0x24184d : 0x1b153a,
            0.42,
          )
          .setStrokeStyle(1, UI_CREAM, 0.26)
          .setDepth(58.2);
      });

      this.timerText = this.add
        .text(leftPanelX, leftStatTop, "TIME 0", {
          fontFamily: "Bebas Neue",
          fontSize: "32px",
          color: "#fef3c7",
          stroke: "#0f172a",
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setLetterSpacing(1.2);

      this.scoreText = this.add
        .text(leftPanelX, leftStatTop + 62, "SCORE 0", {
          fontFamily: "Bebas Neue",
          fontSize: "32px",
          color: "#fde68a",
          stroke: "#0f172a",
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setLetterSpacing(1.2);

      this.bestScoreText = this.add
        .text(leftPanelX, leftStatTop + 92, `BEST ${this.levelBestScore}`, {
          fontFamily: "Bebas Neue",
          fontSize: "21px",
          color: "#fef3c7",
          stroke: "#0f172a",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setLetterSpacing(1.05);

      this.movesText = this.add
        .text(leftPanelX, leftStatTop + 148, "MOVES 0", {
          fontFamily: "Bebas Neue",
          fontSize: "30px",
          color: "#fef3c7",
          stroke: "#0f172a",
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setLetterSpacing(1.2);

      this.targetText = this.add
        .text(rightPanelX, rightStatTop, `GOAL ${this.level.targetScore}`, {
          fontFamily: "Bebas Neue",
          fontSize: "30px",
          color: "#fef3c7",
          stroke: "#0f172a",
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setLetterSpacing(1.2);

      this.objectiveIcon = this.add
        .image(rightPanelX - panelWidth * 0.3, rightStatTop + 78, TILE_KEY_BY_TYPE[this.objectiveType])
        .setDisplaySize(24, 24)
        .setDepth(60);

      this.objectiveText = this.add
        .text(rightPanelX - panelWidth * 0.3 + 20, rightStatTop + 78, "GOAL 0/0", {
          fontFamily: "Pixelify Sans",
          fontSize: "16px",
          color: "#fef3c7",
          stroke: "#0f172a",
          strokeThickness: 4,
        })
        .setOrigin(0, 0.5)
        .setDepth(60);

      this.starsText = this.add
        .text(rightPanelX, rightStatTop + 148, "STARS ☆☆☆", {
          fontFamily: "Bebas Neue",
          fontSize: "28px",
          color: "#fde68a",
          stroke: "#0f172a",
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setLetterSpacing(1.2);
    } else {
      const cardWidth = this.compactHud ? 148 : 168;
      const cardHeight = this.compactHud ? 46 : 50;
      const cardGap = this.compactHud ? 10 : 14;
      const rowTopY = this.compactHud ? 94 : 92;
      const rowBottomY = rowTopY + cardHeight + (this.compactHud ? 8 : 10);
      const leftX = centerX - cardWidth / 2 - cardGap / 2;
      const rightX = centerX + cardWidth / 2 + cardGap / 2;

      this.createUiCard(leftX, rowTopY, cardWidth, cardHeight, 56, UI_GOLD, UI_NAVY);
      this.createUiCard(rightX, rowTopY, cardWidth, cardHeight, 56, UI_GOLD, UI_NAVY);
      this.createUiCard(leftX, rowBottomY, cardWidth, cardHeight, 56, UI_GOLD, UI_NAVY);
      this.createUiCard(rightX, rowBottomY, cardWidth, cardHeight, 56, UI_GOLD, UI_NAVY);

      this.timerText = this.add
        .text(leftX, rowTopY, "TIME 0", {
          fontFamily: "Bebas Neue",
          fontSize: statFontSize,
          color: "#fef3c7",
          stroke: "#111827",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setLetterSpacing(1.2);

      this.scoreText = this.add
        .text(rightX, rowTopY - (this.compactHud ? 6 : 7), "SCORE 0", {
          fontFamily: "Bebas Neue",
          fontSize: statFontSize,
          color: "#fef3c7",
          stroke: "#111827",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setLetterSpacing(1.2);

      this.bestScoreText = this.add
        .text(rightX, rowTopY + (this.compactHud ? 11 : 12), `BEST ${this.levelBestScore}`, {
          fontFamily: "Bebas Neue",
          fontSize: this.compactHud ? "13px" : "14px",
          color: "#fde68a",
          stroke: "#111827",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setLetterSpacing(0.9);

      this.targetText = this.add
        .text(leftX, rowBottomY, `GOAL ${this.level.targetScore}`, {
          fontFamily: "Bebas Neue",
          fontSize: statFontSize,
          color: "#fef3c7",
          stroke: "#111827",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setLetterSpacing(1.2);

      this.movesText = this.add
        .text(rightX, rowBottomY, "MOVES 0", {
          fontFamily: "Bebas Neue",
          fontSize: statFontSize,
          color: "#fef3c7",
          stroke: "#111827",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(60)
        .setLetterSpacing(1.2);

      this.objectiveIcon = this.add
        .image(this.boardStartX + 10, objectiveY, TILE_KEY_BY_TYPE[this.objectiveType])
        .setOrigin(0, 0.5)
        .setDisplaySize(18, 18)
        .setDepth(60);

      this.objectiveText = this.add
        .text(
          this.boardStartX + 30,
          objectiveY,
          `GOAL ${TILE_LABEL_BY_TYPE[this.objectiveType]} 0/${this.objectiveTarget}`,
          {
            fontFamily: "Pixelify Sans",
            fontSize: this.compactHud ? "14px" : "15px",
            color: "#fef3c7",
            stroke: "#111827",
            strokeThickness: 3,
          },
        )
        .setOrigin(0, 0.5)
        .setDepth(60);

      this.starsText = this.add
        .text(this.boardStartX + boardWidth, objectiveY, "STARS ☆☆☆", {
          fontFamily: "Bebas Neue",
          fontSize: this.compactHud ? "18px" : "20px",
          color: "#fde68a",
          stroke: "#111827",
          strokeThickness: 4,
        })
        .setOrigin(1, 0.5)
        .setDepth(60)
        .setLetterSpacing(1.1);
    }

    const progressTrackWidth = boardWidth + (this.smallLandscapeHud ? 16 : 28);
    const progressTrackHeight = this.smallLandscapeHud ? 12 : 16;
    const progressGlowHeight = this.smallLandscapeHud ? 7 : 9;
    this.add
      .rectangle(centerX, progressY, progressTrackWidth, progressTrackHeight, 0x120b23, 0.92)
      .setStrokeStyle(3, UI_GOLD, 0.8)
      .setDepth(58)
      .setBlendMode(Phaser.BlendModes.NORMAL);

    this.progressBarFill = this.add
      .rectangle(
        centerX - progressTrackWidth / 2,
        progressY,
        progressTrackWidth,
        progressTrackHeight,
        0x34d399,
        0.94,
      )
      .setOrigin(0, 0.5)
      .setDepth(59);

    this.progressBarGlow = this.add
      .rectangle(
        centerX - progressTrackWidth / 2,
        progressY - 1,
        progressTrackWidth,
        progressGlowHeight,
        0xfef08a,
        0.45,
      )
      .setOrigin(0, 0.5)
      .setDepth(59.2)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.comboText = this.add
      .text(centerX, comboY, "SWIPE TO MATCH", {
        fontFamily: "Bebas Neue",
        fontSize: this.smallLandscapeHud ? "16px" : this.compactHud ? "20px" : "24px",
        color: "#f8e18b",
        stroke: "#221433",
        strokeThickness: this.smallLandscapeHud ? 4 : 5,
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setLetterSpacing(this.smallLandscapeHud ? 1.2 : 1.6);
    if (this.smallLandscapeHud && smallLandscapeLeftPanelX !== null) {
      this.comboText
        .setPosition(smallLandscapeLeftPanelX, smallLandscapeFooterTopY)
        .setFontSize(12)
        .setLetterSpacing(0.9)
        .setWordWrapWidth(Math.max(72, smallLandscapeRowWidth - 8), true)
        .setAlign("center");
    }

    this.missionText = this.add
      .text(centerX, missionY, "BONUS: START A CHAIN", {
        fontFamily: "Pixelify Sans",
        fontSize: this.smallLandscapeHud ? "10px" : this.compactHud ? "13px" : "14px",
        color: "#fef3c7",
        stroke: "#1b1331",
        strokeThickness: this.smallLandscapeHud ? 3 : 4,
      })
      .setOrigin(0.5)
      .setDepth(60);
    if (this.smallLandscapeHud) {
      this.missionText.setWordWrapWidth(Math.max(74, smallLandscapeRowWidth - 6), true);
      this.missionText.setAlign("center");
      if (smallLandscapeRightPanelX !== null) {
        this.missionText
          .setPosition(smallLandscapeRightPanelX, smallLandscapeFooterTopY)
          .setFontSize(9);
      }
    }

    this.comboBurstText = this.add
      .text(centerX, this.boardStartY + boardHeight / 2 + COMBO_BURST_Y_OFFSET, "", {
        fontFamily: "Bebas Neue",
        fontSize: this.smallLandscapeHud ? "22px" : this.compactHud ? "28px" : "34px",
        color: "#fef08a",
        stroke: "#111827",
        strokeThickness: this.smallLandscapeHud ? 5 : 7,
      })
      .setOrigin(0.5)
      .setDepth(76)
      .setAlpha(0)
      .setVisible(false)
      .setLetterSpacing(2.2)
      .setShadow(0, 0, "#000000", 12, true, true);

    this.feverText = this.add
      .text(centerX, feverY, "FEVER x2", {
        fontFamily: "Bebas Neue",
        fontSize: this.smallLandscapeHud ? "17px" : this.compactHud ? "21px" : "24px",
        color: "#fca5a5",
        stroke: "#711428",
        strokeThickness: this.smallLandscapeHud ? 4 : 5,
      })
      .setOrigin(0.5)
      .setDepth(70)
      .setLetterSpacing(1.4)
      .setVisible(false);
    if (this.smallLandscapeHud && smallLandscapeRightPanelX !== null) {
      this.feverText
        .setPosition(smallLandscapeRightPanelX, smallLandscapeFooterBottomY)
        .setFontSize(12)
        .setLetterSpacing(1.1);
    }

    this.rewardText = this.add
      .text(centerX, rewardY, `CATNIP 0/${this.level.catnipCap}`, {
        fontFamily: "Bebas Neue",
        fontSize: this.smallLandscapeHud ? "16px" : this.compactHud ? "20px" : "22px",
        color: "#fde68a",
        stroke: "#1b1331",
        strokeThickness: this.smallLandscapeHud ? 4 : 5,
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setLetterSpacing(this.smallLandscapeHud ? 1.1 : 1.3);
    if (this.smallLandscapeHud && smallLandscapeLeftPanelX !== null) {
      this.rewardText
        .setPosition(smallLandscapeLeftPanelX, smallLandscapeFooterBottomY)
        .setFontSize(13)
        .setLetterSpacing(0.85);
    }

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
      const cell = this.worldToCell(pointer.x, pointer.y);
      if (!cell) {
        return;
      }

      this.registerActivity();
      this.playSfx("tap");
      this.dragStartCell = cell;
      this.dragStartPoint = { x: pointer.x, y: pointer.y };
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
      const releaseCell = this.worldToCell(pointer.x, pointer.y);
      let targetCell: ICellPos | null = null;

      if (releaseCell && isAdjacent(startCell, releaseCell)) {
        targetCell = releaseCell;
      }

      if (!targetCell && this.dragStartPoint) {
        const dx = pointer.x - this.dragStartPoint.x;
        const dy = pointer.y - this.dragStartPoint.y;

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
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.ended || this.tutorialActive) {
          return;
        }

        this.timeLeft = Math.max(0, this.timeLeft - 1);
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
      this.comboText?.setText(`PURR-FECT +${catnipEarned} CATNIP`);
      this.playSfx("win");
    } else if (progress >= 0.8) {
      this.comboText?.setText("SO CLOSE • RUN IT BACK");
      this.playSfx("lose");
    } else {
      this.comboText?.setText(`RUN COMPLETE +${catnipEarned} CATNIP`);
      this.playSfx("lose");
    }
    this.feverText?.setVisible(false);

    GameEvents.GAME_STOP.push({
      score: catnipEarned,
      time: this.level.timeLimit - this.timeLeft,
      completedLevel: isTargetReached ? this.level.id : null,
      rawScore: Math.max(0, Math.floor(this.score)),
      catnipEarned,
    });
  }

  private updateHud() {
    this.levelBestScore = Math.max(this.levelBestScore, Math.floor(this.score));
    this.updateStars();
    this.timerText?.setText(`TIME ${this.timeLeft}`);
    this.scoreText?.setText(`SCORE ${this.score}`);
    this.bestScoreText?.setText(`BEST ${this.levelBestScore}`);
    this.targetText?.setText(`GOAL ${this.level.targetScore}`);
    this.movesText?.setText(`MOVES ${this.moves}`);
    const dayStreak = this.retentionState?.dayStreak || 1;
    const winStreak = this.retentionState?.winStreak || 0;
    this.streakText?.setText(this.getStreakHudLabel(dayStreak, winStreak));
    if (this.smallLandscapeHud) {
      this.clampTextToWidth(this.streakText, this.streakClampWidth, 7);
    }

    if (this.missionText) {
      if (this.bonusMission) {
        const missionIndex = Math.min(BONUS_MISSION_LIMIT, this.completedMissionIds.size + 1);
        const missionName = this.bonusMission.label.replace(/^BONUS:\s*/, "");
        this.missionText.setText(
          `BONUS ${missionIndex}/${BONUS_MISSION_LIMIT} • ${missionName} ${this.bonusMission.progress}/${this.bonusMission.target}`,
        );
      } else {
        this.missionText.setText(
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
    this.objectiveIcon?.setTexture(TILE_KEY_BY_TYPE[this.objectiveType]);
    this.objectiveText?.setText(
      `GOAL ${TILE_LABEL_BY_TYPE[this.objectiveType]} ${this.objectiveCollected}/${this.objectiveTarget}`,
    );
    this.starsText?.setText(
      `STARS ${"★".repeat(this.starsEarned)}${"☆".repeat(Math.max(0, 3 - this.starsEarned))}`,
    );
    const catnipPreview = this.calculateCatnipEarned(this.score >= this.level.targetScore);
    const rewardColor =
      catnipPreview >= this.level.catnipCap
        ? "#86efac"
        : catnipPreview >= Math.round(this.level.catnipCap * 0.7)
          ? "#fef08a"
          : "#fde68a";
    this.rewardText?.setText(`CATNIP ${catnipPreview}/${this.level.catnipCap}`);
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
    this.cameras.main.shake(85 + intensity * 42, 0.0018 + intensity * 0.0008);
  }

  private setComboMessage(message: string) {
    const style = this.resolveComboMessageStyle(message);
    this.comboText?.setText(message);
    this.comboText?.setColor(style.color);
    this.comboText?.setStroke(style.stroke, 5);
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
      this.comboBurstText
        .setText(burstLabel)
        .setVisible(true)
        .setAlpha(0)
        .setScale(0.74)
        .setColor(style.color)
        .setStroke(style.stroke, 7)
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

  private buildBoardFromTypes(typeBoard: Match3TileType[][], fromTop: boolean) {
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

      void Promise.all(promises);
    }
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
        marker: "↔",
        tint: 0x7dd3fc,
        alpha: 0.22,
      };
    }
    if (power === "COL") {
      return {
        fill: 0x93c5fd,
        stroke: 0x60a5fa,
        marker: "↕",
        tint: 0x93c5fd,
        alpha: 0.22,
      };
    }
    if (power === "BOMB") {
      return {
        fill: 0xfda4af,
        stroke: 0xfb7185,
        marker: "✦",
        tint: 0xfca5a5,
        alpha: 0.24,
      };
    }

    return {
      fill: 0xfef08a,
      stroke: 0xfacc15,
      marker: "★",
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

    cell.marker = this.add
      .text(
        cell.sprite.x + this.markerOffset,
        cell.sprite.y - this.markerOffset,
        fieldVisual.marker,
        {
          fontFamily: "monospace",
          fontSize: `${Math.floor(this.tileSize * 0.2)}px`,
          color: "#111827",
          stroke: "#fef3c7",
          strokeThickness: 3,
        },
      )
      .setDepth(24)
      .setOrigin(0.5);

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
    if (this.ended) {
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
      this.setComboMessage("FOLLOW THE GLOW");
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

    const specialSwapResolved = await this.resolveSpecialSwap(first, second);
    if (specialSwapResolved) {
      this.moves += 1;
      this.updateHud();
      await this.resolveMatches();
      this.completeTutorialIfNeeded();
      this.busy = false;
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
      this.cameras.main.shake(90, 0.0015);
      this.busy = false;
      this.setComboMessage("NO MATCH");
      this.playSfx("invalid");
      return;
    }

    this.moves += 1;
    this.updateHud();

    await this.resolveMatches(b);

    this.completeTutorialIfNeeded();
    this.busy = false;
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
        this.buildBoardFromTypes(fallbackBoard, true);
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
      this.cameras.main.shake(140, 0.0034);
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
    this.buildBoardFromTypes(freshBoard, true);

    await this.delay(DROP_MS + 30);
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
    if (this.ended || this.busy || this.tutorialActive) {
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

  private applyHintPulse(move: IPossibleMove, repeat: number, message: string) {
    const fromCell = this.board[move.from.row][move.from.col];
    const toCell = this.board[move.to.row][move.to.col];
    if (!fromCell || !toCell) {
      return;
    }

    this.clearHintPulse();
    this.hintMove = move;

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
      (marker): marker is Phaser.GameObjects.Text => Boolean(marker),
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

    this.setComboMessage(message);
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
    this.applyHintPulse(move, -1, "SWIPE THE GLOWING TILES");

    const centerX = this.scale.width / 2;
    const panelY = Math.min(
      this.scale.height - 30,
      this.boardStartY + BOARD_ROWS * this.tileSize + 30,
    );
    const panelWidth = Math.min(this.scale.width * 0.92, 560);
    const bg = this.add
      .rectangle(0, 0, panelWidth, 48, 0x0f172a, 0.86)
      .setStrokeStyle(2, 0xfacc15, 0.88);
    const text = this.add
      .text(0, 0, "FIRST MOVE: DRAG BETWEEN THE HIGHLIGHTED TOKENS", {
        fontFamily: "monospace",
        fontSize: "15px",
        color: "#fef3c7",
        stroke: "#111827",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.tutorialContainer = this.add.container(centerX, panelY, [bg, text]).setDepth(90);
  }

  private pulseTutorialPrompt() {
    if (!this.tutorialContainer) {
      return;
    }

    this.tweens.killTweensOf(this.tutorialContainer);
    this.tutorialContainer.setScale(1);
    this.tweens.add({
      targets: this.tutorialContainer,
      scale: 1.04,
      duration: 160,
      yoyo: true,
      ease: "Sine.InOut",
    });
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
    this.tutorialContainer?.destroy();
    this.tutorialContainer = undefined;
    this.clearHintPulse();

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(TUTORIAL_STORAGE_KEY, "done");
      } catch {
        // no-op if storage is unavailable
      }
    }

    this.setComboMessage("PURR-FECT START");
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
    this.cameras.main.flash(240, 255, 200, 96, true);
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

  private tryTriggerLastChance() {
    if (this.lastChanceUsed || this.ended) {
      return false;
    }

    const scoreProgress = this.level.targetScore ? this.score / this.level.targetScore : 0;
    const objectiveMissing = Math.max(0, this.objectiveTarget - this.objectiveCollected);
    const shouldSaveRun =
      scoreProgress >= this.level.lastChanceProgressGate || objectiveMissing <= 2;

    if (!shouldSaveRun) {
      return false;
    }

    this.lastChanceUsed = true;
    this.timeLeft = LAST_CHANCE_SECONDS;
    this.triggerBoardFlash(0xfda4af, 0.28, 260);
    this.setComboMessage(`LAST CHANCE +${LAST_CHANCE_SECONDS}s`);
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

  private triggerBoardFlash(color: number, alpha: number, duration: number) {
    if (!this.boardFlash) {
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
      ended: this.ended,
      busy: this.busy,
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

    return JSON.stringify(payload);
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
      if (this.tutorialActive) {
        continue;
      }

      this.timeLeft = Math.max(0, this.timeLeft - 1);
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
