import { Game } from "@/components/game/Game";
import { cdnFile } from "@/constants/utils";
import { FirebaseAuthProvider } from "@/context/FirebaseAuthContext";
import { GameProvider } from "@/context/GameContext";

import Head from "next/head";

export default function game() {
  return (
    <FirebaseAuthProvider>
      <Head>
        <title>Token Tails - Play to Save</title>
        <meta property="og:image" content={cdnFile("logo/ogg.jpg")} />
        <meta property="og:title" content="Token Tails - Game" key="title" />
        <meta
          name="description"
          content="PLAY WITH YOUR VIRTUAL CAT TO SAVE A CAT IN A SHELTER"
        />
        <link rel="shortcut icon" href={cdnFile("logo/coin.webp")} />
      </Head>
      <GameProvider>
        <Game />
      </GameProvider>
    </FirebaseAuthProvider>
  );
}
