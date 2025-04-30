import { STRIPE_API } from "@/api/stripe-api";
import { useToast } from "@/context/ToastContext";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useState } from "react";
import { PixelButton } from "../../shared/PixelButton";
import { Tag } from "@/components/shared/Tag";
import { IGeneratedCat } from "../transfer/Web3Transfer";
import { BuyMode } from "@/constants/cat-utils";

// Make sure to replace with your publishable key
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

interface StripeCheckoutFormProps {
  onSuccess: () => void;
  price: number;
  text?: string;
}

const StripeCheckoutForm = ({
  onSuccess,
  price,
  text,
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
    } catch (err) {
      toast({ message: "Payment failed" });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <PaymentElement />
      <div className="mt-4 flex justify-center">
        <PixelButton
          text={
            isProcessing
              ? "Processing..."
              : text
              ? `${text} for $${price}`
              : `Save with $${price}`
          }
          isDisabled={isProcessing}
        />
      </div>
    </form>
  );
};

interface StripePaymentProps {
  price: number;
  catId?: string;
  generatedCat?: IGeneratedCat;
  text?: string;
  buyMode?: BuyMode;
  onSuccess: () => void;
}

export const StripePayment = ({
  price,
  catId,
  generatedCat,
  buyMode,
  text,
  onSuccess,
}: StripePaymentProps) => {
  const [clientSecret, setClientSecret] = useState<string>();

  useEffect(() => {
    const initializePayment = async () => {
      try {
        const { clientSecret } = await STRIPE_API.createPaymentIntent(
          price,
          catId,
          generatedCat,
          buyMode
        );
        setClientSecret(clientSecret);
      } catch (error) {
        console.error("Failed to initialize payment:", error);
      }
    };

    initializePayment();
  }, [price, catId]);

  if (!clientSecret) {
    return (
      <div className="flex w-full justify-center animate-appear">
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
      <StripeCheckoutForm onSuccess={onSuccess} price={price} text={text} />
    </Elements>
  );
};
