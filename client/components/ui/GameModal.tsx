import { ModalBoundary } from "@/components/errors/ModalBoundary";
import { CloseButton } from "@/components/shared/CloseButton";
import { useSuspendGame } from "@/hooks/useSuspendGame";
import * as Dialog from "@radix-ui/react-dialog";
import clsx from "clsx";
import { exemptAudioFromSuspension } from "@/lib/game/gameRegistry";
import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { PixelIcon, type PixelIconName } from "@/components/shared/PixelIcon";
import { applyLowFx } from "./lowfx";
import { PixelFrame } from "./PixelFrame";

/**
 * Surfaces. `panel` and `sheet` paint the "night sky" (PixelFrame `ambient`: top light, dusk glow,
 * pixel stars, inner vignette) and a header band with an optional icon tile and subtitle. Build
 * the body from the primitives in `components/ui/modal` (ModalSection, StatTile, ActionRow,
 * ModalButton, DangerZone, EmptyState, KeyValueRow, ModalTabs); docs/CLIENT.md "Modal system".
 *
 * - `panel`: the night PixelFrame with a gold title bar. Most modals.
 * - `art`: no frame; the children bring their own art (Wheel, Packs). The title is still
 *   rendered for assistive technology (visually hidden unless `titleVisible`).
 * - `sheet`: a bottom sheet on phones, a centred panel from `md` up (AuthSheet).
 */
export type GameModalSurface = "panel" | "art" | "sheet";
export type GameModalSize = "sm" | "md" | "lg" | "xl" | "full";
export type GameModalLayer = "modal" | "modal-nested" | "auth";

export interface GameModalProps {
  open: boolean;
  /** Called with `false` on X, Esc and scrim (when allowed). */
  onOpenChange: (open: boolean) => void;
  /** Accessible name; `aria-labelledby` points at it. Shown in Passion One, gold-400. */
  title: ReactNode;
  /** Shown under the title in the header band (Nunito, muted) and wired as aria-describedby. */
  description?: ReactNode;
  /** Optional icon tile left of the title (panel and sheet): a PixelIcon name or a node (sprite). */
  icon?: PixelIconName | ReactNode;
  /** The night-sky fill on panel and sheet. Default true; false keeps the flat gradient. */
  ambient?: boolean;
  surface?: GameModalSurface;
  size?: GameModalSize;
  /** `false`: no X, and Esc and scrim do nothing (a flow that must be finished). */
  dismissible?: boolean;
  /**
   * `false`: the X stays visible but is `aria-disabled`, and Esc and scrim do nothing, for
   * example during a Wheel spin so a tap cannot kill the reveal.
   */
  canClose?: boolean;
  /**
   * `false` for a step that needs third-party UI outside the dialog (Stripe 3DS, the Stellar
   * Wallets Kit): no focus trap, no Radix outside pointer blocking. Pair it with `allowOutside`.
   * The plain scrim still covers the page (so taps never reach the game or the lobby), so the
   * third-party layer must stack above this modal's layer (`z-modal` 100). Checked: Stripe's
   * 3DS iframe and the Stellar Wallets Kit 2.1 fixed modal (`z-[999]`, appended to `body`) do.
   */
  modal?: boolean;
  /** Outside interactions on elements this returns true for never dismiss the modal. */
  allowOutside?: (target: Element) => boolean;
  /** Element to focus on open. By default the dialog itself is focused (no mobile keyboard pop). */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Suspends the Phaser games while open (keyboard, loop, sound). Default true. */
  suspendGame?: boolean;
  /**
   * Keeps DOM audio (the music) playing while open, for modals with sound controls, so the player
   * hears the volume they set. Games still suspend. Taken in a layout effect, which runs before the
   * suspension's passive effect, so the music never pauses for a moment on open.
   */
  keepAudio?: boolean;
  /** Stacking layer. `modal-nested` for a modal opened from a modal; `auth` for the AuthSheet. */
  layer?: GameModalLayer;
  /** Stable name for the ModalBoundary telemetry. Defaults to the title text. */
  name?: string;
  /** Shows the title on the `art` surface too. */
  titleVisible?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

const SIZE_CLASSES: Record<GameModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-none h-full",
};

const LAYER_CLASSES: Record<GameModalLayer, string> = {
  modal: "z-modal",
  "modal-nested": "z-modal-nested",
  auth: "z-auth",
};

