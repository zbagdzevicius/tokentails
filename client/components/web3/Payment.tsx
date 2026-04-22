import { ORDER_API } from "@/api/order-api";
import { useToast } from "@/context/ToastContext";
import { PackType } from "@/models/order";
import { EntityType } from "@/models/save";
import { useMemo, useState } from "react";
import { ChainSelect } from "../shared/ChainSelect";
import { PixelButton } from "../shared/PixelButton";
import { Tag } from "../shared/Tag";
import { StripePayment } from "./StripePayment";
import { Web3Transfer } from "./transfer/Web3Transfer";
import { cdnFile } from "@/constants/utils";
import { IMessage } from "@/models/cats";
import { Web3Providers } from "./Web3Providers";

type PaymentMethod = "crypto" | "stripe";

interface PaymentProps {
  price: number;
  entityType: EntityType;
  id?: string;
  user?: string;
  text?: string;
  loadingText?: string;
  onSuccess?: (response: IMessage) => void;
  productName?: string;
  onRemove?: () => void;
}

const productNameOverviewMap = {
  [PackType.STARTER]: {
    description:
      "Perfect for newcomers.\nStart your collection journey with this starter pack.",
    subtitle: "DROP CHANCES",
    text: "90% Common, 9% Rare, 1% Epic",
    supply: 300,
    patternImg: cdnFile(`cards/backgrounds/pattern-COMMON.webp`),
  },
  [PackType.INFLUENCER]: {
    description:
      "For those who play smart.\nLimited to 50 influencer cats only.",
    subtitle: "DROP CHANCES",
    text: "75% Common, 21% Rare, 3.5% Epic, 0.5% Legendary",
    supply: 50,
    patternImg: cdnFile(`cards/backgrounds/pattern-EPIC.webp`),
  },
  [PackType.LEGENDARY]: {
    description:
      "For ultimate impact. Exclusive cards await.\nLimited to 300 shelter cats only.",
    subtitle: "DROP CHANCES",
    text: "20% rare, 50% epic, 30% legendary",
    supply: 300,
    patternImg: cdnFile(`cards/backgrounds/pattern-LEGENDARY.webp`),
  },
};

export const Payment = ({
  price,
  entityType,
  id,
  user,
  text,
  loadingText,
  onSuccess,
  productName,
  onRemove,
}: PaymentProps) => {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("stripe");
  const [showDiscountField, setShowDiscountField] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [isDiscountValid, setIsDiscountValid] = useState<boolean | null>(null);
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState<number | null>(
    null
  );
  const [showOverview, setShowOverview] = useState(false);
  const toast = useToast();

  // Calculate discounted price and savings
  const { discountedPrice, savings } = useMemo(() => {
    if (discountPercentage && discountPercentage > 0) {
      const discountAmount = (price * discountPercentage) / 100;
      return {
        discountedPrice: price - discountAmount,
        savings: discountAmount,
      };
    }
    return { discountedPrice: price, savings: 0 };
  }, [price, discountPercentage]);

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

  return (
    <div className="flex flex-col gap-4 relative z-10 animate-appear">
      {/* Checkout Summary */}
      <div className="bg-gradient-to-b from-yellow-900/95 to-yellow-700/95 glow-box w-[95%] md:rem:w-[400px] max-w-none m-auto rounded-2xl p-4 relative z-10">
        <img
          src={cdnFile(`tail/mascot-point-right.webp`)}
          className="absolute -top-[8.25rem] -left-2 w-36 z-0 -mb-2 animate-opacity"
        />
        <img
          src={productNameOverviewMap[id as PackType]?.patternImg}
          className="absolute inset-0 w-full h-full -mb-2 object-cover opacity-25 mix-blend-color-dodge z-10"
        />
        {/* Header */}
        <div className="bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-lg px-2 -mt-8 mb-2 text-center w-fit m-auto border-4 border-yellow-200 relative">
          <span className="text-p5 font-bold text-yellow-900 font-primary uppercase">
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
                className="text-gray-300/75 hover:text-blue-400 cursor-pointer -mt-1 border-4 rounded-full p-1 border-gray-300/50 hover:border-blue-400 transition-all duration-300"
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
                className="text-gray-300/75 hover:text-red-400 cursor-pointer -mt-1 border-4 rounded-full p-1 border-gray-300/50 hover:border-red-400 transition-all duration-300"
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

                    <Tag isSmall>{packData.subtitle}</Tag>

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
            <span className="text-p5 text-gray-200 font-secondary">
              Original Price:
            </span>
            <span className="text-p5 text-gray-300 line-through font-secondary font-bold">
              ${price.toFixed(2)}
            </span>
          </div>
        )}

        {/* Discount Code Input - Inside Checkout Summary - Hide when discount is applied */}
        {!(discountPercentage !== null && discountPercentage > 0) && (
          <div className="mb-3 relative z-10">
            {!showDiscountField ? (
              <div className="flex justify-center -mt-2 -mb-5">
                <PixelButton
                  text="I have a discount code"
                  onClick={() => setShowDiscountField(true)}
                  isSmall
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Tag isSmall>DISCOUNT CODE</Tag>
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
                    className="flex-1 px-3 py-2 outline-none text-p5 -mr-2 font-bold bg-white rounded-full border-4 border-yellow-900"
                    placeholder="ENTER DISCOUNT CODE"
                  />
                  <PixelButton
                    text="APPLY"
                    onClick={validateDiscount}
                    isSmall
                    isDisabled={!discountCode.trim() || isValidatingDiscount}
                  />
                </div>
                {isValidatingDiscount && (
                  <div className="text-p6 text-yellow-900 bg-yellow-200 px-3 py-1 rounded-full border-2 border-yellow-900 text-center">
                    Validating...
                  </div>
                )}
                {isDiscountValid === false && (
                  <div className="text-p6 text-red-700 font-bold bg-red-200 px-3 py-1 rounded-full border-2 border-red-600 text-center">
                    ✗ Invalid discount code
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Discount Bar */}
        {discountPercentage !== null && discountPercentage > 0 && (
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 border-4 border-green-400 rounded-lg px-4 py-2 mb-3 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-p5 font-bold text-white font-primary">
                Discount:
              </span>
              <div className="flex items-center gap-2">
                <span className="text-p5 font-bold text-white font-primary">
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
      <div className="flex gap-4 justify-center">
        <div>
          <PixelButton
            text="Pay with Card"
            onClick={() => setPaymentMethod("stripe")}
            active={paymentMethod === "stripe"}
          />
        </div>
        <div>
          <PixelButton
            text="Pay with Crypto"
            onClick={() => setPaymentMethod("crypto")}
            active={paymentMethod === "crypto"}
          />
        </div>
      </div>

      {/* Payment Content */}
      {paymentMethod === "crypto" ? (
        <Web3Providers>
          <div className="flex flex-col items-center">
            <ChainSelect />
            <Web3Transfer
              price={discountedPrice}
              entityType={entityType}
              id={id}
              user={user}
              text={text}
              loadingText={loadingText}
              discount={discountCode}
              onSuccess={onSuccess}
            />
          </div>
        </Web3Providers>
      ) : (
        <StripePayment
          price={discountedPrice}
          id={id || ""}
          onSuccess={onSuccess || (() => {})}
          discount={discountCode}
        />
      )}
    </div>
  );
};
