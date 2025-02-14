import { PresaleCard } from "../shared/PresaleCard";
import { SuccesPaymentModal } from "../shared/SuccesPaymentModal";

export const Presale = () => {

  return (
    <>
      {false && (
        <SuccesPaymentModal close={() => true} />
      )}
      <div className="container py-4 h-full flex flex-col items-center justify-center overflow-visible">
        <PresaleCard />
      </div>
    </>
  );
};
