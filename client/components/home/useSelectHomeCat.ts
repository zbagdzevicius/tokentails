/**
 * Choosing another of the player's cats from HOME (the Phaser speech bubble's SELECT, or SELECT on
 * the Cat Yard's name card): one flow for both HOMEs.
 */
import { useCallback } from "react";
import { CAT_API } from "@/api/cat-api";
import { GameEvents } from "@/components/Phaser/events";
import { MAX_CAT_STATUS } from "@/context/CatContext";
import { useGame } from "@/context/GameContext";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import type { ICat } from "@/models/cats";
import { GameType } from "@/models/game";

export function useSelectHomeCat(): (cat: ICat | null | undefined) => void {
  const { profile, setProfileUpdate } = useProfile();
  const toast = useToast();
  const { setGameType } = useGame();

  return useCallback(
    (cat: ICat | null | undefined) => {
      if (!cat || profile?.cat?._id === cat._id) {
        toast({ message: "This cat is already selected" });
        return;
      }
      setProfileUpdate({
        cat,
        cats: (profile?.cats || []).map((c) => (c._id === cat._id ? cat : c)),
      });
      CAT_API.setActive(cat._id!);
      GameEvents.CAT_SPAWN.push({ cat });

      toast({ message: `${cat.name} selected successfully!`, img: cat.catImg });
      if (cat?.status?.EAT !== MAX_CAT_STATUS) {
        setGameType(GameType.HOME);
      }
    },
    [profile, setProfileUpdate, toast, setGameType],
  );
}
