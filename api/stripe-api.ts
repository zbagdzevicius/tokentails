import { IGeneratedCat } from "@/components/web3/transfer/Web3Transfer";
import { apiUrl, getAuthHeaders } from "./api";
import { BuyMode } from "@/constants/cat-utils";

export const STRIPE_API = {
  createPaymentIntent: async (
    amount: number,
    catId?: string,
    generatedCat?: IGeneratedCat,
    buyMode?: BuyMode
  ) => {
    const response = await fetch(`${apiUrl}/web3/create-payment`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      } as any,
      body: JSON.stringify({
        amount,
        catId,
        generatedCat,
        buyMode,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to create payment intent");
    }

    return response.json();
  },

  confirmPayment: async ({
    paymentIntent,
    clientSecret,
  }: {
    paymentIntent: string;
    clientSecret: string;
  }) => {
    const response = await fetch(`${apiUrl}/web3/confirm-payment`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      } as any,
      body: JSON.stringify({
        paymentIntent,
        clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to confirm payment");
    }

    return response.json();
  },
};
