import { ICat } from "@/models/cats";
import { useEffect, useMemo, useState } from "react";

export interface IGameOverEvent extends Event {
  detail: {
    score: number;
    message: string;
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

export const useBackground = () => {
  const bgHour = useMemo(() => {
    const coreBg = {
      backgroundRepeat: "no-repeat",
      backgroundSize: "cover",
      backgroundPosition: "center bottom",
    };
    const hours = new Date().getHours();
    return {
      ...coreBg,
      backgroundImage:
        hours > 17 || hours < 6
          ? "url(/base/bg-night-2.gif)"
          : "url(/base/bg-4.gif)",
    };
  }, []);

  return bgHour;
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

export const useCatChangeEvent = (
  callback: (event: { detail: { cat: ICat } }) => void
) => {
  useEffect(() => {
    const handleGameOver = (event: { detail: { cat: ICat } }) => {
      callback(event);
    };

    window.addEventListener("cat-change", handleGameOver as any);

    return () => {
      window.removeEventListener("cat-change", handleGameOver as any);
    };
  }, [callback]);
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
