import { ModalButton } from "@/components/ui/modal";
import { StatusPill } from "@/components/ui/modal";
import { isLegendaryPromoActive, LEGENDARY_PROMO, packPrices, PackType } from "@/models/order";

/**
 * The Legendary pack's price button: a sale (struck-through list price, sale price, end date) while
 * it runs. `onClick` opens the checkout; without it the press reaches the pack card around it.
 */
export const LegendaryPrice = ({
  now,
  onClick,
  className,
  saleClassName,
}: {
  now?: Date;
  onClick?: () => void;
  className?: string;
  /** Extra classes on the "Sale until" pill (a narrow row lets it wrap). */
  saleClassName?: string;
}) => {
  const regular = `$${packPrices[PackType.LEGENDARY]}`;
  if (!isLegendaryPromoActive(now)) {
    return (
      <ModalButton variant="primary" onClick={onClick} className={className}>
        {regular}
      </ModalButton>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1.5 md:items-center" data-testid="legendary-sale">
      <ModalButton variant="primary" onClick={onClick} className={className}>
        {/* A struck price is not read out reliably: say it in words for screen readers. */}
        <s className="mr-2 decoration-2" aria-hidden="true">
          {regular}
        </s>
        <span className="sr-only">{`was ${regular}, now `}</span>
        ${LEGENDARY_PROMO.priceUsd}
      </ModalButton>
      <StatusPill tone="pink" icon="zap" className={saleClassName}>
        Sale {LEGENDARY_PROMO.label}
      </StatusPill>
    </div>
  );
};
