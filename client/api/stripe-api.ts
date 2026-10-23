import { IMessage } from "@/models/cats";
import { EntityType } from "@/models/save";
import { apiUrl } from "./api";

const jsonAuthHeaders = (): HeadersInit => ({
  Accept: "application/json",
  "Content-Type": "application/json",
  accesstoken: sessionStorage.getItem("accesstoken") || "",
});

/**
 * Where a purchase starts, when that changes the server's checks. `pawlegends`: the Token Tails cat checkout opened
 * from the Pawlegends game, so the backend applies the Pawlegends age band and 30-day spend cap first
 * (`PawlegendsCheckoutGuard`). `consentVersion` is the `/pawlegends/terms` version the buyer ticked the consent box
 * for (terms, privacy and the EU withdrawal waiver); the server refuses any other and records it with the payment.
 * Other callers send nothing and are unchanged.
 */
export interface PurchaseContext {
  context: "pawlegends";
  ageBand: "under16" | "16-17" | "18+";
  deviceId: string;
  consentVersion: string;
}

/** The context fields a request body carries, copied by name. */
export const purchaseContextFields = (context?: PurchaseContext | null) =>
  context
    ? { context: context.context, ageBand: context.ageBand, deviceId: context.deviceId, consentVersion: context.consentVersion }
    : {};

export const STRIPE_API = {
  createPaymentIntent: async (
    amount: number,
    id: string,
    discount?: string,
    options?: {
      entityType?: EntityType;
      productType?: "digital" | "print" | "canvas";
      imageId?: string;
      purchaseContext?: PurchaseContext | null;
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
        ...purchaseContextFields(options?.purchaseContext),
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
