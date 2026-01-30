import { ICat } from "@/models/cats";
import { useEffect, useState } from "react";

export type IPhaserScene = Phaser.Scene & { cat?: any; catDto?: ICat };
export interface IPhaserGame {
  game: Phaser.Game | null;
  scene: IPhaserScene | null;
}

export interface IPhaserGameSceneProps {
  cat: ICat;
  isRestart: boolean;
  catToRescue?: string; // Image URL for rescued cat sprite
}

// CAT EVENTS
interface ICatMeowEvent {}
interface ICatEatenEvent {}
interface ICatSpawnEvent {
  cat: ICat;
  isRestart?: boolean;
}
interface ICatPlayEvent {}
interface ICatEatEvent {}
interface ICatEatEvent {}
// GAME EVENTS
interface IGameStartEvent {
  cat?: ICat;
  isRestart?: boolean;
}
export interface IGameStopEvent {
  score: number;
  time: number;
  completedLevel?: string | null;
}

interface IGameUpdateEvent {
  time?: number;
  additionalTime?: number;
}
interface IGameLoadedEvent {
  scene: IPhaserScene;
}
interface IGameScoreUpdateEvent {
  score: number;
}

interface IEnemySpawn {
  amount: number;
}
interface IBossSpawn {
  amount: number;
}

export enum NPC_TYPE {
  TOKENTAILS = "token-tails",
  TOKENTAILS_2 = "token-tails-2",
  ROZINE_PEDUTE = "rozine-pedute",
  PLAYER_CATS = "player-cats",
}

interface INpcSpawnEvent {
  npc: ICat;
  type: NPC_TYPE;
}
interface INpcCollisionEvent {
  npc: ICat;
}

interface INpcCollisionEvent {
  npc: ICat;
}

interface ICatHealthUpdate {
  health: number;
  maxHealth: number;
}

interface IObjectiveUpdate {
  objective: string;
  completed: boolean;
}

interface IPlayerCats {
  cats: ICat[];
}

export type IEventDetail<T> = {
  detail: T;
};

// ALL EVENTS TYPES
export enum GameEvent {
  GAME_START = "GAME_START",
  GAME_STOP = "GAME_STOP",
  GAME_LOADED = "GAME_LOADED",
  GAME_UPDATE = "GAME_UPDATE",
  GAME_COIN_CAUGHT = "GAME_COIN_CAUGHT",
  GAME_PROGRESS_UPDATE = "GAME_PROGRESS_UPDATE",
  CAT_MEOW = "CAT_MEOW",
  CAT_EATEN = "CAT_EATEN",
  CAT_PLAY = "CAT_PLAY",
  CAT_SPAWN = "CAT_SPAWN",
  CAT_EAT = "CAT_EAT",
  NPC_SPAWN = "NPC_SPAWN",
  PLAYER_CATS = "PLAYER_CATS",
  NPC_COLLISION = "NPC_COLLISION",
  CAT_CARD_DISPLAY = "CAT_CARD_DISPLAY",
  ENEMY_SPAWN = "ENEMY_SPAWN",
  BOSS_SPAWN = "BOSS_SPAWN",
  CLEAR_NPCS = "CLEAR_NPCS",
  CAT_HEALTH_UPDATE = "CAT_HEALTH_UPDATE",
  OBJECTIVE_UPDATE = "OBJECTIVE_UPDATE",
}

export type ICatEventsDetails = {
  [GameEvent.CAT_MEOW]: ICatMeowEvent;
  [GameEvent.CAT_EATEN]: ICatEatenEvent;
  [GameEvent.CAT_PLAY]: ICatPlayEvent;
  [GameEvent.CAT_SPAWN]: ICatSpawnEvent;
  [GameEvent.CAT_EAT]: ICatEatEvent;
  [GameEvent.GAME_START]: IGameStartEvent;
  [GameEvent.GAME_STOP]: IGameStopEvent;
  [GameEvent.GAME_UPDATE]: IGameUpdateEvent;
  [GameEvent.GAME_LOADED]: IGameLoadedEvent;
  [GameEvent.GAME_COIN_CAUGHT]: IGameScoreUpdateEvent;
  [GameEvent.NPC_SPAWN]: INpcSpawnEvent;
  [GameEvent.NPC_COLLISION]: INpcCollisionEvent;
  [GameEvent.CAT_CARD_DISPLAY]: { npc: ICat };
  [GameEvent.ENEMY_SPAWN]: IEnemySpawn;
  [GameEvent.BOSS_SPAWN]: IBossSpawn;
  [GameEvent.PLAYER_CATS]: INpcSpawnEvent;
  [GameEvent.CLEAR_NPCS]: void;
  [GameEvent.GAME_PROGRESS_UPDATE]: { progress: number };
  [GameEvent.CAT_HEALTH_UPDATE]: ICatHealthUpdate;
  [GameEvent.OBJECTIVE_UPDATE]: IObjectiveUpdate;
};

