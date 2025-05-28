import { Game } from "@/components/game/Game";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { GameProvider } from "@/context/GameContext";

import { Onboarding } from "@/components/onboarding/Onboarding";
import Head from "next/head";

export default function game() {
  return (
    <FirebaseAuthProvider>
      <Head>
        <title>Token Tails - Play to Save</title>
        <meta property="og:image" content="/logo/ogg.jpg" />
        <meta property="og:title" content="Token Tails - Game" key="title" />
        <meta
          name="description"
          content="PLAY WITH YOUR VIRTUAL CAT TO SAVE A CAT IN A SHELTER"
        />
        <link rel="shortcut icon" href="/logo/coin.webp" />
      </Head>
      <GameProvider>
        <Onboarding />
        <Game />
      </GameProvider>
    </FirebaseAuthProvider>
  );
}
