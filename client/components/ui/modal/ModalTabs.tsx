import clsx from "clsx";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { playUiSound } from "@/components/audio/uiSounds";
import { IconSlot, type ModalIcon } from "./IconSlot";

export interface ModalTab<T extends string = string> {
  id: T;
  label: ReactNode;
  icon?: ModalIcon;
  /** A count or dot after the label (`true` draws a dot): something new or claimable. */
  badge?: ReactNode | true;
  testId?: string;
  disabled?: boolean;
}

export interface ModalTabsProps<T extends string = string> {
  tabs: ReadonlyArray<ModalTab<T>>;
  value: T;
  onChange: (id: T) => void;
  /** Accessible name of the tablist ("Progress sections"). */
  label: string;
  /** Prefix for tab and panel ids; pair with ModalTabPanel's `idBase`. */
  idBase: string;
  className?: string;
}

export const tabId = (idBase: string, id: string) => `${idBase}-tab-${id}`;
export const panelId = (idBase: string, id: string) => `${idBase}-panel-${id}`;

/**
 * A single row of chips that scrolls sideways (edge fades hint at more) instead of wrapping into
 * stacks of big buttons. Arrow keys, Home and End move between tabs (roving tabindex).
 */
export function ModalTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idBase,
  className,
}: ModalTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${value}"]`);
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [value]);

  const enabled = tabs.filter((t) => !t.disabled);
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const i = enabled.findIndex((t) => t.id === value);
    let next: ModalTab<T> | undefined;
    if (event.key === "ArrowRight") next = enabled[(i + 1) % enabled.length];
    else if (event.key === "ArrowLeft") next = enabled[(i - 1 + enabled.length) % enabled.length];
    else if (event.key === "Home") next = enabled[0];
    else if (event.key === "End") next = enabled[enabled.length - 1];
    if (!next) return;
    event.preventDefault();
    onChange(next.id);
    listRef.current
      ?.querySelector<HTMLElement>(`[data-tab-id="${next.id}"]`)
      ?.focus({ preventScroll: true });
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={move}
      className={clsx("tt-tabs-scroll -mx-1 flex gap-2 overflow-x-auto px-1 py-1", className)}
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabId(idBase, tab.id)}
            aria-selected={selected}
            aria-controls={panelId(idBase, tab.id)}
            tabIndex={selected ? 0 : -1}
            disabled={tab.disabled}
            data-tab-id={tab.id}
            data-testid={tab.testId}
            onClick={() => {
              if (!selected) playUiSound("click");
              onChange(tab.id);
            }}
            className={clsx(
              "tt-btn relative inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap px-3 font-primary text-p5 uppercase leading-none tracking-wide",
              "outline-none focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-tt-gold-400",
              "transition-colors duration-150 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "bg-tt-gold-400 text-tt-gold-ink"
                : "bg-tt-night-950/50 text-tt-muted hover:bg-tt-night-600 hover:text-tt-cream"
            )}
            data-variant={selected ? "primary" : "tab"}
          >
            {tab.icon != null && <IconSlot icon={tab.icon} size={16} />}
            <span>{tab.label}</span>
            {tab.badge === true ? (
              <span aria-hidden="true" className="h-[8px] w-[8px] bg-tt-pink" />
            ) : (
              tab.badge != null && (
                <span className="bg-tt-pink px-1.5 font-sans text-p6 font-extrabold text-tt-night-950">
                  {tab.badge}
                </span>
              )
            )}
          </button>
        );
      })}
    </div>
  );
}

export const ModalTabPanel = ({
  idBase,
  id,
  className,
  children,
}: {
  idBase: string;
  id: string;
  className?: string;
  children?: ReactNode;
}) => (
  <div
    role="tabpanel"
    id={panelId(idBase, id)}
    aria-labelledby={tabId(idBase, id)}
    tabIndex={0}
    className={clsx("outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-tt-gold-400/60", className)}
  >
    {children}
  </div>
);

export default ModalTabs;
