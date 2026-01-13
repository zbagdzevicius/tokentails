import { EntityType } from "@/models/save";
import { useState, useMemo } from "react";
import { ChainSelect } from "../shared/ChainSelect";
import { PixelButton } from "../shared/PixelButton";
import { Tag } from "../shared/Tag";
import { StripePayment } from "./StripePayment";
import { Web3Transfer } from "./transfer/Web3Transfer";
import { ORDER_API } from "@/api/order-api";
import { useToast } from "@/context/ToastContext";

type PaymentMethod = "crypto" | "stripe";

interface PaymentProps {
  price: number;
  entityType: EntityType;
  id?: string;
  user?: string;
  text?: string;
  loadingText?: string;
  onSuccess?: () => void;
  productName?: string;
  onRemove?: () => void;
}

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
      <div className="bg-gradient-to-b from-yellow-900/95 to-yellow-700/95 glow-box w-[95%] md:rem:w-[336px] max-w-none m-auto rounded-2xl p-4 relative z-10">
        {/* Header */}
        <div className="bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-lg px-2 -mt-8 mb-2 text-center w-fit m-auto border-4 border-yellow-200">
          <span className="text-p5 font-bold text-yellow-900 font-primary uppercase">
            CHECKOUT SUMMARY
          </span>
        </div>

        {/* Product Info */}
        {productName && (
          <div className="flex items-center justify-between mb-2">
            <span className="text-p3 font-bold text-gray-100 font-primary">
              {productName}
            </span>
            {onRemove && (
              <button
                onClick={onRemove}
                className="text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
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
            )}
          </div>
        )}

        {/* Original Price - Only show when discount IS applied */}
        {discountPercentage !== null && discountPercentage > 0 && (
          <div className="flex items-center justify-between mb-2">
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
          <div className="mb-3">
            {!showDiscountField ? (
              <div className="flex justify-center -mt-2 -mb-2">
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
                <button
                  onClick={() => {
                    setDiscountCode("");
                    setDiscountPercentage(null);
                    setIsDiscountValid(null);
                    setShowDiscountField(false);
                  }}
                  className="text-white hover:text-gray-200 transition-colors cursor-pointer"
                  aria-label="Remove discount"
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
        <div className="flex flex-col items-center">
          <ChainSelect />
          <Web3Transfer
            price={discountedPrice}
            entityType={entityType}
            id={id}
            user={user}
            text={text}
            loadingText={loadingText}
            discount={discountCode || undefined}
          />
        </div>
      ) : (
        <StripePayment
          price={discountedPrice}
          id={id || ""}
          onSuccess={onSuccess || (() => {})}
          discount={discountCode || undefined}
        />
      )}
    </div>
  );
};
