import { IMessage } from "@/models/cats";
import { EntityType } from "@/models/save";
import { apiUrl } from "./api";

const jsonAuthHeaders = (): HeadersInit => ({
  Accept: "application/json",
  "Content-Type": "application/json",
  accesstoken: sessionStorage.getItem("accesstoken") || "",
});

export const STRIPE_API = {
  createPaymentIntent: async (
    amount: number,
    id: string,
    discount?: string,
    options?: {
      entityType?: EntityType;
      productType?: "digital" | "print" | "canvas";
      imageId?: string;
    },
  ) => {
    const response = await fetch(`${apiUrl}/web3/create-payment`, {
      method: "POST",
      headers: jsonAuthHeaders(),
      body: JSON.stringify({
        amount,
        id,
        discount,
        entityType: options?.entityType,
        productType: options?.productType,
        imageId: options?.imageId,
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
    entityType,
    productType,
    imageId,
  }: {
    paymentIntent: string;
    clientSecret: string;
    discount?: string;
    entityType?: EntityType;
    productType?: "digital" | "print" | "canvas";
    imageId?: string;
  }): Promise<IMessage> => {
    const response = await fetch(`${apiUrl}/web3/confirm-payment`, {
      method: "POST",
      headers: jsonAuthHeaders(),
      body: JSON.stringify({
        paymentIntent,
        clientSecret,
        discount,
        entityType,
        productType,
        imageId,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to confirm payment");
    }

    return response.json();
  },

  createCheckoutSession: async ({
    amount,
    productType,
    imageId,
    email,
  }: {
    amount: number; // in cents
    productType: "digital" | "print" | "canvas";
    imageId?: string;
    email?: string;
  }): Promise<{ url: string }> => {
    const response = await fetch(`${apiUrl}/image/create-checkout-session`, {
      method: "POST",
      headers: jsonAuthHeaders(),
      body: JSON.stringify({
        amount,
        productType,
        imageId,
        email,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to create checkout session");
    }

    return response.json();
  },

  createSignedCheckoutSession: async ({
    amount,
    productType,
    imageId,
  }: {
    amount: number; // in cents
    productType: "digital" | "print" | "canvas";
    imageId?: string;
  }): Promise<{ url: string }> => {
    const response = await fetch(
      `${apiUrl}/image/create-checkout-session-signed`,
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          amount,
          productType,
          imageId,
        }),
      },
    );

    if (!response.ok) {
      throw new Error("Failed to create signed checkout session");
    }

    return response.json();
  },
};
