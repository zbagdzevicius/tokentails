import { ORDER_API } from "@/api/order-api";
import { useToast } from "@/context/ToastContext";
import { PACK_ODDS, PackType } from "@/models/order";
import { EntityType } from "@/models/save";
import { useMemo, useState } from "react";
import { PixelButton } from "../shared/PixelButton";
import { Tag } from "../shared/Tag";
import { StripePayment } from "./StripePayment";
import { cdnFile } from "@/constants/utils";
import { IMessage } from "@/models/cats";
import { isApp } from "@/models/app";
import { CryptoCheckout } from "./crypto/CryptoCheckout";
import { skuFor } from "./crypto/checkout";
import { cryptoPayOpen, serverPriceUsd, useCryptoPayConfig } from "./crypto/useCryptoPayConfig";
import { AppCheckoutNotice } from "./AppCheckoutNotice";
import { ModalButton } from "@/components/ui/modal";
import { useAccountAction } from "@/hooks/useAccountAction";

// "crypto" is the EVM checkout (USDC / EURC, docs/API.md "Crypto checkout"). It replaced the
// Stellar pack purchase: no pack is offered on Stellar any more, and a Stellar pack payment that still
// arrives after STELLAR_PACKS_SUNSET_AT is recorded for a refund and answered 410 STELLAR_PACKS_DEPRECATED.
type PaymentMethod = "crypto" | "stripe";

interface PaymentProps {
  price: number;
  entityType: EntityType;
  id?: string;
  /** Unused since the Stellar checkout left (kept so callers still compile). */
  user?: string;
  text?: string;
  loadingText?: string;
  onSuccess?: (response: IMessage) => void;
  /** True while a card payment or a transfer is in flight (PacksModal locks its close). */
  onProcessingChange?: (processing: boolean) => void;
  productName?: string;
  onRemove?: () => void;
  /** No pointing mascot above the summary (inside a modal with its own header). */
  hideMascot?: boolean;
  /**
   * Layout only, for a modal that already names the product and shows its odds: no summary
   * ribbon, name, "?" or trash (the modal has its own Back), just the total, the discount code
   * and the payment method in the modal's own buttons. Same flow, same payment calls.
   */
  compact?: boolean;
}

const productNameOverviewMap = {
  [PackType.STARTER]: {
    description:
      "Perfect for newcomers.\nStart your collection journey with this starter pack.",
    subtitle: "DROP CHANCES",
    text: PACK_ODDS[PackType.STARTER],
    supply: 300,
    patternImg: cdnFile(`cards/backgrounds/pattern-COMMON.webp`),
  },
  [PackType.INFLUENCER]: {
    description:
      "For those who play smart.\nLimited to 50 influencer cats only.",
    subtitle: "DROP CHANCES",
    text: PACK_ODDS[PackType.INFLUENCER],
    supply: 50,
    patternImg: cdnFile(`cards/backgrounds/pattern-EPIC.webp`),
  },
  [PackType.LEGENDARY]: {
    description:
      "For ultimate impact. Exclusive cards await.\nLimited to 300 shelter cats only.",
    subtitle: "DROP CHANCES",
    text: PACK_ODDS[PackType.LEGENDARY],
    supply: 300,
    patternImg: cdnFile(`cards/backgrounds/pattern-LEGENDARY.webp`),
  },
};

/**
 * Shown instead of the checkout to a guest or a signed-out visitor (decision #9: no purchase
 * without an account). Signing in swaps it for the checkout in place.
 */
export const PurchaseAccountGate = ({
  onSignIn,
  onBack,
}: {
  onSignIn: () => void;
  onBack?: () => void;
}) => (
  <div
    data-testid="purchase-account-gate"
    className="relative z-10 mx-auto flex w-[95%] max-w-[420px] flex-col items-center gap-2 rounded-lg border-2 border-tt-gold-500 bg-tt-night-800/95 px-4 py-3 text-center"
  >
    <p className="font-primary text-p4 uppercase text-tt-gold-400">Buying needs an account</p>
    <p className="font-secondary text-p5 text-tt-cream">
      Sign in so what you buy stays yours on every device. Your guest progress comes with you.
    </p>
    <div className="flex flex-wrap items-center justify-center gap-2">
      <PixelButton text="SIGN IN TO BUY" onClick={onSignIn} />
      {onBack && <PixelButton size="sm" text="BACK" onClick={onBack} />}
    </div>
  </div>
);

