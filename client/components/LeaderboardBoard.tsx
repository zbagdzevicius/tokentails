import { cdnFile } from "@/constants/utils";
import clsx from "clsx";
import type { ReactNode } from "react";
import { PixelIcon } from "./shared/PixelIcon";
import { EmptyState, LoadingState, ModalSection, type ModalIcon } from "./ui/modal";

export interface BoardRow {
  key: string;
  name: string;
  value: ReactNode;
}

const PODIUM = ["text-tt-gold-400", "text-tt-cream", "text-tt-rust"] as const;

/**
 * One EVENTS leaderboard on the night card: a mascot and a plain line saying what the board ranks,
 * the viewer's own place, then the ranking (top three get a crown tint). Loading and empty states
 * say what is going on instead of a bare header row.
 */
export const LeaderboardBoard = ({
  title,
  icon,
  helper,
  mascot,
  valueLabel,
  rows,
  loading,
  position,
  positionLoading,
  meName,
  emptyTitle,
  emptyBody,
  testId,
  emptyTestId,
}: {
  title: string;
  icon: ModalIcon;
  /** What the board ranks and what it pays, in one plain line. */
  helper: ReactNode;
  /** A cdn path of the mascot art beside the heading. */
  mascot: string;
  /** The ranked number's column name ("Tails"). */
  valueLabel: string;
  rows: BoardRow[] | undefined;
  loading: boolean;
  position?: number | null;
  /** The viewer's place is still loading: a skeleton, not "Not ranked yet" first. */
  positionLoading?: boolean;
  /** The viewer's name: their row is tinted only when the row at their place carries it. */
  meName?: string | null;
  emptyTitle: string;
  emptyBody: string;
  testId?: string;
  emptyTestId?: string;
}) => (
  // On a short landscape the helper and the mascot step aside, so the board has room for rows.
  <ModalSection title={title} icon={icon} helper={<span className="short:hidden">{helper}</span>} data-testid={testId}>
    <div className="flex items-end gap-3">
      <img
        src={cdnFile(mascot)}
        alt=""
        aria-hidden="true"
        draggable={false}
        // Smooth illustrations: no pixelated scaling (it gives them jagged edges).
        className="h-20 w-20 shrink-0 object-contain short:hidden md:h-24 md:w-24"
      />
      <div
        className="flex min-h-[56px] flex-1 items-center short:min-h-[44px] short:py-1 justify-between gap-2 bg-tt-gold-400/10 px-3 py-2 [box-shadow:inset_0_0_0_2px_rgb(var(--tt-gold-500)/0.6)]"
        data-testid="board-position"
      >
        <span className="font-sans text-p6 font-extrabold uppercase tracking-wider text-tt-muted">Your place</span>
        {position ? (
          <span className="font-primary text-p2 leading-none text-tt-gold-400">#{position}</span>
        ) : positionLoading ? (
          <span className="tt-skeleton inline-block h-6 w-14" aria-label="Loading your place" role="img" />
        ) : (
          <span className="font-sans text-p6 font-semibold text-tt-muted md:text-p5">Not ranked yet</span>
        )}
      </div>
    </div>

    {loading && !rows ? (
      <LoadingState rows={5} label={`Loading ${title}`} />
    ) : !rows || rows.length === 0 ? (
      <EmptyState compact icon="trophy" title={emptyTitle} body={emptyBody} data-testid={emptyTestId} />
    ) : (
      <div className="max-h-[50vh] overflow-y-auto short:max-h-none">
        <table className="w-full border-separate border-spacing-y-1 text-left text-tt-cream">
          <thead className="sticky top-0 z-10 bg-tt-night-800">
            <tr className="font-sans text-p6 font-extrabold uppercase tracking-wider text-tt-muted">
              <th scope="col" className="w-[4.5rem] px-2 py-1.5 text-center">
                Place
              </th>
              <th scope="col" className="px-2 py-1.5">
                Name
              </th>
              <th scope="col" className="px-2 py-1.5 text-right">
                {valueLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const podium = index < 3;
              const mine = !!position && index === position - 1 && (!meName || row.name === meName);
              return (
                <tr
                  key={row.key}
                  data-me={mine || undefined}
                  aria-current={mine ? "true" : undefined}
                  className={clsx(
                    "font-sans text-p5 font-bold md:text-p4",
                    mine
                      ? "bg-tt-mint/[0.14] [box-shadow:inset_0_0_0_2px_rgb(var(--tt-mint)/0.6)]"
                      : podium
                      ? "bg-tt-gold-400/[0.08]"
                      : "bg-tt-night-950/40"
                  )}
                >
                  <th scope="row" className="px-2 py-2 text-center font-primary text-p4 leading-none">
                    {podium ? (
                      <span className={clsx("inline-flex items-center gap-1", PODIUM[index])}>
                        <PixelIcon name="crown" size={14} />
                        {index + 1}
                      </span>
                    ) : (
                      <span className="text-tt-muted">{index + 1}</span>
                    )}
                  </th>
                  <td className="max-w-0 truncate px-2 py-2">
                    {row.name}
                    {mine && <span className="ml-1.5 text-tt-mint">(you)</span>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-primary text-p4 leading-none text-tt-gold-400">
                    {row.value}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </ModalSection>
);

export default LeaderboardBoard;
