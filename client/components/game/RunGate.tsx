import { analytics, buildEvent } from "@/analytics";
import { GameEvents, type IRunHintEvent } from "@/components/Phaser/events";
import { guardsAccessibleLabel, guardsLabel, PAW_GUARD_NAME, type PawGuards } from "@/components/Phaser/onboarding/checkpoint";
import { ftueStore } from "@/components/Phaser/onboarding/ftue-store";
import { gateVariant, isExitKey, type GateVariant } from "@/components/Phaser/onboarding/run-gate";
import { lastInputKind, subscribeInputKind, type GateCopy, type InputKind } from "@/components/Phaser/onboarding/hints";
import { PixelFrame } from "@/components/ui/PixelFrame";
import { Capacitor } from "@capacitor/core";
import clsx from "clsx";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";

/**
 * The start gate of a run (plan G10). Renders inside the mode's container at `z-gate` (80, F3.2),
 * under the mode's close button, so the X stays clickable.
 *
 * It shows when the scene sends RUN_READY and goes when it sends RUN_BEGIN. On the first visit to
 * a level it is the full card (title, goal, controls, Paw Guards); after that, a pill. The card is
 * `pointer-events-none` apart from Back: a tap anywhere else reaches the canvas, where the scene
 * takes it as the start (and does not jump on it). Keys: Space, W and the up arrow start (the
 * scene listens); Tab reaches Back, Enter or Space on Back goes back; Esc and Android back go to
 * the level map. The scene turns Phaser's key capture off while the gate is open.
 */

/** The current input device, re-rendering on change. */
export function useInputKind(): InputKind {
  return useSyncExternalStore(
    (onChange) => subscribeInputKind(onChange),
    lastInputKind,
    () => "touch" as InputKind,
  );
}

