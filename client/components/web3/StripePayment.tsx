import { STRIPE_API } from "@/api/stripe-api";
import { useToast } from "@/context/ToastContext";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useEffect, useState, useRef } from "react";
import { Tag } from "@/components/shared/Tag";
import { PixelButton } from "@/components/shared/PixelButton";
import { IMessage } from "@/models/cats";
import { EntityType } from "@/models/save";
import { isApp } from "@/models/app";
import { AppCheckoutNotice } from "./AppCheckoutNotice";
import { NIGHT_STRIPE_APPEARANCE } from "./nightTheme";

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Stripe.js, loaded on the first card payment (not at module load) and never rejecting: a blocked
 * js.stripe.com (ad blocker, strict network) resolves to null and the form shows a notice instead
 * of an unhandled rejection on /game. A failed load is retried on the next payment. App builds
 * never load Stripe.js: web checkout is hidden there (IAP only).
 */
export function getStripe(): Promise<Stripe | null> | null {
  if (isApp) return null;
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!).catch((error: unknown) => {
      console.warn("Stripe.js failed to load", error);
      stripePromise = null;
      return null;
    });
  }
  return stripePromise;
}

const STRIPE_UNAVAILABLE = "Card payments could not load. Check your connection or ad blocker, then try again.";

interface StripeCheckoutFormProps {
  onSuccess: (response: IMessage) => void;
  /** True from the BUY NOW tap until Stripe and the backend answered (the host locks its close). */
  onProcessingChange?: (processing: boolean) => void;
  discount?: string;
  entityType?: EntityType;
  productType?: "digital" | "print" | "canvas";
  imageId?: string;
}

const StripeCheckoutForm = ({
  onSuccess,
  onProcessingChange,
  discount,
  entityType,
  productType,
  imageId,
}: StripeCheckoutFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const toast = useToast();
  const processingChange = useRef(onProcessingChange);
  useEffect(() => {
    processingChange.current = onProcessingChange;
  });
  useEffect(() => {
    processingChange.current?.(isProcessing);
  }, [isProcessing]);
  // Unmounted mid-payment (the method switched): the host must not stay locked.
  useEffect(() => () => processingChange.current?.(false), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment-success`,
        },
        redirect: "if_required",
      });

      if (error) {
        toast({ message: error.message || "Payment failed" });
      } else {
        const response = await STRIPE_API.confirmPayment({
          paymentIntent: paymentIntent.id,
          clientSecret: paymentIntent.client_secret!,
          discount,
          entityType,
          productType,
          imageId,
        });

        if (response.success) {
          toast({
            message:
              response.message ||
              (entityType === EntityType.IMAGE
                ? "Payment successful! Pet immortalized."
                : "Payment successful! Cat saved successfully."),
          });
        } else {
          toast({ message: response.message || "Failed to confirm payment" });
        }
        onSuccess(response);
      }
    } catch {
      toast({ message: "Payment failed" });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full rem:max-w-[380px] m-auto">
      <PaymentElement />
      <div className="mt-8 flex justify-center w-fit m-auto">
        <PixelButton
          text={isProcessing ? "Processing..." : `BUY NOW`}
          size="lg"
          disabled={isProcessing}
        />
      </div>
    </form>
  );
};

interface StripePaymentProps {
  price: number;
  id: string;
  onSuccess: (response: IMessage) => void;
  onProcessingChange?: (processing: boolean) => void;
  discount?: string;
  entityType?: EntityType;
  productType?: "digital" | "print" | "canvas";
  imageId?: string;
}

// App builds show a notice instead: digital goods must use store IAP there.
export const StripePayment = (props: StripePaymentProps) =>
  isApp ? <AppCheckoutNotice /> : <WebStripePayment {...props} />;

const WebStripePayment = ({
  price,
  id,
  onSuccess,
  onProcessingChange,
  discount,
  entityType,
  productType,
  imageId,
}: StripePaymentProps) => {
  const [clientSecret, setClientSecret] = useState<string>();
  const [initializationError, setInitializationError] = useState<string | null>(
    null,
  );
  const isInitializingRef = useRef(false);
  // Stripe.js starts loading with the first card form, not at module load (see getStripe).
  const [stripeLoad] = useState(getStripe);
  const [stripeUnavailable, setStripeUnavailable] = useState(false);
  useEffect(() => {
    let live = true;
    void stripeLoad?.then((stripe) => {
      if (live && !stripe) setStripeUnavailable(true);
    });
    return () => {
      live = false;
    };
  }, [stripeLoad]);

  useEffect(() => {
    // Only initialize payment when we have all required data
    // This prevents calling the API on every input change
    if (!price || !id || isInitializingRef.current) return;

    const initializePayment = async () => {
      isInitializingRef.current = true;
      setInitializationError(null);
      setClientSecret(undefined);
      try {
        const { clientSecret } = await STRIPE_API.createPaymentIntent(
          price, // Stripe expects amount in cents
          id,
          discount,
          {
            entityType,
            productType,
            imageId,
          },
        );
        setClientSecret(clientSecret);
      } catch (error) {
        // Handled: the card checkout shows its "unavailable" line. A warning, not an error, so the
        // Next dev overlay does not cover the checkout.
        console.warn("Failed to initialize payment:", error);
        setInitializationError("Card checkout is unavailable right now.");
      } finally {
        isInitializingRef.current = false;
      }
    };

    // Add a small delay to debounce rapid changes (e.g., when discount code is being typed)
    const timeoutId = setTimeout(() => {
      initializePayment();
    }, 500);

    return () => {
      clearTimeout(timeoutId);
      isInitializingRef.current = false;
    };
  }, [price, id, discount, entityType, productType, imageId]);

  if (initializationError || stripeUnavailable) {
    return (
      <div
        role="alert"
        className="w-full border-2 border-tt-rust/70 bg-tt-night-950/60 px-3 py-2 font-sans text-p6 font-semibold text-tt-cream md:text-p5"
      >
        {initializationError || STRIPE_UNAVAILABLE}
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="flex w-full justify-center">
        <Tag>Loading payment...</Tag>
      </div>
    );
  }

  return (
    <Elements
      stripe={stripeLoad}
      options={{
        clientSecret,
        // Night theme with token variables (plan G6).
        appearance: NIGHT_STRIPE_APPEARANCE,
      }}
    >
      <StripeCheckoutForm
        onSuccess={onSuccess}
        onProcessingChange={onProcessingChange}
        discount={discount}
        entityType={entityType}
        productType={productType}
        imageId={imageId}
      />
    </Elements>
  );
};
