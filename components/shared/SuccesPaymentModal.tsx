import { createPortal } from "react-dom";
import { CloseButton } from "./CloseButton";

interface ISuccesPaymentModal {
  close: () => void;
}

export const SuccesPaymentModal = ({ close }: ISuccesPaymentModal) => {
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden">
      <div onClick={close} className="fixed inset-0 bg-black opacity-50"></div>
      <div className="relative w-full width: max-w-[85%] md:rem:max-w-[600px] bg-gradient-to-b from-purple-300 to-blue-300 rounded-lg shadow-lg overflow-hidden">
        <CloseButton onClick={close} />
        <img
          draggable={false}
          className="w-full h-auto object-contain"
          src="/background/succes-payment.jpg"
          alt="Success Payment"
        />
      </div>
    </div>,
    document.body
  );
};
