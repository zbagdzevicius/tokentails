import { Game } from "@/components/game/Game";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { GameProvider } from "@/context/GameContext";

import { Onboarding } from "@/components/onboarding/Onboarding";

export default function game() {
  return (
    <FirebaseAuthProvider>
      <GameProvider>
        <Onboarding />
        <Game />
      </GameProvider>
    </FirebaseAuthProvider>
  );
}
