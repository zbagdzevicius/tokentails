import { ICat } from "@/models/cats";

export const MAX_CAT_STATUS = 4;

export const getCatPrice = (cat: ICat) => {
  return Math.ceil(cat.price / cat.totalSupply);
};

export const getCatFundsToRaise = (cat: ICat) => {
  if (!cat.supply) return 0;
  return Math.ceil(cat.price / cat.totalSupply) * cat.supply;
};