export type ICatEvent<K extends GameEvent> = IEventDetail<ICatEventsDetails[K]>;

const useEvent = <K extends GameEvent>(
  gameEvent: K,
  callback?: (event: ICatEventsDetails[K]) => void,
) => {
  const [object, setObject] = useState<ICatEventsDetails[K] | null>(null);
  useEffect(() => {
    const handleGameStart = (event: IEventDetail<any>) => {
      setObject(event.detail);
      callback?.(event.detail);
    };

    window.addEventListener(
      gameEvent,
      handleGameStart as unknown as EventListener,
    );

    return () => {
      window.removeEventListener(
        gameEvent,
        handleGameStart as unknown as EventListener,
      );
    };
  }, [callback]);

  return object;
};

const pushEvent = <K extends GameEvent>(
  gameEvent: GameEvent,
  event?: ICatEventsDetails[K],
) => {
  window.dispatchEvent(
    new CustomEvent(gameEvent, {
      detail: event,
    }),
  );
};

const addEventListener = <K extends GameEvent>(
  gameEvent: GameEvent,
  callback: (event: ICatEvent<K>) => void,
) => window.addEventListener(gameEvent, callback as unknown as EventListener);

const removeEventListener = <K extends GameEvent>(
  gameEvent: GameEvent,
  callback: (event: ICatEvent<K>) => void,
) =>
  window.removeEventListener(gameEvent, callback as unknown as EventListener);

const generateGameEvent = <K extends GameEvent>(gameEvent: K) => ({
  use: (callback?: (event?: ICatEventsDetails[K]) => void) =>
    useEvent(gameEvent, callback),
  push: (event?: ICatEventsDetails[K]) => pushEvent(gameEvent, event),
  addEventListener: (callback: (event: ICatEvent<K>) => void) =>
    addEventListener(gameEvent, callback),
  removeEventListener: (callback: (event: ICatEvent<K>) => void) =>
    removeEventListener(gameEvent, callback),
});

type GameEventsType = {
  [K in GameEvent]: {
    use: (
      callback?: (event?: ICatEventsDetails[K]) => void,
    ) => ICatEventsDetails[K] | null;
    push: (event?: ICatEventsDetails[K]) => void;
    addEventListener: (callback: (event: ICatEvent<K>) => void) => void;
    removeEventListener: (callback: (event: ICatEvent<K>) => void) => void;
  };
};

export const GameEvents: GameEventsType = {
  [GameEvent.CAT_MEOW]: generateGameEvent(GameEvent.CAT_MEOW),
  [GameEvent.CAT_EATEN]: generateGameEvent(GameEvent.CAT_EATEN),
  [GameEvent.CAT_PLAY]: generateGameEvent(GameEvent.CAT_PLAY),
  [GameEvent.CAT_SPAWN]: generateGameEvent(GameEvent.CAT_SPAWN),
  [GameEvent.CAT_EAT]: generateGameEvent(GameEvent.CAT_EAT),
  [GameEvent.GAME_START]: generateGameEvent(GameEvent.GAME_START),
  [GameEvent.GAME_STOP]: generateGameEvent(GameEvent.GAME_STOP),
  [GameEvent.GAME_UPDATE]: generateGameEvent(GameEvent.GAME_UPDATE),
  [GameEvent.GAME_LOADED]: generateGameEvent(GameEvent.GAME_LOADED),
  [GameEvent.GAME_COIN_CAUGHT]: generateGameEvent(GameEvent.GAME_COIN_CAUGHT),
  [GameEvent.NPC_SPAWN]: generateGameEvent(GameEvent.NPC_SPAWN),
  [GameEvent.NPC_COLLISION]: generateGameEvent(GameEvent.NPC_COLLISION),
  [GameEvent.CAT_CARD_DISPLAY]: generateGameEvent(GameEvent.CAT_CARD_DISPLAY),
  [GameEvent.ENEMY_SPAWN]: generateGameEvent(GameEvent.ENEMY_SPAWN),
  [GameEvent.BOSS_SPAWN]: generateGameEvent(GameEvent.BOSS_SPAWN),
  [GameEvent.PLAYER_CATS]: generateGameEvent(GameEvent.PLAYER_CATS),
  [GameEvent.CLEAR_NPCS]: generateGameEvent(GameEvent.CLEAR_NPCS),
  [GameEvent.CAT_HEALTH_UPDATE]: generateGameEvent(GameEvent.CAT_HEALTH_UPDATE),
  [GameEvent.GAME_PROGRESS_UPDATE]: generateGameEvent(
    GameEvent.GAME_PROGRESS_UPDATE,
  ),
  [GameEvent.OBJECTIVE_UPDATE]: generateGameEvent(GameEvent.OBJECTIVE_UPDATE),
};
