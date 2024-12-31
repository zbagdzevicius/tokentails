import { useCat } from "@/context/CatContext";
import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GameEvents, IPhaserGame } from "../Phaser/events";
import { GAME_HEIGHT, GAME_WIDTH, StartGame } from "./config";
import { catsForSaleFetch } from "@/constants/api";
import { useProfile } from "@/context/ProfileContext";
import { CatType } from "@/models/cats";
import { useQuery } from "@tanstack/react-query";
import { ICat } from "@/models/cats";
import { CatCardModal } from "../CatCardModal";
import { Web3Providers } from "../web3/Web3Providers";
interface IProps {
  currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

const ShelterGame = forwardRef<IPhaserGame, IProps>(function PhaserGame(
  { currentActiveScene },
  ref
) {
  const game = useRef<Phaser.Game | null>(null!);

  useLayoutEffect(() => {
    if (game.current === null) {
      game.current = StartGame("game-container", GAME_WIDTH, GAME_HEIGHT);

      if (typeof ref === "function") {
        ref({ game: game.current, scene: null });
      } else if (ref) {
        ref.current = { game: game.current, scene: null };
      }
    }

    return () => {
      if (game.current) {
        game.current.destroy(true);
        if (game.current !== null) {
          game.current = null;
        }
      }
    };
  }, [ref]);

  GameEvents.GAME_LOADED.use((event) => {
    if (!event) {
      return;
    }
    const scene = event.scene;
    if (currentActiveScene && typeof currentActiveScene === "function") {
      currentActiveScene(scene);
    }

    if (typeof ref === "function") {
      ref({ game: game.current, scene });
    } else if (ref) {
      ref.current = {
        game: game.current,
        scene: event.scene,
      };
    }
  });

  return <div id="game-container" className="animate-opacity"></div>;
});

function Shelter() {
  const { profile } = useProfile();
  const [selectedNpc, setSelectedNpc] = useState<ICat | null>(null);
  const [showModal, setShowModal] = useState(false);

  const { data: regularCats } = useQuery({
    queryKey: ["regular-cats", profile?._id],
    queryFn: () => catsForSaleFetch(CatType.REGULAR),
  });
  const { data: blessedCats } = useQuery({
    queryKey: ["blessed-cats", profile?._id],
    queryFn: () => catsForSaleFetch(CatType.BLESSED),
  });
  const { data: exclusiveCats } = useQuery({
    queryKey: ["exclusive-cats", profile?._id],
    queryFn: () => catsForSaleFetch(CatType.EXCLUSIVE),
  });

  const { cat } = useCat();

  const phaserRef = useRef<IPhaserGame | null>(null);
  const isGameLoaded = GameEvents.GAME_LOADED.use();
  const [hasSpawnedNpc, setHasSpawnedNpc] = useState(false);

  useEffect(() => {
    if (cat && isGameLoaded?.scene) {
      GameEvents.CAT_SPAWN.push({ cat });
    }
  }, [cat, isGameLoaded]);

  const getRandomCats = (catsArray: ICat[], count: number) => {
    const shuffled = [...catsArray].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  };

  useEffect(() => {
    if (!hasSpawnedNpc && isGameLoaded?.scene && regularCats && blessedCats && exclusiveCats) {
      const randomRegularNpcs = getRandomCats(regularCats, 7);
      const randomBlessedNpcs = getRandomCats(blessedCats, 7);
      const randomExclusiveNpcs = getRandomCats(exclusiveCats, 7);

      randomRegularNpcs.forEach((npcCatRegular) => {
        GameEvents.NPC_SPAWN_REGULAR.push({ npc: npcCatRegular });
      });
      randomBlessedNpcs.forEach((npcCatBlessed) => {
        GameEvents.NPC_SPAWN_BLESSED.push({ npc: npcCatBlessed });
      });
      randomExclusiveNpcs.forEach((npcCatExclusive) => {
        GameEvents.NPC_SPAWN_EXCLUSIVE.push({ npc: npcCatExclusive });
      });
      setHasSpawnedNpc(true);
    }
  }, [regularCats, blessedCats, exclusiveCats, isGameLoaded, hasSpawnedNpc]);

  GameEvents.CAT_CARD_DISPLAY.use((event) => {
    if (event) {
      setSelectedNpc(event.npc);
      setShowModal(true);
    }
  });

  return (
    <div id="app" className="z-20">
      <ShelterGame ref={phaserRef} />
      {showModal && selectedNpc && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center bg-black bg-opacity-30">
          <div
            className="absolute inset-0 z-0"
            onClick={() => setShowModal(false)}
          ></div>
          <div className="absolute top-1/2">

            <Web3Providers>
              <CatCardModal
                {...selectedNpc}
                onClose={() => setShowModal(false)}
              />
            </Web3Providers>
          </div>
        </div>
      )}
    </div>
  );
}

export default Shelter;