// App builds show a notice instead: digital goods must use store IAP there.
export const Payment = (props: PaymentProps) =>
  isApp ? (
    <AppCheckoutNotice onBack={props.onRemove} />
  ) : (
    <WebPayment {...props} />
  );

const WebPayment = ({
  price,
  entityType,
  id,
  onSuccess,
  onProcessingChange,
  productName,
  onRemove,
  hideMascot,
  compact,
}: PaymentProps) => {
  // Crypto is the default whenever the server offers it; the player's own pick wins. The config
  // loads after mount, so "no pick yet" follows it instead of locking in card first.
  const [pickedMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  // Shelter cats are never discounted (server rule); only packs take a code.
  const discountable = entityType === EntityType.PACK;
  const cryptoSku = useMemo(() => skuFor(entityType, id), [entityType, id]);
  // The public config decides whether crypto is offered at all, and carries the price the server
  // charges (both checkouts charge it, including the Legendary sale). Where it differs from the
  // caller's copy, the summary shows the charged price.
  const cryptoConfig = useCryptoPayConfig(!cryptoSku);
  const charged = serverPriceUsd(cryptoSku, cryptoConfig);
  const basePrice = charged ?? price;
  const cryptoOffered = !!cryptoSku && cryptoPayOpen(cryptoConfig);
  const paymentMethod: PaymentMethod = pickedMethod ?? (cryptoOffered ? "crypto" : "stripe");
  const [showDiscountField, setShowDiscountField] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [isDiscountValid, setIsDiscountValid] = useState<boolean | null>(null);
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState<number | null>(
    null,
  );
  const [showOverview, setShowOverview] = useState(false);
  const toast = useToast();
  const { hasAuth, isRegistered, authStatus, runWithAccount } = useAccountAction();
  // Once the checkout showed for an account, a profile refresh (`loading-profile`) keeps it
  // mounted: swapping it out would drop a Stripe form mid-payment.
  const [checkoutShown, setCheckoutShown] = useState(false);
  if (isRegistered && !checkoutShown) setCheckoutShown(true);

  // Calculate discounted price and savings
  const { discountedPrice, savings } = useMemo(() => {
    if (discountPercentage && discountPercentage > 0) {
      const discountAmount = (basePrice * discountPercentage) / 100;
      return {
        discountedPrice: basePrice - discountAmount,
        savings: discountAmount,
      };
    }
    return { discountedPrice: basePrice, savings: 0 };
  }, [basePrice, discountPercentage]);

  const validateDiscount = async () => {
    if (!discountCode.trim()) {
      setIsDiscountValid(null);
      setDiscountPercentage(null);
      return;
    }

    setIsValidatingDiscount(true);
    try {
      const result = await ORDER_API.validateDiscount(discountCode);
      setIsDiscountValid(result.valid);
      if (result.valid && result.percentage !== undefined) {
        setDiscountPercentage(result.percentage);
        toast({
          message: result.message || "Discount code applied!",
        });
      } else {
        setDiscountPercentage(null);
        toast({ message: result.message || "Invalid discount code" });
      }
    } catch {
      setIsDiscountValid(false);
      setDiscountPercentage(null);
      toast({ message: "Failed to validate discount code" });
    } finally {
      setIsValidatingDiscount(false);
    }
  };

  // Pages without the auth runtime (`/packs`) keep the old flow. While the account is still being
  // worked out (`unknown`, `loading-profile`) nobody is told they need an account: a registered
  // player whose profile is loading sees a short wait, never "Buying needs an account".
  const authPending = authStatus === "unknown" || authStatus === "loading-profile";
  if (hasAuth && authPending && !checkoutShown) {
    return (
      <div
        data-testid="purchase-account-pending"
        role="status"
        className="relative z-10 mx-auto w-[95%] max-w-[420px] rounded-lg border-2 border-tt-gold-500/60 bg-tt-night-800/95 px-4 py-3 text-center font-secondary text-p5 text-tt-cream"
      >
        Loading your account…
      </div>
    );
  }
  if (hasAuth && !isRegistered && !(authPending && checkoutShown)) {
    return (
      <PurchaseAccountGate
        onSignIn={() => void runWithAccount("purchase", () => undefined)}
        onBack={onRemove}
      />
    );
  }

  const discounted = discountPercentage !== null && discountPercentage > 0;
  const checkoutBody =
    paymentMethod === "crypto" && cryptoSku && cryptoOffered ? (
      <CryptoCheckout
        sku={cryptoSku}
        priceUsd={discountedPrice}
        discount={discountable && discountPercentage ? discountCode : undefined}
        onSuccess={onSuccess}
        onProcessingChange={onProcessingChange}
      />
    ) : (
      <StripePayment
        price={discountedPrice}
        id={id || ""}
        onSuccess={onSuccess || (() => {})}
        onProcessingChange={onProcessingChange}
        discount={discountCode}
        entityType={entityType}
      />
    );

  if (compact) {
    return (
      <div className="relative z-10 flex flex-col gap-3">
        {/* The total, once, with the discount code under it (packs only). */}
        <div className="tt-card flex flex-col gap-2 p-3" data-testid="payment-total">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="font-sans text-p6 font-extrabold uppercase tracking-wider text-tt-muted">Total</span>
            <span className="flex items-baseline gap-2">
              {discounted && (
                <s className="font-sans text-p5 font-bold text-tt-muted" aria-hidden="true">
                  ${basePrice.toFixed(2)}
                </s>
              )}
              <span className="font-primary text-h5 leading-none text-tt-gold-400 [text-shadow:0_3px_0_rgb(var(--tt-gold-shadow))] short:!text-h6">
                {discounted && <span className="sr-only">{`was $${basePrice.toFixed(2)}, now `}</span>}
                {`$${discountedPrice.toFixed(2)}`}
              </span>
            </span>
          </div>
          {discounted && (
            <p role="status" className="font-sans text-p6 font-bold text-tt-mint">
              {`Code ${discountCode.toUpperCase()}: ${discountPercentage}% off, you save $${savings.toFixed(2)}.`}
            </p>
          )}
          {discountable &&
            !discounted &&
            (!showDiscountField ? (
              <ModalButton
                variant="ghost"
                size="sm"
                icon="key"
                onClick={() => setShowDiscountField(true)}
                className="self-start !px-0"
              >
                I have a discount code
              </ModalButton>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-stretch gap-2">
                  <input
                    type="text"
                    value={discountCode}
                    onChange={(e) => {
                      setDiscountCode(e.target.value?.slice(0, 24));
                      setIsDiscountValid(null);
                      setDiscountPercentage(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        validateDiscount();
                      }
                    }}
                    aria-label="Discount code"
                    aria-invalid={isDiscountValid === false ? true : undefined}
                    className="min-h-[44px] min-w-0 flex-1 border-2 border-tt-gold-500 bg-tt-night-950/70 px-3 font-sans text-p5 font-bold uppercase text-tt-cream outline-none placeholder:normal-case placeholder:text-tt-muted focus:shadow-[0_0_0_3px_rgb(var(--tt-gold-400)/0.5)]"
                    placeholder="Discount code"
                  />
                  <ModalButton
                    variant="secondary"
                    size="sm"
                    onClick={validateDiscount}
                    disabled={!discountCode.trim()}
                    busy={isValidatingDiscount}
                  >
                    Apply
                  </ModalButton>
                </div>
                {isDiscountValid === false && (
                  <p role="alert" className="font-sans text-p6 font-bold text-tt-rust">
                    That code does not work. Check it and try again.
                  </p>
                )}
              </div>
            ))}
        </div>

        {/* How to pay: a switch (card only when crypto is not offered), then that method's form. */}
        <div className={cryptoOffered ? "grid grid-cols-2 gap-2" : "flex"} role="group" aria-label="Payment method">
          {(
            [
              // copy-lint-ignore R10 WebPayment renders only on web; app builds get AppCheckoutNotice above
              ["crypto", "Pay with crypto (stablecoins)", "coins"],
              ["stripe", "Pay with Card", "wallet"],
            ] as const
          )
            .filter(([method]) => method === "stripe" || cryptoOffered)
            .map(([method, label, icon]) => (
              <ModalButton
                key={method}
                variant="secondary"
                size="sm"
                icon={icon}
                aria-pressed={paymentMethod === method}
                onClick={() => setPaymentMethod(method)}
                className={
                  paymentMethod === method
                    ? "!bg-tt-night-500 shadow-[inset_0_0_0_2px_rgb(var(--tt-gold-400))]"
                    : "opacity-80 hover:opacity-100"
                }
              >
                {label}
              </ModalButton>
            ))}
        </div>
        {checkoutBody}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 relative z-10 motion-safe:animate-appear">
      {/* Checkout Summary */}
      <div className="bg-gradient-to-b from-tt-night-700/95 to-tt-night-800/95 border-4 border-tt-gold-500 shadow-[0_6px_0_rgb(var(--tt-night-950))] w-[95%] md:rem:w-[400px] max-w-none m-auto rounded-2xl p-4 relative z-10">
        {!hideMascot && (
          <img
            src={cdnFile(`tail/mascot-point-right.webp`)}
            alt=""
            aria-hidden="true"
            className="absolute -top-[8.25rem] -left-2 w-36 z-0 -mb-2 animate-opacity"
          />
        )}
        <img
          src={productNameOverviewMap[id as PackType]?.patternImg}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full -mb-2 object-cover opacity-25 mix-blend-color-dodge z-10"
        />
        {/* Header */}
        <div className="bg-tt-night-950 rounded-lg px-2 -mt-8 mb-2 text-center w-fit m-auto border-4 border-tt-gold-500 relative">
          <span className="text-p5 font-bold text-tt-gold-400 font-primary uppercase">
            CHECKOUT SUMMARY
          </span>
        </div>

        {/* Product Info */}
        {productName && (
          <div className="flex items-center justify-between mb-2 text-pink-100 relative z-10">
            {id &&
            entityType === EntityType.PACK &&
            id in productNameOverviewMap ? (
              <button
                onClick={() => setShowOverview(!showOverview)}
                type="button"
                className="text-tt-cream hover:text-tt-sky cursor-pointer -mt-1 border-4 rounded-full p-1 border-tt-muted/60 hover:border-tt-sky transition-all duration-300"
                aria-label="Show product info"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="6 4 12 16"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 17.25h.008v.008H12v-.008z"
                  />
                </svg>
              </button>
            ) : (
              <div className="w-[33px]"></div>
            )}
            <span className="text-p3 font-bold font-primary text-center m-auto">
              {productName}
            </span>
            {onRemove ? (
              <button
                onClick={onRemove}
                type="button"
                className="text-tt-cream hover:text-tt-rust cursor-pointer -mt-1 border-4 rounded-full p-1 border-tt-muted/60 hover:border-tt-rust transition-all duration-300"
                aria-label="Remove item"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            ) : (
              <div className="w-[33px]"></div>
            )}
          </div>
        )}

        {/* Product Overview */}
        {showOverview &&
          id &&
          entityType === EntityType.PACK &&
          id in productNameOverviewMap && (
            <div className="mb-4 text-pink-100 relative z-10">
              {(() => {
                const packData = productNameOverviewMap[id as PackType];

                return (
                  <>
                    {/* Description */}
                    <p className="text-p5 text-pink-100 font-secondary whitespace-pre-line text-center -mt-2 mb-4">
                      {packData.description}
                    </p>

                    <Tag size="sm">{packData.subtitle}</Tag>

                    {/* Drop Chances */}
                    <p className="text-p5 font-secondary text-center mt-2">
                      {packData.text}
                    </p>
                  </>
                );
              })()}
            </div>
          )}

        {/* Original Price - Only show when discount IS applied */}
        {discountPercentage !== null && discountPercentage > 0 && (
          <div className="flex items-center justify-between mb-2 relative z-10">
            <span className="text-p5 text-tt-cream font-secondary">
              Original Price:
            </span>
            <span className="text-p5 text-tt-muted line-through font-secondary font-bold">
              ${basePrice.toFixed(2)}
            </span>
          </div>
        )}

        {/* Discount Code Input - Inside Checkout Summary - Hide when discount is applied */}
        {discountable && !(discountPercentage !== null && discountPercentage > 0) && (
          <div className="mb-3 relative z-10">
            {!showDiscountField ? (
              <div className="flex justify-center -mt-2 -mb-5">
                <PixelButton
                  text="I have a discount code"
                  onClick={() => setShowDiscountField(true)}
                  size="sm"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Tag size="sm">DISCOUNT CODE</Tag>
                <div className="flex items-center w-full">
                  <input
                    type="text"
                    value={discountCode}
                    onChange={(e) => {
                      setDiscountCode(e.target.value?.slice(0, 24));
                      setIsDiscountValid(null);
                      setDiscountPercentage(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        validateDiscount();
                      }
                    }}
                    aria-label="Discount code"
                    className="flex-1 min-h-[44px] px-3 py-2 outline-none text-p5 -mr-2 font-bold bg-tt-night-900 text-tt-cream placeholder:text-tt-muted rounded-full border-2 border-tt-gold-500 focus-visible:ring-4 focus-visible:ring-tt-gold-400"
                    placeholder="ENTER DISCOUNT CODE"
                  />
                  <PixelButton
                    text="APPLY"
                    onClick={validateDiscount}
                    size="sm"
                    disabled={!discountCode.trim() || isValidatingDiscount}
                  />
                </div>
                {isValidatingDiscount && (
                  <div role="status" className="text-p6 text-tt-cream bg-tt-night-900 px-3 py-1 rounded-full border-2 border-tt-gold-500 text-center">
                    Validating...
                  </div>
                )}
                {isDiscountValid === false && (
                  <div role="alert" className="text-p6 text-tt-cream font-bold bg-tt-night-900 px-3 py-1 rounded-full border-2 border-tt-rust text-center">
                    ✗ Invalid discount code
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Discount Bar */}
        {discountPercentage !== null && discountPercentage > 0 && (
          <div className="bg-tt-night-950/80 border-4 border-tt-mint rounded-lg px-4 py-2 mb-3 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-p5 font-bold text-tt-mint font-primary">
                Discount:
              </span>
              <div className="flex items-center gap-2">
                <span className="text-p5 font-bold text-tt-cream font-primary">
                  -${savings.toFixed(2)} ({discountPercentage}% OFF{" "}
                  {discountCode})
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Final Price */}
        <div className="relative w-fit m-auto">
          <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full blur-md opacity-50"></div>
          <div className="relative rounded-lg px-6 py-3 text-center">
            <span className="text-h3 font-bold text-white font-primary glow">
              ${discountedPrice.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Payment Method Selector */}
      <div className="flex flex-wrap gap-4 justify-center" role="group" aria-label="Payment method">
        {cryptoOffered && (
          <div>
            <PixelButton
              // copy-lint-ignore R10 WebPayment renders only on web; app builds get AppCheckoutNotice above
              text="Pay with crypto (stablecoins)"
              onClick={() => setPaymentMethod("crypto")}
              active={paymentMethod === "crypto"}
              pressed={paymentMethod === "crypto"}
            />
          </div>
        )}
        <div>
          <PixelButton
            text="Pay with Card"
            onClick={() => setPaymentMethod("stripe")}
            active={paymentMethod === "stripe"}
            pressed={paymentMethod === "stripe"}
          />
        </div>
      </div>

      {/* Payment Content */}
      {checkoutBody}
    </div>
  );
};
