import React, { useMemo } from "react";

interface Firefly {
  id: number;
  left: number;
  top: number;
  animationDuration: number;
  animationDelay: number;
  size: number;
  moveX1: number;
  moveY1: number;
  moveX2: number;
  moveY2: number;
  moveX3: number;
  moveY3: number;
}

export const Fireflies = () => {
  const fireflies = useMemo(() => {
    const count = 60;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      animationDuration: 8 + Math.random() * 12, // 8-20 seconds
      animationDelay: Math.random() * 5, // 0-5 seconds delay
      size: 4 + Math.random() * 4, // 4-8px
      moveX1: (Math.random() - 0.5) * 100,
      moveY1: (Math.random() - 0.5) * 100,
      moveX2: (Math.random() - 0.5) * 100,
      moveY2: (Math.random() - 0.5) * 100,
      moveX3: (Math.random() - 0.5) * 100,
      moveY3: (Math.random() - 0.5) * 100,
    }));
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {fireflies.map((firefly) => (
        <div
          key={firefly.id}
          className="firefly"
          style={
            {
              left: `${firefly.left}%`,
              top: `${firefly.top}%`,
              width: `${firefly.size}px`,
              height: `${firefly.size}px`,
              animation: `fireflyFloat ${firefly.animationDuration}s ease-in-out infinite`,
              animationDelay: `${firefly.animationDelay}s`,
              "--move-x1": `${firefly.moveX1}px`,
              "--move-y1": `${firefly.moveY1}px`,
              "--move-x2": `${firefly.moveX2}px`,
              "--move-y2": `${firefly.moveY2}px`,
              "--move-x3": `${firefly.moveX3}px`,
              "--move-y3": `${firefly.moveY3}px`,
              "--size": `${firefly.size}px`,
            } as React.CSSProperties
          }
        >
          <div className="firefly-glow" />
        </div>
      ))}
    </div>
  );
};
