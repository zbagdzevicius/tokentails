import { GameModal } from "@/components/ui/GameModal";
import { cdnFile } from "@/constants/utils";

interface ISuccesPaymentModal {
  close: () => void;
}

/**
 * Payment confirmation art on the night panel (plan G6 "Overlay migration"). GameModal portals,
 * traps focus, closes on Esc, scrim and X, and caps the panel to the viewport minus safe areas.
 */
export const SuccesPaymentModal = ({ close }: ISuccesPaymentModal) => (
  <GameModal
    open
    onOpenChange={(next) => {
      if (!next) close();
    }}
    title="Payment received"
    name="payment-success"
    size="lg"
    layer="modal-nested"
  >
    <img
      draggable={false}
      className="block h-auto w-full rounded-md object-contain ring-1 ring-tt-gold-500/30"
      src={cdnFile("background/succes-payment.jpg")}
      alt="Your payment went through"
    />
  </GameModal>
);
