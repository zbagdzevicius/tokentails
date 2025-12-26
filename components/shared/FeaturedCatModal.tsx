import { useGame } from "@/context/GameContext";
import { GameModal, GameType } from "@/models/game";
import { CloseButton } from "./CloseButton";
import { PixelButton } from "./PixelButton";
import { Tag } from "./Tag";

export const FeaturedCatContent = ({ close }: { close: () => void }) => {
  const { setOpenedModal, setGameType } = useGame();
  return (
    <div className="pt-4 pb-8 px-4 md:px-12 md:pt-4 md:pb-12 text-yellow-900 flex flex-col gap-2 animate-appear font-primary">
      <Tag>Sticky</Tag>
      <img
        src="https://tokentails.fra1.cdn.digitaloceanspaces.com/81576503959.png"
        className="rounded-[24px] w-48 m-auto"
      />
      <div className="flex flex-col gap-4 uppercase text-center">
        $TAILS doesn’t chase hype. It finds the worthy.
      </div>
      <Tag isSmall>WHO IS STICKY?</Tag>
      <div className="flex flex-col gap-4 text-center">
        STICKY IS EXCLUSIVE CAMP'S MASCOT PET THAT GIVES DOUBLE JUMP, X15 COINS
        MULTIPLIER AND UNIQUE ABILITY TO PLAY CHAPTER 3 OF CATNIP CHAOS
      </div>
      <Tag isSmall>YOU DON'T HAVE STICKY YET?</Tag>
      <div className="flex flex-col gap-4 text-center">
        YOU NEED TO COMPLETE CAMP'S TASKS TO UNLOCK HIM AND YOU'LL FIND HIM IN
        THE SHELTER!
      </div>

      <div className="flex items-center justify-center gap-2">
        <PixelButton
          text="CAMP'S TASKS"
          onClick={() => {
            setOpenedModal(GameModal.INVITE);
          }}
        />
        <PixelButton
          text="SHELTER"
          onClick={() => {
            close();
            setGameType(GameType.SHELTER);
          }}
        />
      </div>
    </div>
  );
};

export const FeaturedCatModal = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 mt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div className="m-auto z-50 rem:w-[350px] md:w-[480px] max-w-full bg-gradient-to-b from-purple-300 to-blue-300 max-h-screen overflow-y-auto rounded-xl shadow h-fit">
        <CloseButton onClick={() => close()} />
        <FeaturedCatContent close={close} />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
