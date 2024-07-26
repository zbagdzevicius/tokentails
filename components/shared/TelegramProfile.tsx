import { useTelegramAuth } from "@/context/TelegramAuthContext";

const features = [
  "NFTs",
  "Airdrops",
  "Mystery boxes",
  "Weekly Rewards",
  "Doubling Events - Track us on X",
];

export const TelegramProfileContent = () => {
  const { user, profile, refetchProfile, position } = useTelegramAuth();

  return (
    <div className="pt-4 pb-8 px-4 md:px-16 md:py-12 text-gray-500 flex flex-col justify-between items-center">
      <img
        className="w-16 m-auto"
        src={profile?.cat?.catImg || "/logo/logo.webp"}
      />
      {user && (
        <div className="text-p2 font-secondary">
          Hello,{" "}
          {user.user.firstName || user.user.lastName || user.user.username} !
        </div>
      )}
      {profile?.cat && (
        <ul className="m-auto font-primary">
          <li className="flex items-center gap-x-2">
            <img className="w-4" src="/logo/coin.webp" />
            <div>
              Your cat name is{" "}
              <span className="font-bold">{profile.cat.name}</span>
            </div>
          </li>
          <li className="flex items-center gap-x-2">
            <img className="w-4" src="/logo/coin.webp" />
            <div>
              Leaderboard position{" "}
              <span className="font-bold">#{position || 0}</span>
            </div>
          </li>
          <li className="flex items-center gap-x-2">
            <img className="w-4" src="/logo/coin.webp" />
            <div>
              Your referrals{" "}
              <span className="font-bold">
                {profile.referrals?.length || 0}
              </span>
            </div>
          </li>
          <li className="flex items-center gap-x-2 mb-4">
            <img className="w-4" src="/logo/coin.webp" />
            <div>
              Your coins:{" "}
              <span className="font-bold">{profile.catpoints || 0}</span>
            </div>
          </li>

          <li className="font-secondary text-p3">What to expect ?</li>
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-x-2">
              <img className="w-4" src="/logo/coin.webp" />
              <div>{feature}</div>
            </li>
          ))}
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
      <div className="z-50 rem:w-[350px] md:w-[480px] transition-from-bottom-animation max-w-full relative bg-white absolute top-[7rem] md:top-[9rem] rounded-lg shadow h-fit">
        <TelegramProfileContent />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
