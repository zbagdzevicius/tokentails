import { STRIPE_API } from "@/api/stripe-api";
import { useToast } from "@/context/ToastContext";
import { useRouter } from "next/router";
import { useEffect } from "react";

export default function PaymentSuccess() {
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    const confirmPayment = async () => {
      const { payment_intent, payment_intent_client_secret, redirect_status } =
        router.query;

      if (!payment_intent || redirect_status !== "succeeded") {
        toast({ message: "Payment failed. Please try again." });
        router.push("/");
        return;
      }

      try {
        const response = await STRIPE_API.confirmPayment({
          paymentIntent: payment_intent as string,
          clientSecret: payment_intent_client_secret as string,
        });

        if (response.success) {
          toast({ message: "Payment successful! Cat saved successfully." });
        } else {
          toast({ message: response.message || "Failed to confirm payment" });
        }
      } catch (error) {
        console.error("Payment confirmation error:", error);
        toast({
          message: "Failed to confirm payment. Please contact support.",
        });
      }
      router.push("/game");
    };

    if (router.query.payment_intent) {
      confirmPayment();
    }
  }, [router.query]);

  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Processing Payment...</h1>
        <p>Please wait while we confirm your payment.</p>
      </div>
    </div>
  );
}
