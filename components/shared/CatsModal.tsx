import { catsFetch } from "@/constants/api";
import { useProfile } from "@/context/ProfileContext";
import { useQuery } from "@tanstack/react-query";
import { PixelButton } from "../button/PixelButton";
import { ICat } from "@/models/cats";
import { useToast } from "@/context/ToastContext";

export const CatsModalContent = ({ close }: { close: () => void }) => {
  const { profile, setProfileUpdate } = useProfile();
  const toast = useToast();

  const { data: cats } = useQuery({
    queryKey: ["cats", profile?.cat],
    queryFn: () => catsFetch(),
  });
  const onCatSelect = (cat: ICat) => {
    const isSameCat = profile?.cat._id === cat._id;
    if (isSameCat || !cat) {
      toast({ message: "This cat is selected" });
      return;
    }
    setProfileUpdate({ cat: cat });
    toast({ message: "Switch game to spawn your cat" });
    close();
  };

  return (
    <div className="px-4 pt-4 pb-8 md:px-16 text-gray-800 flex flex-col justify-between items-center">
      <h2 className="text-center font-secondary uppercase tracking-tight text-8xl max-lg:text-5xl max-lg:text-balance mb-8">
        My Cats
      </h2>
      <div className="flex flex-wrap justify-center">
        {cats?.map((cat) => (
          <div className="w-1/2 flex justify-center mb-4">
            <div className="relative overflow-hidden w-36 rounded-xl py-2 border-2 border-black">
              <div className="relative z-10 items-center flex flex-col">
                <img className="w-16 z-10" src={cat.catImg} />
                <img
                  className="w-8 mb-2 -mt-8 z-0 animate-spin"
                  src={`ability/${cat.type}.png`}
                />
                <div className="text-p4 bg-red-600 font-secondary text-white text-yellow-300 w-full text-center opacity-75 mb-2 border-y-2 border-black">
                  {cat.name}
                </div>
                <PixelButton
                  active={profile?.cat._id === cat._id}
                  text={profile?.cat._id === cat._id ? "Selected" : "select"}
                  onClick={() => onCatSelect(cat)}
                ></PixelButton>
              </div>
              <img
                className="absolute inset-0 object-cover w-full h-full z-0"
                src={`ability/${cat.type}_bg.webp`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const CatsModal = ({ close }: { close: () => void }) => {
  return (
    <div className="fixed inset-0 pt-safe w-full z-[100] flex justify-center h-full">
      <div
        onClick={close}
        className="z-40 h-full w-full absolute inset-0 bg-yellow-300 opacity-50"
      ></div>
      <div className="z-50 rem:w-[350px] md:w-[480px] transition-from-bottom-animation max-w-full relative bg-gradient-to-b from-yellow-300 to-purple-300 absolute inset-0 max-h-screen overflow-y-auto rounded-lg shadow h-fit">
        <CatsModalContent close={close} />
        <button onClick={close} className="absolute right-[0] top-0 group">
          <i className="bx bx-x-circle text-h5 text-gray-400 group-hover:text-gray-600 transition duration-300"></i>
        </button>
      </div>
    </div>
  );
};
