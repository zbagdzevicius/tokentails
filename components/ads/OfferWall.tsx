import React, { useEffect } from "react";
import { CloseButton } from "../shared/CloseButton";
import { useProfile } from "@/context/ProfileContext";
import { useToast } from "@/context/ToastContext";

export const OfferWallContent = ({ close }: { close: () => void }) => {
  const { profile } = useProfile();
  return (
    <iframe
      className="w-full h-full"
      id="my-chips-iframe"
      allow="ch-ua-platform; ch-ua-platform-version"
      src={`https://sdk.mychips.io/content?content_id=0900dc62-87dc-4568-bf0f-ffc0ffe931b2&user_id=${profile?._id}`}
    ></iframe>
  );
};

export const OfferWallModal = ({ close }: { close: () => void }) => {
  const toast = useToast();

  useEffect(() => {
    toast({
      message:
        "Complete tasks to earn $TAILS. Earned $TAILS will be added to your balance in 5 minutes",
    });
  }, []);

  return (
    <div className="fixed inset-0 mt-safe w-full z-[100] flex justify-center h-full ">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div className="m-auto z-50 rem:w-[380px] overflow-hidden md:w-[480px] h-screen max-w-full bg-gradient-to-b from-purple-300 to-blue-300 max-h-screen rounded-xl shadow">
        <CloseButton onClick={() => close()} />
        <OfferWallContent close={close} />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
