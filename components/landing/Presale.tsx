import { useWeb3 } from "@/context/Web3Context";
import { useEffect } from "react";
import { PresaleCard } from "../shared/PresaleCard";
import { SuccesPaymentModal } from "../shared/SuccesPaymentModal";

export const Presale = () => {
  const { isTransactionSucces, setIsTransactionSucces } = useWeb3();

  useEffect(() => {
    if (isTransactionSucces) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, [isTransactionSucces]);

  return (
    <>
      {isTransactionSucces && (
        <SuccesPaymentModal close={() => setIsTransactionSucces(false)} />
      )}
      <div className="container py-4 h-full flex flex-col items-center justify-center overflow-visible">
        <PresaleCard />
      </div>
    </>
  );
};
