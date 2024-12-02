import { GameType } from "@/models/game";
import { PixelButton } from "../shared/PixelButton";
import { useCat } from "@/context/CatContext";
import { useToast } from "@/context/ToastContext";
import { Calendar } from "../shared/Calendar";

interface IProps {
  gameType: GameType | null;
  setGameType: (gameType: GameType | null) => void;
}

export const GameSelect = ({ setGameType, gameType }: IProps) => {
  const { cat } = useCat();
  const toast = useToast();

  return (
    <div
      className={`fixed left-1/2 right-1/2 translate-x-[50%] z-[10] flex flex-col gap-2 items-center ${
        gameType === GameType.SHELTER ? `bottom-4 pb-safe` : `top-24 md:top-48`
      }`}
    >
      {gameType && (
        <PixelButton
          text="CHOOSE YOUR ADVENTURE"
          active={cat?.status.EAT !== 4}
          onClick={() => {
            if (cat?.status?.EAT !== 4) {
              toast({ message: "You must feed your cat first" });
            } else {
              setGameType(null);
            }
          }}
        />
      )}
      {!gameType && (
        <>
          <div className="font-secondary whitespace-nowrap w-48 md:w-52 text-center text-p1 md:text-h5 bg-gradient-to-t from-yellow-300 to-purple-300 px-2 rounded-lg py-1">
            SELECT GAME
          </div>
          <div className="flex min-w-0 gap-2">
            <img
              onClick={() => setGameType(GameType.CATBASSADORS)}
              className="w-24 h-24 rem:min-w-[96px] rounded-xl hover:animate-hover"
              src="/game/select/catbassadors.jpg"
            />
            <img
              onClick={() => setGameType(GameType.PURRQUEST)}
              className="w-24 h-24 rem:min-w-[96px] rounded-xl hover:animate-hover"
              src="/game/select/purrquest.jpg"
            />
          </div>
        </>
      )}
    </div>
  );
};
