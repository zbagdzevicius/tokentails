import { Game } from "@/components/game/Game";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { GameProvider } from "@/context/GameContext";

import React from "react";

export default function game() {
  return (
    <FirebaseAuthProvider>
      <GameProvider>
        <Game />
      </GameProvider>
    </FirebaseAuthProvider>
  );
}
