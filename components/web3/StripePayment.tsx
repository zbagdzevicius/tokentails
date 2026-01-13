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

// Make sure to replace with your publishable key
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

interface StripeCheckoutFormProps {
  onSuccess: () => void;
}

const StripeCheckoutForm = ({ onSuccess }: StripeCheckoutFormProps) => {
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
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment-success`,
        },
      });

      if (error) {
        toast({ message: error.message || "Payment failed" });
      } else {
        onSuccess();
      }
    } catch {
      toast({ message: "Payment failed" });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full rem:max-w-[400px] m-auto">
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
  onSuccess: () => void;
  discount?: string;
}

export const StripePayment = ({
  price,
  id,
  onSuccess,
  discount,
}: StripePaymentProps) => {
  const [clientSecret, setClientSecret] = useState<string>();
  const isInitializingRef = useRef(false);

  useEffect(() => {
    // Only initialize payment when we have all required data
    // This prevents calling the API on every input change
    if (!price || !id || isInitializingRef.current) return;

    const initializePayment = async () => {
      isInitializingRef.current = true;
      try {
        const { clientSecret } = await STRIPE_API.createPaymentIntent(
          price, // Stripe expects amount in cents
          id,
          discount
        );
        setClientSecret(clientSecret);
      } catch (error) {
        console.error("Failed to initialize payment:", error);
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
  }, [price, id, discount]);

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
      <StripeCheckoutForm onSuccess={onSuccess} />
    </Elements>
  );
};
