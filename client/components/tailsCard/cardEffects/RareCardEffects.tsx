import React, { useState, useEffect, useCallback } from "react";

// Image paths
const RARE_SWIRL_1 = "/cards/backgrounds/rare-swirl2.webp";
const RARE_SWIRL_2 = "/cards/backgrounds/rare-swirl2.webp";
const BLUE_PAW = "/cards/backgrounds/blue-paw.webp";
const BLUE_SPARKLE = "/cards/backgrounds/blue-sparkle.webp";
const PURPLE_SPARKLE = "/cards/backgrounds/purple-sparkle.webp";

// Swirl breathing constants
const SWIRL_1_MIN_SCALE = 1.9;
const SWIRL_1_MAX_SCALE = 2.1;
const SWIRL_1_STEP = 0.002;
const SWIRL_1_INITIAL_SCALE = 2.0;

const SWIRL_2_MIN_SCALE = 1.85;
const SWIRL_2_MAX_SCALE = 2.15;
const SWIRL_2_STEP = 0.0025;
const SWIRL_2_INITIAL_SCALE = 1.9;

const BREATHING_INTERVAL_MS = 50;

// Decoration visibility constants
const DECORATION_TOGGLE_MIN_DELAY_MS = 2000;
const DECORATION_TOGGLE_MAX_DELAY_MS = 5000;
const DECORATION_INITIAL_MAX_DELAY_MS = 2000;

// Style constants
const SWIRL_OPACITY = 0.8;
const SWIRL_BRIGHTNESS = 1.3;
const DECORATION_BRIGHTNESS = 1.2;
const SWIRL_ROTATION_ANGLE_1 = 45;
const SWIRL_ROTATION_ANGLE_2 = -45;
const DECORATION_TRANSITION_DURATION = "0.8s";
const SWIRL_TRANSITION_DURATION = "0.1s";

type DecorPosition = {
  id: number;
  image: string;
  className: string;
};