/** A pixel paw (Paw Guard). Decorative unless `label` is set. */
export const PawGuardIcon = ({ size = 20, className, label }: { size?: number; className?: string; label?: string }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={clsx("shrink-0", className)}
    fill="currentColor"
    role={label ? "img" : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
    shapeRendering="crispEdges"
  >
    <path d="M3 8h4v5H3zM8 3h4v5H8zM13 3h4v5h-4zM18 8h4v5h-4zM8 12h9v2H8zM6 14h13v4H6zM7 18h11v2H7zM9 20h7v1H9z" />
  </svg>
);

export interface RunGateProps {
  /** GameType value, for the seen-before store and analytics. */
  mode: string;
  level: string | null;
  /** The card's words for the current input device. */
  copy: (input: InputKind) => GateCopy;
  /** Paw Guards for this attempt (null: unlimited; undefined: the mode has none). */
  guards?: PawGuards;
  /** The endless run (INFINITE): it is never cleared, so the guard line says so. */
  endless?: boolean;
  /** Back to the level map (Back, Esc, Android back). */
  onBack: () => void;
  /** Forces a variant (tests, or a mode that always shows the full card). */
  variant?: GateVariant;
  className?: string;
}

type GateState = { open: false } | { open: true; variant: GateVariant; guards?: PawGuards };

export const RunGate = ({ mode, level, copy, guards, endless, onBack, variant: forced, className }: RunGateProps) => {
  const [state, setState] = useState<GateState>({ open: false });
  const input = useInputKind();
  const backRef = useRef<HTMLButtonElement>(null);
  const latest = useRef({ mode, level, guards, forced, onBack });
  useEffect(() => {
    latest.current = { mode, level, guards, forced, onBack };
  });

  const onReady = useCallback((event?: { guards?: number | null }) => {
    const { mode: m, level: l, guards: g, forced: f } = latest.current;
    const seenBefore = ftueStore.gateSeen(m, l);
    const variant = f ?? gateVariant({ seenBefore });
    if (variant === "full") {
      ftueStore.markGateSeen(m, l);
      try {
        analytics.track(buildEvent("ftue_gate_shown", { mode: m, level: l }));
      } catch {
        // Analytics never breaks the game.
      }
    }
    const fromScene = event && "guards" in event ? event.guards : undefined;
    setState({ open: true, variant, guards: fromScene !== undefined ? fromScene : g });
  }, []);
  const onClose = useCallback(() => setState({ open: false }), []);

  GameEvents.RUN_READY.use(onReady);
  GameEvents.RUN_BEGIN.use(onClose);
  GameEvents.GAME_STOP.use(onClose);

  // Esc and Android back go to the level map while the gate is open.
  useEffect(() => {
    if (!state.open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!isExitKey(event)) return;
      // A dialog over the gate (a modal, the toast centre) takes its own Esc (5a review #7).
      if (event.defaultPrevented || dialogOpen()) return;
      event.preventDefault();
      latest.current.onBack();
    };
    window.addEventListener("keydown", onKey);
    let removeBack: (() => void) | null = null;
    let disposed = false;
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app")
        .then(({ App }) =>
          App.addListener("backButton", () => {
            if (!dialogOpen()) latest.current.onBack();
          }),
        )
        .then((handle) => {
          if (disposed) void handle.remove();
          else removeBack = () => void handle.remove();
        })
        .catch(() => {});
    }
    return () => {
      disposed = true;
      window.removeEventListener("keydown", onKey);
      removeBack?.();
    };
  }, [state.open]);

  if (!state.open) return null;
  const words = copy(input);
  const shownGuards = state.guards;
  const live = `${words.title}. ${words.start}.`;

  // Space and Enter on Back belong to the button, not to the scene's start listener.
  const onBackKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") event.stopPropagation();
  };

  const back = (
    <button
      ref={backRef}
      type="button"
      onClick={onBack}
      onKeyDown={onBackKeyDown}
      className={clsx(
        "pointer-events-auto inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md px-3",
        "font-secondary text-p5 uppercase tracking-wider text-tt-lilac hover:text-tt-cream",
        "outline-none focus-visible:ring-4 focus-visible:ring-tt-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-tt-night-900",
      )}
      data-testid="run-gate-back"
    >
      <span aria-hidden="true">‹</span> Back
    </button>
  );

  return (
    <div
      role="group"
      aria-label={words.title}
      data-testid="run-gate"
      data-variant={state.variant}
      className={clsx("pointer-events-none absolute inset-0 z-gate flex flex-col items-center", className)}
    >
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
      {state.variant === "full" ? (
        // Clear of the cat (the camera keeps it at the centre): at the bottom on desktop, at the
        // top on phones and tablets, where the mobile controls fill the bottom.
        <div
          className={clsx(
            "flex h-full w-full items-end justify-center px-4 pb-[max(3rem,8vh)] pt-[max(4.5rem,env(safe-area-inset-top))]",
            "max-lg:items-start max-lg:pb-2 max-lg:pt-[max(4.25rem,calc(env(safe-area-inset-top)+3.5rem))]",
            "[@media(max-height:500px)]:pt-[max(0.5rem,env(safe-area-inset-top))]",
          )}
        >
          <PixelFrame
            className="w-full max-w-[min(26rem,calc(100vw-2rem))] motion-safe:animate-[opacity_200ms_ease-out] [@media(max-height:500px)]:max-w-[min(30rem,calc(100vw-16rem))]"
            contentClassName="flex flex-col items-center gap-1 px-3 py-2 text-center lg:gap-2 lg:px-4 lg:py-4"
            shadowClassName="drop-shadow-[0_10px_0_rgba(7,5,26,0.55)]"
          >
            <h2 className="font-primary text-p2 leading-none lg:text-p1 text-tt-gold-400 [text-shadow:0_3px_0_rgb(var(--tt-gold-shadow))]">
              {words.title}
            </h2>
            <p className="font-sans text-p6 font-extrabold leading-snug text-tt-cream lg:text-p5">{words.goal}</p>
            {/* On short landscape screens the on-screen controls say it already. */}
            <p className="font-sans text-p6 font-bold leading-snug text-tt-muted lg:text-p5 [@media(max-height:500px)]:hidden">
              {words.controls}
            </p>
            {shownGuards !== undefined && <GuardsLine guards={shownGuards} endless={!!endless} />}
            <div className="flex flex-col items-center [@media(max-height:500px)]:flex-row-reverse [@media(max-height:500px)]:gap-4">
              <p
                className="font-secondary text-p4 uppercase lg:mt-1 lg:text-p3 tracking-wider text-tt-gold-400 motion-safe:animate-pulse"
                data-testid="run-gate-start"
              >
                {words.start}
              </p>
              {back}
            </div>
          </PixelFrame>
        </div>
      ) : (
        <div className="mt-auto flex items-center gap-2 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))] max-lg:pb-[max(8.5rem,calc(env(safe-area-inset-bottom)+8rem))]">
          <div className="flex items-center gap-3 rounded-full bg-tt-night-900/85 py-1 pl-1 pr-4 ring-2 ring-inset ring-tt-gold-500/70">
            {back}
            {shownGuards !== undefined && (
              <span className="flex items-center gap-1 font-secondary text-p5 tracking-wider text-tt-pink">
                <PawGuardIcon size={16} />
                <span aria-hidden="true">{guardsLabel(shownGuards)}</span>
                <span className="sr-only">{guardsAccessibleLabel(shownGuards)}</span>
              </span>
            )}
            <span className="font-secondary text-p4 uppercase tracking-wider text-tt-gold-400 motion-safe:animate-pulse" data-testid="run-gate-start">
              {words.start}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

/** Whether a dialog sits over the gate (it owns Esc and Android back then). */
const dialogOpen = (): boolean => {
  try {
    return !!document.querySelector('[role="dialog"],[role="alertdialog"]');
  } catch {
    return false;
  }
};

/** The gate's Paw Guard line, built from the allowance (5a review #3). */
export function guardsLineText(guards: PawGuards, endless: boolean): string {
  if (guards === null) return `${PAW_GUARD_NAME}: a slip just sends you back a bit. Unlimited here.`;
  if (guards > 0) return `${PAW_GUARD_NAME} ${guardsLabel(guards)}: ${guards} ${guards === 1 ? "slip" : "slips"} without losing the run.`;
  return endless
    ? `No ${PAW_GUARD_NAME} on Infinite. One hit ends the run.`
    : `No ${PAW_GUARD_NAME} on cleared levels. One hit ends the run.`;
}

const GuardsLine = ({ guards, endless }: { guards: PawGuards; endless: boolean }) => (
  <p
    className="flex items-center justify-center gap-2 rounded-md bg-tt-night-900/70 px-3 py-1 font-sans text-p6 font-bold lg:text-p5 text-tt-cream ring-1 ring-inset ring-tt-pink/40"
    data-testid="run-gate-guards"
  >
    <PawGuardIcon size={18} className="text-tt-pink" />
    {guards === null ? (
      <span>
        {PAW_GUARD_NAME}: a slip just sends you back a bit. <span className="text-tt-pink">Unlimited</span> here.
      </span>
    ) : guards > 0 ? (
      <span>
        {PAW_GUARD_NAME} <span className="text-tt-pink">{guardsLabel(guards)}</span>: {guards}{" "}
        {guards === 1 ? "slip" : "slips"} without losing the run.
      </span>
    ) : (
      <span>{guardsLineText(guards, endless)}</span>
    )}
  </p>
);

/**
 * The Paw Guard HUD: a paw and "×3" with text for screen readers (G10). `guards` undefined hides
 * it (modes without guards).
 */
export const PawGuardHud = ({ guards, className }: { guards: PawGuards | undefined; className?: string }) => {
  if (guards === undefined) return null;
  return (
    <div
      className={clsx(
        "pointer-events-none flex items-center gap-1 rounded-full bg-tt-night-900/80 px-3 py-1 ring-2 ring-inset ring-tt-pink/60",
        className,
      )}
      data-testid="paw-guard-hud"
    >
      <PawGuardIcon size={18} className="text-tt-pink" />
      <span className="font-secondary text-p4 leading-none tracking-wider text-tt-cream" aria-hidden="true">
        {guardsLabel(guards)}
      </span>
      <span className="sr-only" aria-live="polite">
        {guardsAccessibleLabel(guards)}
      </span>
    </div>
  );
};

/**
 * First-run hints (G10): a frozen "JUMP!" prompt or a slow-motion teach line, sent by the scene as
 * RUN_HINT and cleared by RUN_HINT_DONE, RUN_BEGIN of a new attempt, or GAME_STOP. Never takes
 * pointer input, so the tap that answers the prompt reaches the canvas.
 */
export const RunHint = ({ className }: { className?: string }) => {
  const [hint, setHint] = useState<IRunHintEvent | null>(null);
  const onHint = useCallback((event?: IRunHintEvent) => {
    if (event) setHint(event);
  }, []);
  const onDone = useCallback((event?: { hint: string }) => {
    setHint((current) => (!event || !current || current.hint === event.hint ? null : current));
  }, []);
  const clear = useCallback(() => setHint(null), []);
  GameEvents.RUN_HINT.use(onHint);
  GameEvents.RUN_HINT_DONE.use(onDone);
  GameEvents.GAME_STOP.use(clear);
  GameEvents.GAME_RESTART.use(clear);

  if (!hint) return null;
  const prompt = hint.kind === "prompt";
  const [title, ...rest] = prompt ? hint.text.split("\n") : [hint.text];
  return (
    <div
      className={clsx("pointer-events-none absolute inset-x-0 top-[22%] z-gate flex justify-center px-4", className)}
      data-testid="run-hint"
      data-hint={hint.hint}
      data-kind={hint.kind}
    >
      <div role="status" aria-live="assertive" className="flex flex-col items-center gap-1 text-center">
        {prompt ? (
          <>
            <span className="font-primary text-h5 leading-none text-tt-gold-400 [text-shadow:0_4px_0_rgb(var(--tt-gold-shadow)),0_0_24px_rgba(255,204,85,0.45)] motion-safe:animate-bounce">
              {title}
            </span>
            {rest.length > 0 && (
              <span className="rounded-full bg-tt-night-900/85 px-4 py-1 font-sans text-p4 font-extrabold text-tt-cream ring-2 ring-inset ring-tt-gold-500/70">
                {rest.join(" ")}
              </span>
            )}
          </>
        ) : (
          <span className="rounded-full bg-tt-night-900/85 px-4 py-2 font-sans text-p4 font-extrabold text-tt-cream ring-2 ring-inset ring-tt-lilac/60">
            {title}
          </span>
        )}
      </div>
    </div>
  );
};
