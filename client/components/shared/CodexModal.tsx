import { Codex } from "@/components/codex/Codex";
import { CloseButton } from "./CloseButton";

export const CodexModalContent = () => {
  return (
    <div className="pt-4 px-4 md:px-8 lg:px-10 xl:px-12 md:pt-6 text-yellow-900 flex flex-col gap-3 animate-appear font-primary">
      <Codex />
    </div>
  );
};

export const CodexModal = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 mt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300/50 md:backdrop-blur-md animate-in fade-in duration-300"
      ></div>
      <div className="m-auto z-50 w-full md:w-[96vw] xl:w-[95vw] md:max-w-[1460px] bg-gradient-to-b from-yellow-800 to-yellow-300 max-h-screen overflow-y-auto md:rounded-xl shadow h-fit md:border-4 border-yellow-300 glow-box">
        <CloseButton onClick={() => close()} />
        <CodexModalContent />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
