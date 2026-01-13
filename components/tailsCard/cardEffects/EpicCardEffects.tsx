import React, { useState, useEffect } from "react";

const EPIC_CLAW = "/cards/backgrounds/epic-claw.webp";
const EPIC_CLAW2 = "/cards/backgrounds/epic-claw2.webp";
const EPIC_WRAP = "/cards/backgrounds/epic-wrap.webp";
const EPIC_PAW = "/cards/backgrounds/epic-paw.webp";

type PawPosition = {
  id: number;
  className: string;
  rotation: number;
};

// 16 predefined paw positions concentrated in corners and edges
const PAW_POSITIONS: PawPosition[] = [
  // Top-left corner
  {
    id: 0,
    className:
      "absolute left-[5%] top-[8%] z-[120] w-[18%] h-auto pointer-events-none epic-paw-glow",
    rotation: 15,
  },
  {
    id: 1,
    className:
      "absolute left-[15%] top-[5%] z-[120] w-[20%] h-auto pointer-events-none epic-paw-glow",
    rotation: -25,
  },
  // Top-right corner
  {
    id: 2,
    className:
      "absolute left-[85%] top-[8%] z-[120] w-[22%] h-auto pointer-events-none epic-paw-glow",
    rotation: 30,
  },
  {
    id: 3,
    className:
      "absolute left-[78%] top-[5%] z-[120] w-[19%] h-auto pointer-events-none epic-paw-glow",
    rotation: -35,
  },
  // Left edge
  {
    id: 4,
    className:
      "absolute left-[8%] top-[25%] z-[120] w-[21%] h-auto pointer-events-none epic-paw-glow",
    rotation: 20,
  },
  {
    id: 5,
    className:
      "absolute left-[5%] top-[45%] z-[120] w-[17%] h-auto pointer-events-none epic-paw-glow",
    rotation: -30,
  },
  {
    id: 6,
    className:
      "absolute left-[10%] top-[65%] z-[120] w-[19%] h-auto pointer-events-none epic-paw-glow",
    rotation: 25,
  },
  // Right edge
  {
    id: 7,
    className:
      "absolute left-[88%] top-[25%] z-[120] w-[23%] h-auto pointer-events-none epic-paw-glow",
    rotation: -15,
  },
  {
    id: 8,
    className:
      "absolute left-[90%] top-[45%] z-[120] w-[20%] h-auto pointer-events-none epic-paw-glow",
    rotation: 10,
  },
  {
    id: 9,
    className:
      "absolute left-[85%] top-[65%] z-[120] w-[21%] h-auto pointer-events-none epic-paw-glow",
    rotation: -40,
  },
  // Bottom-left corner
  {
    id: 10,
    className:
      "absolute left-[8%] top-[85%] z-[120] w-[18%] h-auto pointer-events-none epic-paw-glow",
    rotation: -25,
  },
  {
    id: 11,
    className:
      "absolute left-[18%] top-[90%] z-[120] w-[16%] h-auto pointer-events-none epic-paw-glow",
    rotation: 35,
  },
  // Bottom-right corner
  {
    id: 12,
    className:
      "absolute left-[82%] top-[85%] z-[120] w-[22%] h-auto pointer-events-none epic-paw-glow",
    rotation: 15,
  },
  {
    id: 13,
    className:
      "absolute left-[75%] top-[90%] z-[120] w-[24%] h-auto pointer-events-none epic-paw-glow",
    rotation: -20,
  },
  // Sparse middle positions
  {
    id: 14,
    className:
      "absolute left-[35%] top-[30%] z-[120] w-[15%] h-auto pointer-events-none epic-paw-glow",
    rotation: 40,
  },
  {
    id: 15,
    className:
      "absolute left-[60%] top-[65%] z-[120] w-[16%] h-auto pointer-events-none epic-paw-glow",
    rotation: -12,
  },
];

export const EpicCardEffects = () => {
  const [showFirstClaw, setShowFirstClaw] = useState(true);
  const [visiblePaws, setVisiblePaws] = useState<number[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Mark component as mounted to avoid hydration mismatch
    setMounted(true);

    // Alternating claws effect
    const interval = setInterval(() => {
      setShowFirstClaw((prev) => !prev);
    }, 2500);

    // Paw visibility randomizer - similar to CommonCardEffects
    const updateVisiblePaws = () => {
      // Show 8-12 random paws at a time (out of 16 total)
      const count = 8 + Math.floor(Math.random() * 5);
      const shuffled = [...PAW_POSITIONS].sort(() => Math.random() - 0.5);
      setVisiblePaws(shuffled.slice(0, count).map((p) => p.id));
    };

    // Initial display - delay slightly to ensure mount state is set
    const initialTimeout = setTimeout(() => {
      updateVisiblePaws();
    }, 50);

    // Update every 2-4 seconds randomly for more natural appearance
    const scheduleNext = () => {
      const delay = 2000 + Math.random() * 2000; // 2-4 seconds
      return setTimeout(() => {
        updateVisiblePaws();
        timeoutId = scheduleNext();
      }, delay);
    };

    let timeoutId = scheduleNext();

    return () => {
      clearInterval(interval);
      clearTimeout(timeoutId);
      clearTimeout(initialTimeout);
    };
  }, []);

  return (
    <>
      <img
        src={EPIC_WRAP}
        alt="epic wrap center"
        className="absolute left-1/2 top-1/2 z-[-1] w-100 h-100 pointer-events-none select-none claw-glow"
        draggable={false}
        style={{
          transform: "translate(-50%, -50%) scale(2)",
        }}
      />
      {/* Epic paws */}
      {PAW_POSITIONS.map((position) => (
        <img
          key={position.id}
          src={EPIC_PAW}
          alt="Epic Paw"
          className={position.className}
          style={{
            opacity: mounted && visiblePaws.includes(position.id) ? 1 : 0,
            transition: "opacity 1.5s ease-in-out",
            filter: "brightness(1.3)",
            transform: `rotate(${position.rotation}deg)`,
          }}
          draggable={false}
        />
      ))}
      <img
        src={EPIC_CLAW}
        alt="epic claw right"
        className="absolute left-[90%] top-0 z-[250] w-100 h-100 pointer-events-none select-none claw-glow"
        draggable={false}
        style={{
          opacity: showFirstClaw ? 0.7 : 0,
          transform: "translate(-50%, -50%) scale(0.7)",
          transition: "opacity 0.8s cubic-bezier(0.4,0,0.2,1)",
        }}
      />
      <img
        src={EPIC_CLAW2}
        alt="epic claw left"
        className="absolute left-[10%] top-[100%] z-[250] w-100 h-100 pointer-events-none select-none claw-glow"
        draggable={false}
        style={{
          opacity: showFirstClaw ? 0.7 : 0,
          transform: "translate(-50%, -50%) scale(0.7)",
          transition: "opacity 0.8s cubic-bezier(0.4,0,0.2,1)",
        }}
      />
    </>
  );
};
