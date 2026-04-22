import { useEffect, useState } from "react";


interface IError {
  message?: string;
  error?: string;
}

export type IEventDetail<T> = {
  detail: T;
};

// ALL EVENTS TYPES
export enum GameEvent {
  ERROR = "ERROR",
}

export type ICatEventsDetails = {
  [GameEvent.ERROR]: IError;
};

export type ICatEvent<K extends GameEvent> = IEventDetail<ICatEventsDetails[K]>;

const useEvent = <K extends GameEvent>(
  gameEvent: K,
  callback?: (event: ICatEventsDetails[K]) => void
) => {
  const [object, setObject] = useState<ICatEventsDetails[K] | null>(null);
  useEffect(() => {
    const handleGameStart = (event: IEventDetail<any>) => {
      setObject(event.detail);
      callback?.(event.detail);
    };

    global?.window?.addEventListener(
      gameEvent,
      handleGameStart as unknown as EventListener
    );

    return () => {
      global?.window?.removeEventListener(
        gameEvent,
        handleGameStart as unknown as EventListener
      );
    };
  }, [callback]);

  return object;
};

const pushEvent = <K extends GameEvent>(
  gameEvent: GameEvent,
  event?: ICatEventsDetails[K]
) => {
  global?.window?.dispatchEvent(
    new CustomEvent(gameEvent, {
      detail: event,
    })
  );
};

const addEventListener = <K extends GameEvent>(
  gameEvent: GameEvent,
  callback: (event: ICatEvent<K>) => void
) => global?.window?.addEventListener(gameEvent, callback as unknown as EventListener);

const removeEventListener = <K extends GameEvent>(
  gameEvent: GameEvent,
  callback: (event: ICatEvent<K>) => void
) =>
  global?.window?.removeEventListener(gameEvent, callback as unknown as EventListener);

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
      callback?: (event?: ICatEventsDetails[K]) => void
    ) => ICatEventsDetails[K] | null;
    push: (event?: ICatEventsDetails[K]) => void;
    addEventListener: (callback: (event: ICatEvent<K>) => void) => void;
    removeEventListener: (callback: (event: ICatEvent<K>) => void) => void;
  };
};


export const GameEvents: GameEventsType = {
  [GameEvent.ERROR]: generateGameEvent(GameEvent.ERROR),
};