const RARE_DECORATIONS: DecorPosition[] = [
  // Blue paws
  {
    id: 0,
    image: BLUE_PAW,
    className:
      "absolute right-[-10%] top-[20%] translate-x-1/2 -translate-y-1/2 z-[100] w-[10%] h-auto pointer-events-none",
  },
  {
    id: 1,
    image: BLUE_PAW,
    className:
      "absolute right-[-15%] top-[50%] translate-x-1/2 -translate-y-1/2 z-[100] w-[12%] h-auto pointer-events-none",
  },
  {
    id: 2,
    image: BLUE_PAW,
    className:
      "absolute right-[-8%] top-[80%] translate-x-1/2 -translate-y-1/2 z-[100] w-[8%] h-auto pointer-events-none",
  },
  {
    id: 3,
    image: BLUE_PAW,
    className:
      "absolute left-[-12%] top-[30%] -translate-x-1/2 -translate-y-1/2 z-[100] w-[11%] h-auto pointer-events-none",
  },
  {
    id: 4,
    image: BLUE_PAW,
    className:
      "absolute left-[-10%] top-[60%] -translate-x-1/2 -translate-y-1/2 z-[100] w-[9%] h-auto pointer-events-none",
  },
  // Blue sparkles
  {
    id: 5,
    image: BLUE_SPARKLE,
    className:
      "absolute right-[-5%] top-[15%] translate-x-1/2 -translate-y-1/2 z-[100] w-[6%] h-auto pointer-events-none",
  },
  {
    id: 6,
    image: BLUE_SPARKLE,
    className:
      "absolute right-[-8%] top-[35%] translate-x-1/2 -translate-y-1/2 z-[100] w-[7%] h-auto pointer-events-none",
  },
  {
    id: 7,
    image: BLUE_SPARKLE,
    className:
      "absolute right-[-6%] top-[65%] translate-x-1/2 -translate-y-1/2 z-[100] w-[5%] h-auto pointer-events-none",
  },
  {
    id: 8,
    image: BLUE_SPARKLE,
    className:
      "absolute right-[-10%] top-[85%] translate-x-1/2 -translate-y-1/2 z-[100] w-[8%] h-auto pointer-events-none",
  },
  {
    id: 9,
    image: BLUE_SPARKLE,
    className:
      "absolute left-[-7%] top-[20%] -translate-x-1/2 -translate-y-1/2 z-[100] w-[6%] h-auto pointer-events-none",
  },
  {
    id: 10,
    image: BLUE_SPARKLE,
    className:
      "absolute left-[-9%] top-[45%] -translate-x-1/2 -translate-y-1/2 z-[100] w-[7%] h-auto pointer-events-none",
  },
  {
    id: 11,
    image: BLUE_SPARKLE,
    className:
      "absolute left-[-5%] top-[70%] -translate-x-1/2 -translate-y-1/2 z-[100] w-[5%] h-auto pointer-events-none",
  },
  {
    id: 12,
    image: BLUE_SPARKLE,
    className:
      "absolute left-[-11%] top-[85%] -translate-x-1/2 -translate-y-1/2 z-[100] w-[8%] h-auto pointer-events-none",
  },
  // Purple sparkles
  {
    id: 13,
    image: PURPLE_SPARKLE,
    className:
      "absolute right-[-12%] top-[25%] translate-x-1/2 -translate-y-1/2 z-[100] w-[7%] h-auto pointer-events-none",
  },
  {
    id: 14,
    image: PURPLE_SPARKLE,
    className:
      "absolute right-[-7%] top-[45%] translate-x-1/2 -translate-y-1/2 z-[100] w-[6%] h-auto pointer-events-none",
  },
  {
    id: 15,
    image: PURPLE_SPARKLE,
    className:
      "absolute right-[-9%] top-[75%] translate-x-1/2 -translate-y-1/2 z-[100] w-[8%] h-auto pointer-events-none",
  },
  {
    id: 16,
    image: PURPLE_SPARKLE,
    className:
      "absolute left-[-8%] top-[25%] -translate-x-1/2 -translate-y-1/2 z-[100] w-[7%] h-auto pointer-events-none",
  },
  {
    id: 17,
    image: PURPLE_SPARKLE,
    className:
      "absolute left-[-6%] top-[50%] -translate-x-1/2 -translate-y-1/2 z-[100] w-[6%] h-auto pointer-events-none",
  },
  {
    id: 18,
    image: PURPLE_SPARKLE,
    className:
      "absolute left-[-10%] top-[75%] -translate-x-1/2 -translate-y-1/2 z-[100] w-[8%] h-auto pointer-events-none",
  },
  {
    id: 19,
    image: PURPLE_SPARKLE,
    className:
      "absolute left-[-7%] top-[90%] -translate-x-1/2 -translate-y-1/2 z-[100] w-[5%] h-auto pointer-events-none",
  },
  // Middle decorations
  {
    id: 20,
    image: BLUE_PAW,
    className:
      "absolute left-[20%] top-[15%] -translate-x-1/2 -translate-y-1/2 z-[100] w-[8%] h-auto pointer-events-none",
  },
  {
    id: 21,
    image: BLUE_PAW,
    className:
      "absolute left-[35%] top-[85%] -translate-x-1/2 -translate-y-1/2 z-[100] w-[9%] h-auto pointer-events-none",
  },
  {
    id: 22,
    image: BLUE_PAW,
    className:
      "absolute right-[25%] top-[10%] translate-x-1/2 -translate-y-1/2 z-[100] w-[7%] h-auto pointer-events-none",
  },
  {
    id: 23,
    image: BLUE_PAW,
    className:
      "absolute right-[30%] top-[90%] translate-x-1/2 -translate-y-1/2 z-[100] w-[10%] h-auto pointer-events-none",
  },
  {
    id: 24,
    image: BLUE_SPARKLE,
    className:
      "absolute left-[25%] top-[30%] -translate-x-1/2 -translate-y-1/2 z-[100] w-[5%] h-auto pointer-events-none",
  },
  {
    id: 25,
    image: BLUE_SPARKLE,
    className:
      "absolute left-[40%] top-[70%] -translate-x-1/2 -translate-y-1/2 z-[100] w-[6%] h-auto pointer-events-none",
  },
  {
    id: 26,
    image: BLUE_SPARKLE,
    className:
      "absolute right-[20%] top-[25%] translate-x-1/2 -translate-y-1/2 z-[100] w-[5%] h-auto pointer-events-none",
  },
  {
    id: 27,
    image: BLUE_SPARKLE,
    className:
      "absolute right-[35%] top-[75%] translate-x-1/2 -translate-y-1/2 z-[100] w-[7%] h-auto pointer-events-none",
  },
  {
    id: 28,
    image: PURPLE_SPARKLE,
    className:
      "absolute left-[30%] top-[50%] -translate-x-1/2 -translate-y-1/2 z-[100] w-[6%] h-auto pointer-events-none",
  },
  {
    id: 29,
    image: PURPLE_SPARKLE,
    className:
      "absolute right-[30%] top-[40%] translate-x-1/2 -translate-y-1/2 z-[100] w-[6%] h-auto pointer-events-none",
  },
  {
    id: 30,
    image: PURPLE_SPARKLE,
    className:
      "absolute left-[50%] top-[20%] -translate-x-1/2 -translate-y-1/2 z-[100] w-[5%] h-auto pointer-events-none",
  },
  {
    id: 31,
    image: PURPLE_SPARKLE,
    className:
      "absolute left-[50%] top-[80%] -translate-x-1/2 -translate-y-1/2 z-[100] w-[5%] h-auto pointer-events-none",
  },
];

