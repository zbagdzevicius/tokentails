import type { CSSProperties } from "react";

// A short burst of falling paws after a treat lands. CSS only, no dependency, and it stays still
// for people who ask for reduced motion.
const PAWS = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i % 7) * 0.12,
  size: 18 + ((i * 13) % 18),
  turn: ((i * 53) % 90) - 45,
}));

export const Celebration = () => (
  <div className="pointer-events-none fixed inset-0 z-[9000] overflow-hidden" aria-hidden="true">
    <style>{`
      @keyframes tt-paw-fall {
        0% { transform: translateY(-10vh) rotate(0deg); opacity: 0; }
        10% { opacity: 1; }
        100% { transform: translateY(110vh) rotate(var(--tt-turn)); opacity: 0; }
      }
      .tt-paw { position: absolute; top: 0; animation: tt-paw-fall 1.8s ease-in forwards; }
      @media (prefers-reduced-motion: reduce) { .tt-paw { display: none; } }
    `}</style>
    {PAWS.map((p, i) => (
      <span
        key={i}
        className="tt-paw"
        style={
          {
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            fontSize: p.size,
            "--tt-turn": `${p.turn * 8}deg`,
          } as CSSProperties
        }
      >
        🐾
      </span>
    ))}
  </div>
);

export default Celebration;
