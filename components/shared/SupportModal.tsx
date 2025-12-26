import { TICKET_API } from "@/api/ticket-api";
import { useToast } from "@/context/ToastContext";
import { useState } from "react";
import { CloseButton } from "./CloseButton";
import { PixelButton } from "./PixelButton";
import { Tag } from "./Tag";
import { useQuery } from "@tanstack/react-query";
import { useProfile } from "@/context/ProfileContext";

export const SupportContent = ({ close }: { close: () => void }) => {
  const [mode, setMode] = useState<"create" | "my-tickets">("create");
  const [message, setMessage] = useState("");
  const { setProfileUpdate, profile } = useProfile();
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const { data: tickets } = useQuery({
    queryKey: ["tickets", mode],
    queryFn: () => TICKET_API.getTickets(),
  });

  const createTicket = async () => {
    const msg = message.trim();
    if (msg.length <= 10000 && msg.length) {
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
          setProfileUpdate({
            monthTicketCount: (profile?.monthTicketCount || 0) + 1,
          });
        } else {
          toast({
            message: "You can create only 1 ticket per day",
            isError: true,
          });
        }
      } catch (error) {
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
    <div className="pt-4 pb-4 px-4 md:px-12 md:pt-4 text-yellow-900 flex flex-col gap-2 animate-appear font-primary relative">
      <Tag>{mode === "create" ? "CREATE A TICKET" : "MY TICKETS"}</Tag>
      <Tag isSmall>Faced a problem? We're here to help!</Tag>
      {mode === "create" && (
        <>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your issue. List your thoughts, problems, suggestions, etc."
            className="w-full min-h-[11rem] border-2 border-gray-300 rounded-md p-2 font-secondary"
          ></textarea>

          <div className="flex items-center justify-center gap-2">
            <PixelButton
              text={isLoading ? "SENDING..." : "SEND"}
              isDisabled={isLoading}
              onClick={() => {
                createTicket();
              }}
            />
          </div>
          <div className="flex flex-col items-center justify-center gap-0 font-primary text-p6">
            <Tag isSmall>Tips to get response faster</Tag>
            <div className="mt-1">IN GAME ISSUES? BE SPECIFIC</div>
            <div className="mt-1">GENERAL FEEDBACK? BE CONCISE</div>
            <div className="">TRANSACTION ISSUE? INCLUDE TRANSACTION HASH</div>
          </div>
          <PixelButton
            text="MY TICKETS"
            onClick={() => {
              setMode("my-tickets");
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
                className="bg-yellow-300 font-primary text-p5 p-2 rounded-lg"
              >
                <div>
                  <span className="bg-purple-300 text-p6 p-2 rounded-2xl mr-2">
                    MESSAGE
                  </span>
                  {ticket.message}
                </div>
                <div className="pt-2 mt-2 border-t-4 border-blue-300">
                  <span className="bg-blue-300 text-p6 p-2 rounded-2xl mr-2">
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
    <div className="fixed inset-0 mt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div className="m-auto z-50 rem:w-[350px] md:w-[480px] max-w-full bg-gradient-to-b from-purple-300 to-blue-300 max-h-screen overflow-y-auto rounded-xl shadow h-fit">
        <CloseButton onClick={() => close()} />
        <SupportContent close={close} />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
