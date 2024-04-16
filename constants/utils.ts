import { EntityType } from "@/models/save";

export function getFilePath(path: string) {
  return `/${process.env.NEXT_PUBLIC_THEME}/${path}`;
}

export function randomNumber(min: number = 10, max: number = 999) {
  return Math.ceil(Math.random() * (max - min) + min);
}

export function randomObjectFromArray<T>(items?: T[]): T | null {
  if (!items?.length) {
    return null;
  }
  return items[Math.floor(Math.random() * items.length)];
}

export function insertObjectEveryN<T>(
  array: any[],
  n: number,
  objectToInsert: any
): (T | any)[] {
  for (let i = n - 1; i < array.length; i += n) {
    array.splice(i, 0, objectToInsert);
  }
  return array;
}

export const SocialLink = {
  Facebook: `https://facebook.com/${process.env.NEXT_PUBLIC_FB_PAGE}`,
  Twitter: `https://twitter.com/${process.env.NEXT_PUBLIC_TWITTER_PAGE}`,
  Pinterest: `https://pinterest.com/${process.env.NEXT_PUBLIC_PINTEREST_PAGE}`,
};

type DateInput = Date | number | string;

const SECOND = 1000;
const MINUTE = SECOND * 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const MONTH = DAY * 30;
const YEAR = DAY * 365;

const FROM_NOW_JUST_NOW = SECOND * 44;
const FROM_NOW_MINUTE = SECOND * 89;
const FROM_NOW_MINUTES = MINUTE * 44;
const FROM_NOW_HOUR = MINUTE * 89;
const FROM_NOW_HOURS = HOUR * 21;
const FROM_NOW_DAY = HOUR * 35;
const FROM_NOW_DAYS = DAY * 25;
const FROM_NOW_MONTH = DAY * 45;
const FROM_NOW_MONTHS = DAY * 319;
const FROM_NOW_YEAR = DAY * 547;

function getTickCount(value: DateInput = Date.now()): number {
  if (typeof value === "number") {
    return value;
  }

  return new Date(value).getTime();
}

export function fromNow(value: DateInput): { text: string; value?: number } {
  const nowTick = getTickCount();
  const valueTick = getTickCount(value);
  const delta = nowTick - valueTick;

  const result = {
    text: "",
    value: 0,
  };

  if (delta <= FROM_NOW_JUST_NOW) {
    result.text = "Naujausias";
  } else if (delta <= FROM_NOW_MINUTE) {
    result.text = `Naujas`;
  } else if (delta <= FROM_NOW_MINUTES) {
    result.value = Math.ceil(delta / MINUTE);
    result.text = `Prieš ${result.value} minutes`;
  } else if (delta <= FROM_NOW_HOUR) {
    result.text = `Prieš valandą`;
  } else if (delta <= FROM_NOW_HOURS) {
    result.value = Math.ceil(delta / HOUR);
    result.text = `Prieš ${result.value} valandas`;
  } else if (delta <= FROM_NOW_DAY) {
    result.text = `Prieš dieną`;
  } else if (delta <= FROM_NOW_DAYS) {
    result.value = Math.ceil(delta / DAY);
    result.text = `Prieš ${result.value} dienas`;
  } else if (delta <= FROM_NOW_MONTH) {
    result.text = `Prieš mėnesį`;
  } else if (delta <= FROM_NOW_MONTHS) {
    result.value = Math.ceil(delta / MONTH);
    result.text = `Prieš ${result.value} mėnesius`;
  } else if (delta <= FROM_NOW_YEAR) {
    result.text = `Prieš metus`;
  } else {
    result.value = Math.ceil(delta / YEAR);
    result.text = `Prieš ${result.value} metus`;
  }

  return result;
}

export const getEntityType = (entity: any) => {
  if (entity?.questions) {
    return EntityType.QUIZ;
  }
  if (entity?.gif) {
    return EntityType.VIDEO;
  }
  if (entity?.type === EntityType.VIDEO_SLIDER) {
    return EntityType.VIDEO_SLIDER;
  }
  if (entity?.bgImage) {
    return EntityType.GROUP;
  }
  if (entity?.user) {
    return EntityType.PUBLICATION;
  }

  return EntityType.ARTICLE;
};

export const toRem = (value: number) => {
  return `${(Math.round((value / 16) * 8) / 8).toFixed(2)}rem`;
};

export const getTimeString = (date?: string | Date) => {
  if (!date) {
    return "";
  }
  return new Date(date)
    ?.toTimeString()
    ?.split(" ")[0]
    .split(":")
    .slice(0, 2)
    .join(":");
};

export const getCurrentDateValue = () => {
  const date = new Date();

  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

export const getCurrentMonthDateValue = () => {
  const date = new Date();

  return `${date.getFullYear()}-${date.getMonth()}`;
};

export function getRandomInt(max: number) {
  return Math.floor(Math.random() * max);
}
