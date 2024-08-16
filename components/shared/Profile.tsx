import { redeemCat, redeemFreeTrial } from "@/constants/api";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { ChangeEvent, useCallback, useState } from "react";
import { PixelButton } from "../button/PixelButton";
import { useToast } from "@/context/ToastContext";

const features = [
  "Take care of your cat !",
  "Enjoy Meowgical Experience",
  "Engage in Purrfect Gameplay",
];

export const ProfileContent = () => {
  const { logout, user, profile, refetchProfile, position } = useFirebaseAuth();
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const handleCodeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setCode(event?.target?.value);
  };
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

  const redeem = useCallback(async () => {
    const response = await redeemCat(code);
    if (!response) {
      setError("Code is wrong or cat is claimed");
    } else {
      setError("");
      refetchProfile();
    }
  }, [profile, code, setError, refetchProfile]);

  const freeTrial = useCallback(async () => {
    await redeemFreeTrial();
    refetchProfile();
  }, [profile, refetchProfile]);

  return (
    <div className="pt-8 pb-4 px-4 md:px-16 md:py-12 text-gray-500 flex flex-col gap-4 justify-between items-center">
      <img className="w-16 m-auto" src="/logo/logo.webp" />
      {user && <div>Hello, {user.displayName || user.email} !</div>}
      <div onClick={() => copy()} className="flex flex-col items-center">
        <div className="text-p6 font-bold">YOUR ACCOUNT WALLET ADDRESS</div>
        <p className="text-p5 font-bold font-secondary">
          {profile?.walletAddress}
        </p>
      </div>
      {!profile?.cat && (
        <div className="flex flex-col items-center justify-center gap-2 font-bold font-secondary">
          <p>Redeem your Virtual cat</p>
          <input
            type="text"
            placeholder="code"
            className="outline-none bg-gray-100 hover:bg-gray-200 p2 px-8 rounded-full h-10 w-full"
            onChange={handleCodeChange}
            value={code}
          />
          {error && <p className="text-red-500">{error}</p>}
          <PixelButton text="Redeem" onClick={() => redeem()} />
          <p>You don't have a code ?</p>
          <PixelButton text="Try Free trial" onClick={() => freeTrial()} />
        </div>
      )}
      {profile?.cat && (
        <ul className="m-auto">
          <li className="flex items-center gap-x-2">
            <img className="w-4" src="/logo/coin.webp" />
            <div>Your cat name is {profile.cat.name}</div>
          </li>
          <li className="flex items-center gap-x-2">
            <img className="w-4" src="/logo/coin.webp" />
            <div>Leaderboard position #{position}</div>
          </li>

          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-x-2">
              <img className="w-4" src="/logo/coin.webp" />
              <div>{feature}</div>
            </li>
          ))}
          {profile.cat.expiresAt && (
            <li className="flex items-center gap-x-2 mt-2">
              <div className="flex flex-col">
                <div className="text-p6 text-center">
                  Your cat is going to expire on<br></br>
                  {new Date(profile.cat.expiresAt).toLocaleString()}
                </div>
                <div className="text-p6">
                  You'll be allowed to adopt it after expiration period
                </div>
                <div className="text-p6 text-center">
                  Take care of it to get a discount
                </div>
              </div>
            </li>
          )}
        </ul>
      )}
      {user && (
        <div className="pt-8 opacity-25 hover:opacity-100">
          <PixelButton onClick={logout} text="Logout ; ("></PixelButton>
        </div>
      )}
    </div>
  );
};

export const Profile = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 pt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div className="z-50 rem:w-[350px] md:w-[480px] transition-from-bottom-animation max-w-full relative bg-white absolute top-[7rem] md:top-[9rem] rounded-lg shadow h-fit">
        <ProfileContent />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
