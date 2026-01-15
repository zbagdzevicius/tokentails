import { ICat, IMessage } from "@/models/cats";
import { apiUrl, getAuthHeaders } from "./api";

export const STRIPE_API = {
  createPaymentIntent: async (
    amount: number,
    id: string,
    discount?: string
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
        id,
        discount,
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
    discount,
  }: {
    paymentIntent: string;
    clientSecret: string;
    discount?: string;
  }): Promise<IMessage> => {
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
        discount,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to confirm payment");
    }

    return response.json();
  },
};
