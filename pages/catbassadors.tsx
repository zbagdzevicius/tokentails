"use client";
import { CatbassadorsAuth } from "@/components/catbassadors/CatbassadorsAuth";
import { TelegramAuthProvider } from "@/context/TelegramAuthContext";
import { SDKProvider } from "@telegram-apps/sdk-react";

export default function Game() {
  return (
    <SDKProvider acceptCustomStyles debug={true}>
      <TelegramAuthProvider>
        <CatbassadorsAuth />
      </TelegramAuthProvider>
    </SDKProvider>
  );
}
