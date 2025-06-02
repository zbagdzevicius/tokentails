import { CAT_API } from "@/api/cat-api";
import { useCat } from "@/context/CatContext";
import { useProfile } from "@/context/ProfileContext";
import { ICat } from "@/models/cats";
import { useQuery } from "@tanstack/react-query";
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { CatCardModal } from "../catCard/CatCardModal";
import { GameEvents, IPhaserGame, NPC_TYPE } from "../Phaser/events";
import { Web3Providers } from "../web3/Web3Providers";
import { StartGame } from "./config";
import { getRandomObjectsFromArray } from "@/constants/utils";
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
      game.current = StartGame();

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

  const { data: catsForSale } = useQuery({
    queryKey: ["cats-for-sale", profile?._id],
    queryFn: () => CAT_API.catsForSale(),
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

  useEffect(() => {
    if (!hasSpawnedNpc && isGameLoaded?.scene && catsForSale) {
      const tokentailsNpcs = catsForSale["token-tails"];
      const tokentailsCharsNpcs = catsForSale["token-tails-2"];
      const rozinePeduteNpcs = getRandomObjectsFromArray(
        catsForSale["rozine-pedute"],
        10
      );

      tokentailsNpcs?.forEach((npcCatRegular) => {
        GameEvents.NPC_SPAWN.push({
          npc: npcCatRegular,
          type: NPC_TYPE.TOKENTAILS,
        });
      });
      rozinePeduteNpcs?.forEach((npcCatBlessed) => {
        GameEvents.NPC_SPAWN.push({
          npc: npcCatBlessed,
          type: NPC_TYPE.ROZINE_PEDUTE,
        });
      });
      tokentailsCharsNpcs?.forEach((npcCatBlessed) => {
        GameEvents.NPC_SPAWN.push({
          npc: npcCatBlessed,
          type: NPC_TYPE.TOKENTAILS_2,
        });
      });
      setHasSpawnedNpc(true);
    }
  }, [catsForSale, isGameLoaded, hasSpawnedNpc]);

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
