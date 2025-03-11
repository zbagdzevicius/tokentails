import { CAT_API } from "@/api/cat-api";
import { MAX_CAT_STATUS, useCat } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { GameType } from "@/models/game";
import { StatusType } from "@/models/status";
import { useQuery } from "@tanstack/react-query";
import { forwardRef, useEffect, useLayoutEffect, useRef } from "react";
import { GameEvents, IPhaserGame } from "../Phaser/events";
import { StartGame } from "./config";

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
  const toast = useToast();
  const { setGameType } = useGame();

  const { data: userCats } = useQuery({
    queryKey: ["user-cats", profile?._id],
    queryFn: () => CAT_API.cats(),
  });

  let catsWithoutPlayerCat = userCats?.filter((c) => c._id !== cat?._id); //delete current user cat

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
    if (
      catsWithoutPlayerCat &&
      catsWithoutPlayerCat.length > 0 &&
      isGameLoaded?.scene
    ) {
      // First, clear existing NPCs
      GameEvents.CLEAR_NPCS.push();

      // Then spawn all cats that aren't the current player cat
      catsWithoutPlayerCat.forEach((singleCat) => {
        GameEvents.PLAYER_CATS.push({ npc: singleCat });
      });
    }
  }, [userCats, isGameLoaded, cat]);

  GameEvents.CAT_CARD_DISPLAY.use((event) => {
    if (event) {
      const cat = event.npc;
      const isSameCat = profile?.cat._id === cat._id;

      if (isSameCat || !cat) {
        toast({ message: "This cat is already selected" });
        return;
      }

      setProfileUpdate({
        cat,
        cats: (profile!.cats || []).map((c) => (c._id === cat._id ? cat : c)),
      });
      CAT_API.setActive(cat._id!);
      GameEvents.CAT_SPAWN.push({ cat });

      toast({ message: "Cat selected successfully!" });
      if (cat?.status?.EAT !== MAX_CAT_STATUS) {
        setGameType(GameType.HOME);
      }
    }
  });

  return (
    <div id="app" className="z-20">
      <BaseGame ref={phaserRef} />
    </div>
  );
}

export default Base;