export const RareCardEffects = () => {
  const [decorationVisibility, setDecorationVisibility] = useState<
    Record<number, boolean>
  >({});
  const [swirl1Scale, setSwirl1Scale] = useState(SWIRL_1_INITIAL_SCALE);
  const [swirl2Scale, setSwirl2Scale] = useState(SWIRL_2_INITIAL_SCALE);
  const [isSwirl1Growing, setIsSwirl1Growing] = useState(true);
  const [isSwirl2Growing, setIsSwirl2Growing] = useState(false);

  // Helper function to update scale with bounds checking
  const updateScale = useCallback(
    (
      prevScale: number,
      isGrowing: boolean,
      minScale: number,
      maxScale: number,
      step: number,
      setGrowing: (value: boolean) => void
    ): number => {
      if (isGrowing) {
        if (prevScale >= maxScale) {
          setGrowing(false);
          return maxScale;
        }
        return prevScale + step;
      }

      if (prevScale <= minScale) {
        setGrowing(true);
        return minScale;
      }
      return prevScale - step;
    },
    []
  );

  // Breathing effect for swirl 1
  useEffect(() => {
    const breatheInterval = setInterval(() => {
      setSwirl1Scale((prev) =>
        updateScale(
          prev,
          isSwirl1Growing,
          SWIRL_1_MIN_SCALE,
          SWIRL_1_MAX_SCALE,
          SWIRL_1_STEP,
          setIsSwirl1Growing
        )
      );
    }, BREATHING_INTERVAL_MS);

    return () => clearInterval(breatheInterval);
  }, [isSwirl1Growing, updateScale]);

  // Breathing effect for swirl 2
  useEffect(() => {
    const breatheInterval = setInterval(() => {
      setSwirl2Scale((prev) =>
        updateScale(
          prev,
          isSwirl2Growing,
          SWIRL_2_MIN_SCALE,
          SWIRL_2_MAX_SCALE,
          SWIRL_2_STEP,
          setIsSwirl2Growing
        )
      );
    }, BREATHING_INTERVAL_MS);

    return () => clearInterval(breatheInterval);
  }, [isSwirl2Growing, updateScale]);

  // Setup decoration visibility toggles
  useEffect(() => {
    const initialVisibility = RARE_DECORATIONS.reduce(
      (acc, decoration) => ({
        ...acc,
        [decoration.id]: true,
      }),
      {} as Record<number, boolean>
    );
    setDecorationVisibility(initialVisibility);

    const timers: NodeJS.Timeout[] = [];

    const scheduleToggle = (decorationId: number) => {
      const delay =
        DECORATION_TOGGLE_MIN_DELAY_MS +
        Math.random() *
          (DECORATION_TOGGLE_MAX_DELAY_MS - DECORATION_TOGGLE_MIN_DELAY_MS);

      const timer = setTimeout(() => {
        setDecorationVisibility((prev) => ({
          ...prev,
          [decorationId]: !prev[decorationId],
        }));
        scheduleToggle(decorationId);
      }, delay);

      timers.push(timer);
    };

    RARE_DECORATIONS.forEach((decoration) => {
      const initialDelay = Math.random() * DECORATION_INITIAL_MAX_DELAY_MS;
      setTimeout(() => scheduleToggle(decoration.id), initialDelay);
    });

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const getSwirlStyle = (scale: number, rotation: number) => ({
    filter: `brightness(${SWIRL_BRIGHTNESS})`,
    opacity: SWIRL_OPACITY,
    transition: `transform ${SWIRL_TRANSITION_DURATION} linear`,
    transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
  });

  const getDecorationStyle = (isVisible: boolean) => ({
    filter: `brightness(${DECORATION_BRIGHTNESS})`,
    opacity: isVisible ? 1 : 0,
    transition: `opacity ${DECORATION_TRANSITION_DURATION} ease-in-out`,
  });

  return (
    <>
      {/* Swirl 1 - Diagonal from top-left to bottom-right */}
      <img
        draggable={false}
        src={RARE_SWIRL_1}
        alt="Rare Swirl"
        className="absolute left-1/2 top-1/2 z-[-10] w-full h-auto pointer-events-none"
        style={getSwirlStyle(swirl1Scale, SWIRL_ROTATION_ANGLE_1)}
      />
      {/* Swirl 2 - Diagonal from top-right to bottom-left */}
      <img
        draggable={false}
        src={RARE_SWIRL_2}
        alt="Rare Swirl"
        className="absolute left-1/2 top-1/2 z-[-10] w-full h-auto pointer-events-none"
        style={getSwirlStyle(swirl2Scale, SWIRL_ROTATION_ANGLE_2)}
      />
      {/* Decorations - paws and sparkles with individual appear/disappear */}
      {RARE_DECORATIONS.map((decoration) => (
        <img
          key={decoration.id}
          draggable={false}
          src={decoration.image}
          alt="Decoration"
          className={decoration.className}
          style={getDecorationStyle(decorationVisibility[decoration.id])}
        />
      ))}
    </>
  );
};
