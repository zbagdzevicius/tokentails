import { useEffect, useState } from "react";

export interface IGameOverEvent extends Event {
  detail: {
    score: number;
  };
}

export interface IGameUpdateEvent extends Event {
  detail: {
    additionalTime: number;
  };
}

export interface IGameStartEvent extends Event {
  detail: {
    start: boolean;
  };
}

export const useGameStartEvent = (
  callback: (event: IGameStartEvent) => void
) => {
  useEffect(() => {
    const handleGameStart = (event: IGameStartEvent) => {
      callback(event);
    };

    window.addEventListener("game-start", handleGameStart as EventListener);

    return () => {
      window.removeEventListener(
        "game-start",
        handleGameStart as EventListener
      );
    };
  }, [callback]);
};

export const useGameLoadedEvent = () => {
  const [isGameLoaded, setIsGameLoaded] = useState(false);
  useEffect(() => {
    const handleGameStart = (event: IGameStartEvent) => {
      setIsGameLoaded(true);
    };

    window.addEventListener("game-loaded", handleGameStart as EventListener);

    return () => {
      window.removeEventListener(
        "game-loaded",
        handleGameStart as EventListener
      );
    };
  }, []);

  return isGameLoaded;
};

export const useGameOverEvent = (callback: (event: IGameOverEvent) => void) => {
  useEffect(() => {
    const handleGameOver = (event: IGameOverEvent) => {
      callback(event);
    };

    window.addEventListener("game-over", handleGameOver as EventListener);

    return () => {
      window.removeEventListener("game-over", handleGameOver as EventListener);
    };
  }, [callback]);
};

export const useGameUpdateEvent = (
  callback: (event: IGameUpdateEvent) => void
) => {
  useEffect(() => {
    const handleGameOver = (event: IGameUpdateEvent) => {
      callback(event);
    };

    window.addEventListener("game-update", handleGameOver as EventListener);

    return () => {
      window.removeEventListener(
        "game-update",
        handleGameOver as EventListener
      );
    };
  }, [callback]);
};

export const useGameTimerUpdate = (
  setTimer: (updateFn: (prevTimer: number) => number) => void
) => {
  useEffect(() => {
    const handleGameUpdate = (event: CustomEvent) => {
      const formattedTime = Number(event.detail.time.toFixed());

      setTimer((prevTimer) => prevTimer + formattedTime);
    };

    window.addEventListener("game-update", handleGameUpdate as EventListener);

    return () => {
      window.removeEventListener(
        "game-update",
        handleGameUpdate as EventListener
      );
    };
  }, [setTimer]);
};
