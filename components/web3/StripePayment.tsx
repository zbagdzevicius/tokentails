import { STRIPE_API } from "@/api/stripe-api";
import { useToast } from "@/context/ToastContext";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useState, useRef } from "react";
import { Tag } from "@/components/shared/Tag";
import { PixelButton } from "@/components/shared/PixelButton";
import { IMessage } from "@/models/cats";
import { EntityType } from "@/models/save";

// Make sure to replace with your publishable key
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

interface StripeCheckoutFormProps {
  onSuccess: (response: IMessage) => void;
  discount?: string;
  entityType?: EntityType;
  productType?: "digital" | "print" | "canvas";
  imageId?: string;
}

const StripeCheckoutForm = ({
  onSuccess,
  discount,
  entityType,
  productType,
  imageId,
}: StripeCheckoutFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const toast = useToast();

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
          isBig
          isDisabled={isProcessing}
        />
      </div>
    </form>
  );
};

interface StripePaymentProps {
  price: number;
  id: string;
  onSuccess: (response: IMessage) => void;
  discount?: string;
  entityType?: EntityType;
  productType?: "digital" | "print" | "canvas";
  imageId?: string;
}

export const StripePayment = ({
  price,
  id,
  onSuccess,
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
        console.error("Failed to initialize payment:", error);
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

  if (initializationError) {
    return (
      <div className="mx-auto w-full max-w-[420px] rounded-lg border-2 border-red-700 bg-red-100 px-3 py-2 text-center font-primary text-p6 md:text-p5 text-red-900">
        {initializationError}
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
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "black",
          },
        },
      }}
    >
      <StripeCheckoutForm
        onSuccess={onSuccess}
        discount={discount}
        entityType={entityType}
        productType={productType}
        imageId={imageId}
      />
    </Elements>
  );
};
