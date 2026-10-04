import { PixelButton } from "@/components/shared/PixelButton";
import { Tag } from "@/components/shared/Tag";
import { isLegendaryPromoActive, LEGENDARY_PROMO, packPrices, PackType } from "@/models/order";

/** The Legendary pack price: a sale (struck-through list price, sale price, end date) while it runs. */
export const LegendaryPrice = ({ now }: { now?: Date }) => {
  const regular = `$${packPrices[PackType.LEGENDARY]}`;
  if (!isLegendaryPromoActive(now)) {
    return <PixelButton text={regular} />;
  }
  return (
    <div className="flex flex-col items-center gap-1" data-testid="legendary-sale">
      <PixelButton
        text={
          <span>
            <s className="opacity-60 mr-2" aria-label={`was ${regular}`}>
              {regular}
            </s>
            ${LEGENDARY_PROMO.priceUsd}
          </span>
        }
      />
      <Tag size="sm">SALE {LEGENDARY_PROMO.label.toUpperCase()}</Tag>
    </div>
  );
};
