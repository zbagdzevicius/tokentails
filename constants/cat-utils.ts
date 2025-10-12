import { ICat } from "@/models/cats";

export const getMultiplier = (cat?: ICat | null) => {
  if (!cat) {
    return 1;
  }
  if (cat.price >= 2500) {
    return 15;
  }
  if (cat.blessings?.length) {
    return 10;
  }
  if (cat.price) {
    return 5;
  }
  return 1;
};

export enum BuyMode {
  CAT = "CAT",
}
