import { useCat } from "@/context/CatContext";
import { StatusType } from "@/models/status";
import { forwardRef, useEffect, useLayoutEffect, useRef } from "react";
import { GameEvents, IPhaserGame } from "../Phaser/events";
import { StartGame } from "./config";
import { useProfile } from "@/context/ProfileContext";
import { useQuery } from "@tanstack/react-query";
import { CAT_API } from "@/api/cat-api";
import { useState } from "react";
import { ICat } from "@/models/cats";
import { useToast } from "@/context/ToastContext";
import { GameType } from "@/models/game";
import { MAX_CAT_STATUS } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";

interface IProps {
  currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

const BaseGame = forwardRef<IPhaserGame, IProps>(function PhaserGame(
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

function Base() {
  const phaserRef = useRef<IPhaserGame | null>(null);
  const { setCatStatus, cat } = useCat();
  const { profile, setProfileUpdate } = useProfile();
  const [selectedNpc, setSelectedNpc] = useState<ICat | null>(null);
  const [showModal, setShowModal] = useState(false);
  const toast = useToast();
  const { setGameType } = useGame();

  const { data: userCats } = useQuery({
    queryKey: ["user-cats", profile?._id],
    queryFn: () => CAT_API.cats(),
  });

  const isGameLoaded = GameEvents.GAME_LOADED.use();
  useEffect(() => {
    if (cat && isGameLoaded?.scene) {
      GameEvents.CAT_SPAWN.push({ cat });

      if ((cat.status.EAT || 0) < 4) {
        GameEvents.CAT_MEOW.push({ cat });
      }
    }
  }, [cat, isGameLoaded]);

  useEffect(() => {
    const setStatus = () => {
      if ((cat?.status[StatusType.EAT] || 0) < 4) {
        setCatStatus({ type: StatusType.EAT, status: 4 });
      }
    };
    GameEvents.CAT_EATEN.addEventListener(setStatus);

    return () => {
      GameEvents.CAT_EATEN.removeEventListener(setStatus);
    };
  }, [cat?.status]);

  useEffect(() => {
    if (userCats && userCats.length > 0 && isGameLoaded?.scene) {
      userCats.forEach((singleCat) => {
        GameEvents.PLAYER_CATS.push({ npc: singleCat });
      });
    }
  }, [userCats, isGameLoaded]);

  GameEvents.CAT_CARD_DISPLAY.use((event) => {
    if (event) {
      setSelectedNpc(event.npc);
      setShowModal(true);
    }
  });
  GameEvents.CAT_CARD_DISPLAY.use((event) => {
    if (event) {
      const cat = event.npc;
      const isSameCat = profile?.cat._id === cat._id;

      if (isSameCat || !cat) {
        toast({ message: "This cat is already selected" });
        return;
      }

      setProfileUpdate({ cat });
      CAT_API.setActive(cat._id!);
      GameEvents.CAT_SPAWN.push({ cat });

      toast({ message: "Cat selected successfully!" });
      if (cat?.status?.EAT !== MAX_CAT_STATUS) {
        setGameType(GameType.HOME);
      }

      setSelectedNpc(cat);
      setShowModal(true);
    }
  });


  return (
    <div id="app" className="z-20">
      <BaseGame ref={phaserRef} />
      {showModal && selectedNpc && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center bg-black bg-opacity-30">
          <div
            className="absolute inset-0 z-0"
            onClick={() => setShowModal(false)}
          ></div>
        </div>
      )}
    </div>
  );
}

export default Base;