// Night scrim with a 4 px blur; the blur goes on low-end devices and for users who ask for less
// transparency (who also get a more opaque scrim).
const SCRIM_CLASSES =
  "fixed inset-0 bg-tt-night-950/70 backdrop-blur-[4px] lowfx:backdrop-filter-none reduced-transparency:backdrop-filter-none reduced-transparency:bg-tt-night-950/90 animate-tt-scrim-in motion-reduce:animate-none";

const TITLE_CLASSES =
  "font-primary uppercase leading-none tracking-wide text-tt-gold-400 text-p3 md:text-p2 short:!text-p3 [text-shadow:0_3px_0_rgb(var(--tt-gold-shadow))]";

const SAFE_AREA_PADDING = {
  paddingTop: "max(0.75rem, env(safe-area-inset-top))",
  paddingRight: "max(0.75rem, env(safe-area-inset-right))",
  paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
};

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "modal"
  );
}

export const GameModal = ({
  open,
  onOpenChange,
  title,
  description,
  icon,
  ambient = true,
  surface = "panel",
  size = "md",
  dismissible = true,
  canClose = true,
  modal = true,
  allowOutside,
  initialFocus,
  suspendGame = true,
  keepAudio = false,
  layer = "modal",
  name,
  titleVisible,
  className,
  bodyClassName,
  children,
}: GameModalProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closable = dismissible && canClose;

  useLayoutEffect(() => {
    if (!open || !keepAudio) return;
    return exemptAudioFromSuspension();
  }, [open, keepAudio]);
  useSuspendGame(open && suspendGame);
  useEffect(() => {
    applyLowFx();
  }, []);

  const close = () => {
    if (closable) onOpenChange(false);
  };

  const guardOutside = (event: { target: EventTarget | null; preventDefault: () => void }) => {
    const target = event.target;
    if (!closable || (allowOutside && target instanceof Element && allowOutside(target))) {
      event.preventDefault();
    }
  };

  const boundaryName = name ?? (typeof title === "string" ? slug(title) : "modal");
  const isSheet = surface === "sheet";
  const isArt = surface === "art";

  const closeButton = dismissible ? (
    <CloseButton
      placement={isArt ? "outside" : "inside"}
      onClick={close}
      disabled={!canClose}
      label="Close"
    />
  ) : null;

  const body = (
    <ModalBoundary name={boundaryName} onClose={closable ? close : undefined}>
      {children}
    </ModalBoundary>
  );

  return (
    <Dialog.Root
      open={open}
      modal={modal}
      onOpenChange={(next) => {
        if (next || closable) onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        {modal && (
          <Dialog.Overlay
            data-testid="game-modal-scrim"
            className={clsx(SCRIM_CLASSES, LAYER_CLASSES[layer])}
          />
        )}
        <div
          className={clsx(
            "pointer-events-none fixed inset-0 flex justify-center",
            LAYER_CLASSES[layer],
            isSheet ? "items-end px-0 md:items-center md:px-6" : "items-center p-3 md:p-6"
          )}
          style={
            isSheet
              ? { paddingTop: SAFE_AREA_PADDING.paddingTop }
              : {
                  ...SAFE_AREA_PADDING,
                  paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
                }
          }
        >
          {!modal && (
            // Non-modal dialogs get no Radix overlay; keep the same scrim so the game stays covered.
            // It lives inside the content wrapper, not in its own portal: Dialog.Portal gives every
            // child its own portal appended to <body>, so a scrim mounted when `modal` flips to
            // false (the Packs checkout) would land above the panel and swallow its taps.
            <div
              aria-hidden="true"
              data-testid="game-modal-scrim"
              className={clsx(SCRIM_CLASSES, "pointer-events-auto")}
            />
          )}
          <Dialog.Content
            ref={contentRef}
            data-surface={surface}
            // Without a description, opt out of Radix's describedby (and its dev warning).
            {...(description ? {} : { "aria-describedby": undefined })}
            onOpenAutoFocus={(event) => {
              // Still the opener here: Radix runs this before moving focus into the dialog.
              const active = document.activeElement;
              returnFocusRef.current =
                active instanceof HTMLElement && active !== document.body ? active : null;
              event.preventDefault();
              const target = initialFocus?.current ?? contentRef.current;
              target?.focus({ preventScroll: true });
            }}
            onCloseAutoFocus={(event) => {
              // Radix only returns focus to a Dialog.Trigger; our modals are opened by state, so
              // return it to whatever had focus when the modal opened.
              event.preventDefault();
              const opener = returnFocusRef.current;
              returnFocusRef.current = null;
              if (opener?.isConnected) opener.focus({ preventScroll: true });
            }}
            onEscapeKeyDown={(event) => {
              if (!closable) event.preventDefault();
            }}
            onPointerDownOutside={guardOutside}
            onFocusOutside={(event) => {
              // A non-modal dialog (a checkout with Stripe's 3DS layer) has no focus trap, so focus
              // can leave it without the player asking to close: the modal it was opened from
              // returning focus to the page, or the 3DS iframe taking it. Only a tap or Esc closes it.
              if (!modal) event.preventDefault();
            }}
            onInteractOutside={guardOutside}
            className={clsx(
              "pointer-events-auto relative flex max-h-full w-full flex-col text-tt-cream outline-none",
              SIZE_CLASSES[size],
              isSheet
                ? "animate-tt-sheet-in md:animate-tt-modal-in"
                : "animate-tt-modal-in",
              "motion-reduce:animate-none",
              className
            )}
          >
            {isArt ? (
              <>
                <Dialog.Title className={clsx(TITLE_CLASSES, !titleVisible && "sr-only")}>
                  {title}
                </Dialog.Title>
                {description && (
                  <Dialog.Description className="sr-only">{description}</Dialog.Description>
                )}
                {closeButton}
                <div className={clsx("relative min-h-0 flex-1", bodyClassName)}>{body}</div>
              </>
            ) : (
              <PixelFrame
                className="flex max-h-full min-h-0 w-full flex-col"
                ambient={ambient}
                // A hard pixel drop and a faint gold glow that follow the stepped corners. On the
                // decorative layers only, so `position: fixed` children still use the viewport.
                shadowClassName={clsx(
                  "[filter:drop-shadow(0_6px_0_rgb(var(--tt-night-950)))_drop-shadow(0_0_28px_rgb(var(--tt-gold-400)/0.14))]",
                  "lowfx:[filter:none]"
                )}
                contentClassName={clsx(
                  "flex min-h-0 flex-1 flex-col",
                  isSheet && "pb-[env(safe-area-inset-bottom)] md:pb-0"
                )}
              >
                {/* First in the tab order (it is absolutely placed at the top right anyway). */}
                {closeButton}
                <div
                  data-testid="game-modal-header"
                  className={clsx(
                    "tt-modal-header flex shrink-0 items-center gap-3 pb-3 pl-4 pt-4 md:pl-6 md:pt-5",
                    "short:!gap-2 short:!pb-2 short:!pt-2",
                    // px, not rem (phones scale rem with the viewport), and no `md:px-6`, which
                    // used to override the X's room between md and lg.
                    dismissible ? "pr-[56px] lg:pr-[80px]" : "pr-4 md:pr-6"
                  )}
                >
                  {icon != null && icon !== false && (
                    <span
                      aria-hidden="true"
                      data-testid="game-modal-icon"
                      className={clsx(
                        "flex h-[40px] w-[40px] shrink-0 items-center justify-center text-tt-gold-400 md:h-[48px] md:w-[48px] short:!h-[32px] short:!w-[32px]",
                        "bg-tt-night-950/60 [box-shadow:0_-2px_0_0_rgb(var(--tt-gold-500)/0.7),0_2px_0_0_rgb(var(--tt-gold-500)/0.7),-2px_0_0_0_rgb(var(--tt-gold-500)/0.7),2px_0_0_0_rgb(var(--tt-gold-500)/0.7),inset_0_0_12px_rgb(var(--tt-gold-400)/0.18)]"
                      )}
                    >
                      {typeof icon === "string" ? (
                        <PixelIcon name={icon as PixelIconName} size={24} />
                      ) : (
                        icon
                      )}
                    </span>
                  )}
                  <div className="flex min-w-0 flex-col gap-1">
                    <Dialog.Title className={TITLE_CLASSES}>{title}</Dialog.Title>
                    {description && (
                      <Dialog.Description className="font-sans text-p6 font-semibold leading-snug text-tt-muted md:text-p5 short:sr-only">
                        {description}
                      </Dialog.Description>
                    )}
                  </div>
                </div>
                <div
                  className={clsx(
                    "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4 md:px-6 md:pb-6",
                    "short:!px-4 short:!pb-3 short:!pt-3",
                    bodyClassName
                  )}
                >
                  {body}
                </div>
              </PixelFrame>
            )}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default GameModal;
