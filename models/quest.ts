import { IImage } from "./image";

export interface IQuest {
  _id: string;
  name: string;
  link: string;
  catpoints: number;
  image: IImage;
}

export type IDataRecord = Record<string, number>;

export interface IQuestStatistics {
  users: {
    count: number;
    weekly: IDataRecord[];
  };
  cats: {
    count: number;
    staked: number;
  };
  blessings: {
    count: number;
    weekly: IDataRecord[];
  };
  orders: {
    count: number;
    weekly: IDataRecord[];
  };
}
