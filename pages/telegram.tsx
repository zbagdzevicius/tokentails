import { Game } from "@/components/game/Game";
import { GameProvider } from "@/context/GameContext";
import { TelegramAuthProvider } from "@/context/TelegramAuthContext";
import { SDKProvider } from "@telegram-apps/sdk-react";

export default function game() {
  return (
    <SDKProvider acceptCustomStyles debug={true}>
      <TelegramAuthProvider>
        <GameProvider>
          <Game />
        </GameProvider>
      </TelegramAuthProvider>
    </SDKProvider>
  );
}
