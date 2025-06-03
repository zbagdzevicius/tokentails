import { ICat } from "@/models/cats";

export const getMultiplier = (cat?: ICat | null) => {
  if (!cat) {
    return 1;
  }
  if (cat.price > 1500) {
    return 15;
  }
  if (cat.blessings?.length) {
    return 10;
  }
  if (cat.price) {
    return 5;
  }
  if (cat.catpoints > 1000000) {
    return 3;
  }
  if (cat.catpoints > 50000) {
    return 2;
  }
  return 1;
};

export enum BuyMode {
  CAT = "CAT",
}
