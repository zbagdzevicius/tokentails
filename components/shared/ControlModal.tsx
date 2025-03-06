import { CloseButton } from "./CloseButton";
import { Tag } from "./Tag";

export const ControlModalContent = () => {
  return (
    <div className="pt-4 pb-8 px-4 md:px-12 md:pt-4 md:pb-12 text-gray-700 flex flex-col gap-4 animate-appear">
      <Tag>Game Controls</Tag>
      <ul className="list-disc pl-5">
        <li>
          <strong>Up (W,SPACE):</strong> Move your character upward.
        </li>
        <li>
          <strong>Left (A):</strong> Move your character to the left.
        </li>
        <li>
          <strong>Right (D):</strong> Move your character to the right.
        </li>
        <li>
          <strong>Dash (Z):</strong> Perform a quick dash in the direction
          you're moving.
        </li>
        <li>
          <strong>Knockback (Q):</strong> Use a knockback ability to push and
          stun enemies away.
        </li>
      </ul>
      <p className="text-center text-sm text-gray-600 mt-4">
        Master these controls to navigate and dominate the game!
      </p>
    </div>
  );
};

export const ControlModal = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 mt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div className="m-auto z-50 rem:w-[350px] md:w-[480px] max-w-full bg-gradient-to-b from-purple-300 to-blue-300 absolute top-1/2 -translate-y-1/2 rounded-xl shadow h-fit">
        <CloseButton onClick={() => close()} />
        <ControlModalContent />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
