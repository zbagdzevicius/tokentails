/** Run progress to the flag (night palette, G6). Leaves room for the X on the right. */
export const ProgressBar = ({ progress }: { progress: number }) => {
  if (!progress) return null;

  return (
    <div
      className="pointer-events-none absolute left-[max(1rem,env(safe-area-inset-left))] right-[calc(env(safe-area-inset-right)+4.5rem)] top-[max(0.75rem,env(safe-area-inset-top))] h-3 rounded-full bg-tt-night-900/75 p-[2px] ring-2 ring-inset ring-tt-gold-500/60 lg:right-[calc(env(safe-area-inset-right)+6rem)] lg:top-5 lg:h-4"
      role="progressbar"
      aria-label="Distance to the flag"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-tt-lilac to-tt-gold-400"
        style={{ width: `${progress}%` }}
      ></div>
    </div>
  );
};
