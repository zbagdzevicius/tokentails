import { ICat } from "@/models/cats";
import { GameModal } from "@/models/game";
import dynamic from "next/dynamic";

interface IProps extends ICat {
  onClose?: (gameModal?: GameModal) => void;
  onAdopted?: () => void;
  relative?: boolean;
}

const SafeCatCard = dynamic(
  () => import("./SafeCatCard").then((mod) => mod.SafeCatCard),
  { ssr: false }
);

export const CatCard = ({ onClose, onAdopted, relative, ...cat }: IProps) => {
  return (
    <SafeCatCard
      {...cat}
      onClose={onClose}
      onAdopted={onAdopted}
      relative={relative}
    />
  );
};
