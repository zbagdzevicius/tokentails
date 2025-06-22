import { Codex } from "@/components/codex/Codex";
import { CloseButton } from "./CloseButton";

export const CodexModalContent = ({ close }: { close: () => void }) => {
  return (
    <div className="pt-4 px-4 md:px-12 md:pt-4 text-gray-700 flex flex-col gap-2 animate-appear font-primary">
      <Codex />
    </div>
  );
};

export const CodexModal = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 mt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div className="m-auto z-50 rem:w-[350px] md:w-[480px] max-w-full bg-gradient-to-b from-purple-300 to-blue-300 max-h-screen overflow-y-auto rounded-xl shadow h-fit">
        <CloseButton onClick={() => close()} />
        <CodexModalContent close={close} />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
