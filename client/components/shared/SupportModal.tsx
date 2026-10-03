import { TICKET_API } from "@/api/ticket-api";
import { useToast } from "@/context/ToastContext";
import { useId, useState } from "react";
import { GameModal } from "@/components/ui/GameModal";
import { useAccountAction, useLatest } from "@/hooks/useAccountAction";
import { PixelButton } from "./PixelButton";
import { Tag } from "./Tag";
import { useQuery } from "@tanstack/react-query";
import { useProfile } from "@/context/ProfileContext";

export const SupportContent = () => {
  const [mode, setMode] = useState<"create" | "my-tickets">("create");
  const [message, setMessage] = useState("");
  const { setProfileUpdate, profile } = useProfile();
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const messageId = useId();
  // Tickets belong to an account (decision #9): a guest writes the message, and sending it (or
  // opening their tickets) asks them to sign in first. A guest's tickets are never fetched.
  const { runWithAccount, hasAuth, isRegistered } = useAccountAction();
  const canReadTickets = !hasAuth || isRegistered;
  const latest = useLatest({ profile, setProfileUpdate });
  const { data: tickets } = useQuery({
    queryKey: ["tickets", mode],
    queryFn: () => TICKET_API.getTickets(),
    enabled: canReadTickets,
  });

  const createTicket = async () => {
    const msg = message.trim();
    if (msg.length <= 10000 && msg.length) {
      setIsLoading(true);
      try {
        const result = await TICKET_API.createTicket({
          message,
        });
        if (result) {
          setMessage("");
          toast({
            message: "Ticket created successfully",
            isError: false,
          });
          // May run after the AuthSheet: read the account's profile, not the guest's.
          const { profile: current, setProfileUpdate: update } = latest.current;
          update({
            monthTicketCount: (current?.monthTicketCount || 0) + 1,
          });
        } else {
          toast({
            message: "You can create only 1 ticket per day",
            isError: true,
          });
        }
      } catch {
        toast({
          message: "You can create only 1 ticket per day",
          isError: true,
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="pt-1 pb-2 md:px-4 text-tt-cream flex flex-col gap-2 animate-appear font-primary relative">
      <Tag>{mode === "create" ? "CREATE A TICKET" : "MY TICKETS"}</Tag>
      <Tag size="sm">Faced a problem? We&apos;re here to help!</Tag>
      {mode === "create" && (
        <>
          <label htmlFor={messageId} className="sr-only">
            Your message
          </label>
          <textarea
            id={messageId}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your issue. List your thoughts, problems, suggestions, etc."
            className="w-full min-h-[11rem] rounded-[4px] border-2 border-tt-gold-500 bg-tt-night-900 p-2 font-secondary text-tt-cream placeholder:text-tt-muted outline-none focus-visible:ring-4 focus-visible:ring-tt-gold-400"
          ></textarea>

          <div className="flex items-center justify-center gap-2">
            <PixelButton
              text={isLoading ? "SENDING..." : "SEND"}
              disabled={isLoading}
              onClick={() => {
                void runWithAccount("support", createTicket);
              }}
            />
          </div>
          <div className="flex flex-col items-center justify-center gap-0 font-primary text-p6">
            <Tag size="sm">Tips to get response faster</Tag>
            <div className="mt-1">IN GAME ISSUES? BE SPECIFIC</div>
            <div className="mt-1">GENERAL FEEDBACK? BE CONCISE</div>
            <div className="">TRANSACTION ISSUE? INCLUDE TRANSACTION HASH</div>
          </div>
          <PixelButton
            text="MY TICKETS"
            onClick={() => {
              void runWithAccount("support", () => setMode("my-tickets"));
            }}
          />
        </>
      )}
      {mode === "my-tickets" && (
        <>
          <PixelButton
            text="CREATE A TICKET"
            onClick={() => {
              setMode("create");
            }}
          />
          <div className="flex flex-col gap-4">
            {tickets?.map((ticket, i) => (
              <div
                key={i}
                className="bg-tt-night-900/80 border-2 border-tt-gold-500/60 text-tt-cream font-primary text-p5 p-2 rounded-lg"
              >
                <div>
                  <span className="bg-tt-lilac text-tt-gold-ink text-p6 p-2 rounded-2xl mr-2">
                    MESSAGE
                  </span>
                  {ticket.message}
                </div>
                <div className="pt-2 mt-2 border-t-4 border-tt-sky">
                  <span className="bg-tt-sky text-tt-gold-ink text-p6 p-2 rounded-2xl mr-2">
                    ANSWER
                  </span>
                  {ticket.answer || "IS PENDING. WE'LL REPLY IN 48 HOURS."}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const SupportModal = ({ close }: { close: () => void }) => {
  return (
    <GameModal
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="SUPPORT"
      name="support"
      size="md"
    >
      <SupportContent />
    </GameModal>
  );
};
