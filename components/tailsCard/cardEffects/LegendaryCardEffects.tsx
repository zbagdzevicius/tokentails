import React, { useState, useEffect } from "react";

const LEGENDARY_BG = "/cards/backgrounds/legendary-bg.webp";
const LEGENDARY_PAWS = "/cards/backgrounds/legendary-sparkle.webp";

type PawPosition = {
  id: number;
  side: "left" | "right";
  className: string;
};

const PAW_POSITIONS: PawPosition[] = [
  // Right side paws
  {
    id: 0,
    side: "right",
    className:
      "absolute right-[-12%] bottom-[0%] translate-x-1/2 -translate-y-1/2 z-[100] w-[14%] h-auto paw-glow pointer-events-none opacity-[0.5]",
  },
  {
    id: 1,
    side: "right",
    className:
      "absolute right-[-23%] bottom-[12%] translate-x-1/2 -translate-y-1/2 z-[100] w-[18%] h-auto paw-glow pointer-events-none opacity-[0.5]",
  },
  {
    id: 2,
    side: "right",
    className:
      "absolute right-[-18%] bottom-[25%] translate-x-1/2 -translate-y-1/2 z-[100] w-[12%] h-auto paw-glow pointer-events-none opacity-[0.5]",
  },
  {
    id: 3,
    side: "right",
    className:
      "absolute right-[-16%] bottom-[40%] translate-x-1/2 -translate-y-1/2 z-[100] w-[15%] h-auto paw-glow pointer-events-none opacity-[0.5]",
  },
  {
    id: 4,
    side: "right",
    className:
      "absolute right-[-20%] bottom-[55%] translate-x-1/2 -translate-y-1/2 z-[100] w-[13%] h-auto paw-glow pointer-events-none opacity-[0.5]",
  },
  {
    id: 5,
    side: "right",
    className:
      "absolute right-[-14%] bottom-[70%] translate-x-1/2 -translate-y-1/2 z-[100] w-[16%] h-auto paw-glow pointer-events-none opacity-[0.5]",
  },
  // Left side paws
  {
    id: 6,
    side: "left",
    className:
      "absolute left-[-20%] top-[0%] translate-x-1/2 -translate-y-1/2 z-[100] w-[14%] h-auto paw-glow pointer-events-none opacity-[0.5]",
  },
  {
    id: 7,
    side: "left",
    className:
      "absolute left-[-38%] top-[12%] translate-x-1/2 -translate-y-1/2 z-[100] w-[18%] h-auto paw-glow pointer-events-none opacity-[0.5]",
  },
  {
    id: 8,
    side: "left",
    className:
      "absolute left-[-28%] top-[25%] translate-x-1/2 -translate-y-1/2 z-[100] w-[12%] h-auto paw-glow pointer-events-none opacity-[0.5]",
  },
  {
    id: 9,
    side: "left",
    className:
      "absolute left-[-33%] top-[40%] translate-x-1/2 -translate-y-1/2 z-[100] w-[15%] h-auto paw-glow pointer-events-none opacity-[0.5]",
  },
  {
    id: 10,
    side: "left",
    className:
      "absolute left-[-25%] top-[55%] translate-x-1/2 -translate-y-1/2 z-[100] w-[13%] h-auto paw-glow pointer-events-none opacity-[0.5]",
  },
  {
    id: 11,
    side: "left",
    className:
      "absolute left-[-35%] top-[70%] translate-x-1/2 -translate-y-1/2 z-[100] w-[16%] h-auto paw-glow pointer-events-none opacity-[0.5]",
  },
];

export const LegendaryCardEffects: React.FC = () => {
  const [showFirst, setShowFirst] = useState(true);
  const [visiblePaws, setVisiblePaws] = useState<number[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setShowFirst((prev) => !prev);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateVisiblePaws = () => {
      // Randomly select 8-11 paws from all positions
      const selectedCount = Math.floor(Math.random() * 4) + 8; // 8-11 paws
      const shuffled = [...PAW_POSITIONS].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, selectedCount).map((p) => p.id);

      setVisiblePaws(selected);
    };

    // Initial display
    updateVisiblePaws();

    // Update every 2-4 seconds randomly
    const scheduleNext = () => {
      const delay = 2000 + Math.random() * 2000; // 2-4 seconds
      return setTimeout(() => {
        updateVisiblePaws();
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
      <img
        draggable={false}
        src={LEGENDARY_BG}
        alt="Legendary Background"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] h-[100%] object-cover pointer-events-none z-[-2]"
        style={{
          filter: "brightness(1)",
          transform: "translate(-50%, -50%) scale(1.7)",
          opacity: showFirst ? 1 : 0.3,
          transition: "opacity 2s ease-in-out",
        }}
      />
      <img
        draggable={false}
        src={LEGENDARY_BG}
        alt="Legendary Background"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[100%] h-[100%] object-cover pointer-events-none z-[-2]"
        style={{
          filter: "brightness(1)",
          transform: "translate(-50%, -50%) scaleY(-1) scale(1.7)",
          opacity: showFirst ? 0.3 : 1,
          transition: "opacity 2s ease-in-out",
        }}
      />
      {PAW_POSITIONS.map((position) => (
        <img
          key={position.id}
          draggable={false}
          src={LEGENDARY_PAWS}
          alt="Legendary Paw"
          className={position.className}
          style={{
            filter: "brightness(2)",
            opacity: visiblePaws.includes(position.id) ? 0.65 : 0,
            transition: "opacity 0.6s ease-in-out",
          }}
        />
      ))}
    </>
  );
};
