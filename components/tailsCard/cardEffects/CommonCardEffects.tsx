import React, { useState, useEffect } from "react";

const CLAW_IMAGE = "/cards/backgrounds/claw.webp";
const WHISKERS_RIGHT_IMAGE = "/cards/backgrounds/whiskers-right.webp";
const WHISKERS_LFET_IMAGE = "/cards/backgrounds/whiskers-left.webp";

type ClawPosition = {
  id: number;
  side: "left" | "right";
  className: string;
};

const CLAW_POSITIONS: ClawPosition[] = [
  // Right side claws
  {
    id: 0,
    side: "right",
    className:
      "absolute right-[-12%] bottom-[0%] translate-x-1/2 -translate-y-1/2 z-[100] w-[14%] h-auto claw-glow pointer-events-none",
  },
  {
    id: 1,
    side: "right",
    className:
      "absolute right-[-23%] bottom-[12%] translate-x-1/2 -translate-y-1/2 z-[100] w-[18%] h-auto claw-glow pointer-events-none",
  },
  {
    id: 2,
    side: "right",
    className:
      "absolute right-[-18%] bottom-[25%] translate-x-1/2 -translate-y-1/2 z-[100] w-[12%] h-auto claw-glow pointer-events-none",
  },
  {
    id: 3,
    side: "right",
    className:
      "absolute right-[-16%] bottom-[40%] translate-x-1/2 -translate-y-1/2 z-[100] w-[15%] h-auto claw-glow pointer-events-none",
  },
  {
    id: 4,
    side: "right",
    className:
      "absolute right-[-20%] bottom-[55%] translate-x-1/2 -translate-y-1/2 z-[100] w-[13%] h-auto claw-glow pointer-events-none",
  },
  {
    id: 5,
    side: "right",
    className:
      "absolute right-[-14%] bottom-[70%] translate-x-1/2 -translate-y-1/2 z-[100] w-[16%] h-auto claw-glow pointer-events-none",
  },
  // Left side claws
  {
    id: 6,
    side: "left",
    className:
      "absolute left-[-20%] top-[0%] translate-x-1/2 -translate-y-1/2 z-[100] w-[14%] h-auto claw-glow pointer-events-none",
  },
  {
    id: 7,
    side: "left",
    className:
      "absolute left-[-38%] top-[12%] translate-x-1/2 -translate-y-1/2 z-[100] w-[18%] h-auto claw-glow pointer-events-none",
  },
  {
    id: 8,
    side: "left",
    className:
      "absolute left-[-28%] top-[25%] translate-x-1/2 -translate-y-1/2 z-[100] w-[12%] h-auto claw-glow pointer-events-none",
  },
  {
    id: 9,
    side: "left",
    className:
      "absolute left-[-33%] top-[40%] translate-x-1/2 -translate-y-1/2 z-[100] w-[15%] h-auto claw-glow pointer-events-none",
  },
  {
    id: 10,
    side: "left",
    className:
      "absolute left-[-25%] top-[55%] translate-x-1/2 -translate-y-1/2 z-[100] w-[13%] h-auto claw-glow pointer-events-none",
  },
  {
    id: 11,
    side: "left",
    className:
      "absolute left-[-35%] top-[70%] translate-x-1/2 -translate-y-1/2 z-[100] w-[16%] h-auto claw-glow pointer-events-none",
  },
];

export const CommonCardEffects: React.FC = () => {
  const [visibleClaws, setVisibleClaws] = useState<number[]>([]);

  useEffect(() => {
    const updateVisibleClaws = () => {
      const leftClaws = CLAW_POSITIONS.filter((p) => p.side === "left");
      const rightClaws = CLAW_POSITIONS.filter((p) => p.side === "right");

      // Randomly select 2-5 claws from each side (minimum 2, maximum 5, never all 6)
      const selectedLeftCount = Math.floor(Math.random() * 4) + 2;
      const selectedRightCount = Math.floor(Math.random() * 4) + 2;

      const shuffledLeft = [...leftClaws].sort(() => Math.random() - 0.5);
      const shuffledRight = [...rightClaws].sort(() => Math.random() - 0.5);

      const selectedLeft = shuffledLeft
        .slice(0, selectedLeftCount)
        .map((p) => p.id);
      const selectedRight = shuffledRight
        .slice(0, selectedRightCount)
        .map((p) => p.id);

      setVisibleClaws([...selectedLeft, ...selectedRight]);
    };

    // Initial display
    updateVisibleClaws();

    // Update every 2-4 seconds randomly
    const scheduleNext = () => {
      const delay = 2000 + Math.random() * 2000; // 2-4 seconds
      return setTimeout(() => {
        updateVisibleClaws();
        timeoutId = scheduleNext();
      }, delay);
    };

    let timeoutId = scheduleNext();

    return () => {
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <>
      {CLAW_POSITIONS.map((position) => (
        <img
          key={position.id}
          draggable={false}
          src={CLAW_IMAGE}
          alt="Claw"
          className={position.className}
          style={{
            filter: "brightness(1.2)",
            opacity: visibleClaws.includes(position.id) ? 1 : 0,
            transition: "opacity 0.8s ease-in-out",
          }}
        />
      ))}
      <img
        draggable={false}
        src={WHISKERS_RIGHT_IMAGE}
        alt="Whiskers"
        className="absolute right-[120%] top-[10%] translate-x-1/2 -translate-y-1/2 z-[100] w-[90%] h-auto whiskers-breathe pointer-events-none"
        style={{ filter: "brightness(1.6)" }}
      />
      <img
        draggable={false}
        src={WHISKERS_LFET_IMAGE}
        alt="Whiskers"
        className="absolute left-[50%] bottom-[-50%] translate-x-1/2 -translate-y-1/2 z-[100] w-[90%] h-auto whiskers-breathe pointer-events-none"
        style={{ filter: "brightness(1.6)" }}
      />
    </>
  );
};
