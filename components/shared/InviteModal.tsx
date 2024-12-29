import { useProfile } from "@/context/ProfileContext";
import { CloseButton } from "./CloseButton";
import { PixelButton } from "./PixelButton";

export const InviteModalContent = () => {
  const { utils, shareUrl } = useProfile();
  return (
    <div className="pt-4 pb-8 px-4 md:px-16 md:pt-4 md:pb-12 text-gray-700 flex flex-col justify-between items-center animate-appear">
      <h1 className="text-p3 font-secondary bg-yellow-300 w-fit px-4 mb-2 rounded-lg m-auto">
        GIFT
      </h1>
      <div className="flex flex-col my-4">
        <div className="flex flex-row items-center">
          <img
            className="w-7 md:w-8 md:h-8 lg:w-10 lg:h-10 h-7 mr-1"
            src="/logo/coin.png"
          />
          <p className="lg:text-lg text-base font-medium">
            {" "}
            Get 20% earnings of your friends
          </p>
        </div>
        <div className="flex flex-row items-center">
          <img
            className="w-7 h-7  md:w-8 md:h-8 lg:w-10 lg:h-10 mr-1"
            src="/icons/invites/gift.png"
          />
          <p className="lg:text-lg text-base font-medium">
            Get 5k for every redeemed gift
          </p>
        </div>
        <div className="flex flex-row items-center">
          <img
            className="w-7 h-7  md:w-8 md:h-8 lg:w-10 lg:h-10 mr-1"
            src="/base/heart.png"
          />
          <p className="lg:text-lg text-base font-medium">
            Get 10 lives for every redeemed gift
          </p>
        </div>
        <div className="flex flex-row items-center">
          <img
            className="w-7 h-6  md:w-8 md:h-7 lg:w-10 lg:h-9 mr-1"
            src="/icons/invites/gift-coin.png"
          />
          <p className="lg:text-lg text-base font-medium">
            Gift contains 50k coins to your friend
          </p>
        </div>
      </div>
      <PixelButton
        text="Give a gift"
        onClick={() => utils?.shareURL(shareUrl!)}
      />
    </div>
  );
};

export const InviteModal = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 pt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div className="z-50 rem:w-[350px] md:w-[480px] transition-from-bottom-animation max-w-full relative bg-gradient-to-b from-purple-300 to-blue-300 absolute top-[7rem] md:top-[9rem] rounded-lg shadow h-fit">
        <InviteModalContent />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
        <CloseButton onClick={() => close()} />
      </div>
    </div>
  );
};
