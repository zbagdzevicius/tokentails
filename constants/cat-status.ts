import { ICat } from "@/models/cats";

export const MAX_CAT_STATUS = 4;

export const getCatPrice = (cat: ICat) => {
  if (
    !cat.price ||
    cat.price < 5 ||
    !cat.totalSupply ||
    !cat.supply ||
    cat.supply === 1
  ) {
    return cat.price;
  }

  return cat.price * (1 - (cat.supply - 1) / cat.totalSupply);
};

export const getCatDiscountPercentage = (cat: ICat) => {
  return cat.supply > 1 && cat.price
    ? Math.floor(((cat.price - getCatPrice(cat)) / cat.price) * 100)
    : 0;
};
