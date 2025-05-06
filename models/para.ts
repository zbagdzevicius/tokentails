import Para, { Environment } from "@getpara/react-sdk";

export const para = new Para(
  Environment.PRODUCTION,
  "c3faded5228c2c2f6afe7841159f7bd0",
  { externalWalletConnectionOnly: true }
);
