import clsx from "clsx";
import { useId, type ReactNode } from "react";
import { IconSlot, type ModalIcon } from "./IconSlot";

/** `default` card, `highlight` (gold edge, the one thing to look at), `success`, `danger`, `plain` (no card). */
export type ModalSectionTone = "default" | "highlight" | "success" | "danger" | "plain";

export interface ModalSectionProps {
  /** Section heading (Passion One, gold). Omit for an untitled card. */
  title?: ReactNode;
  icon?: ModalIcon;
  /** One plain line under the heading that says what this section is for. */
  helper?: ReactNode;
  /** Right side of the heading row: a count, a pill, a small ghost button. */
  aside?: ReactNode;
  tone?: ModalSectionTone;
  /** Heading level; h3 under the modal's h2 title by default. */
  as?: "h3" | "h4";
  className?: string;
  bodyClassName?: string;
  "data-testid"?: string;
  children?: ReactNode;
}

/** A titled card inside a modal body. One card level only: do not nest sections. */
export const ModalSection = ({
  title,
  icon,
  helper,
  aside,
  tone = "default",
  as: Heading = "h3",
  className,
  bodyClassName,
  children,
  ...rest
}: ModalSectionProps) => {
  const id = useId();
  const hasHeader = title != null || aside != null;
  return (
    <section
      aria-labelledby={title != null ? `${id}-title` : undefined}
      data-tone={tone}
      data-testid={rest["data-testid"]}
      className={clsx(
        "tt-card relative flex flex-col",
        tone === "plain" ? "p-0" : "p-3 md:p-4 short:!p-2.5",
        className
      )}
    >
      {hasHeader && (
        <header className="mb-3 flex items-start gap-2 short:mb-2">
          {icon != null && (
            <span className="mt-[2px] text-tt-gold-400" aria-hidden="true">
              <IconSlot icon={icon} size={20} />
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {title != null && (
              <Heading
                id={`${id}-title`}
                className="font-primary text-p4 uppercase leading-none tracking-wide text-tt-gold-400"
              >
                {title}
              </Heading>
            )}
            {helper != null && (
              <p className="font-sans text-p6 font-semibold leading-snug text-tt-muted md:text-p5">
                {helper}
              </p>
            )}
          </div>
          {aside != null && <div className="ml-auto flex shrink-0 items-center gap-2">{aside}</div>}
        </header>
      )}
      <div className={clsx("flex flex-col gap-3", bodyClassName)}>{children}</div>
    </section>
  );
};

/** Vertical rhythm for a modal body: sections 16 px apart (12 px on short landscape). */
export const ModalStack = ({ className, children }: { className?: string; children?: ReactNode }) => (
  <div className={clsx("flex flex-col gap-4 short:gap-3", className)}>{children}</div>
);

export default ModalSection;
