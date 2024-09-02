import { Game } from "@/components/game/Game";
import { GameProvider } from "@/context/GameContext";
import { TelegramAuthProvider } from "@/context/TelegramAuthContext";

export default function game() {
  return (
    <TelegramAuthProvider>
      <GameProvider>
        <Game />
      </GameProvider>
    </TelegramAuthProvider>
  );
}
