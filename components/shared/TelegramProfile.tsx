import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";
import { useCallback } from "react";

const features = [
  "Mystery boxes",
  "NFTs & Airdrops prizes",
  "Weekly Rewards & Events",
];

export const TelegramProfileContent = () => {
  const { profile, position } = useProfile();
  const toast = useToast();
  const copy = useCallback(() => {
    navigator.clipboard
      .writeText(profile?.walletAddress!)
      .then(() => {
        toast({ message: "Wallet address coppied to clipboard" });
      })
      .catch((err) => {
        throw err;
      });
  }, [profile?.walletAddress, toast, close]);

  return (
    <div className="pt-4 pb-8 px-4 md:px-16 md:py-12 text-gray-700 flex flex-col justify-between items-center">
      <img
        className="w-16 m-auto"
        src={profile?.cat?.catImg || "/logo/logo.webp"}
      />
      {profile?.cat && (
        <ul className="m-auto font-primary">
          <li className="text-p3 font-secondary bg-yellow-300 w-fit px-4 mb-2 rounded-lg">
            Hello, {profile.name} !
          </li>
          <li className="flex items-center gap-x-2">
            <img className="w-4" src="/logo/comments.png" />
            <div>
              Active cat is{" "}
              <span className="font-bold">{profile.cat.name}</span>
            </div>
          </li>
          <li className="flex items-center gap-x-2">
            <img className="w-4" src="/logo/boss-coin.png" />
            <div>
              Position{" "}
              <span className="font-bold">#{position || 0}</span>
            </div>
          </li>
          <li className="flex items-center gap-x-2">
            <img className="w-4" src="/logo/friends.png" />
            <div>
              Friends{" "}
              <span className="font-bold">
                {profile.referrals?.length || 0}
              </span>
            </div>
          </li>
          <li className="flex items-center gap-x-2 mb-4">
            <img className="w-4" src="/logo/chest.webp" />
            <div>
              Coins:{" "}
              <span className="font-bold">
                {profile.catpoints?.toFixed(0) || 0}
              </span>
            </div>
          </li>

          <li className="font-secondary text-p3 bg-yellow-300 rounded-lg w-fit px-4 mb-2">
            What to expect ?
          </li>
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-x-2">
              <img className="w-4" src="/logo/coin.webp" />
              <div>{feature}</div>
            </li>
          ))}

          <li onClick={() => copy()} className="flex flex-col gap-1 mt-3">
            <div className="text-p6">
              Your account wallet address{" "}
              <span className="font-bold px-4 py-0.5 bg-yellow-300 rounded-lg">
                COPY
              </span>
            </div>
            <p className="text-p5 font-bold font-secondary">
              {profile?.walletAddress}
            </p>
          </li>
        </ul>
      )}
    </div>
  );
};

export const TelegramProfile = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 pt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div className="z-50 rem:w-[350px] md:w-[480px] transition-from-bottom-animation max-w-full relative bg-gradient-to-b from-purple-300 to-blue-300 absolute top-[7rem] md:top-[9rem] rounded-lg shadow h-fit">
        <TelegramProfileContent />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
