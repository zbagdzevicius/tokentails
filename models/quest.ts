import { IImage } from "./image";

export interface IQuest {
  _id: string;
  name: string;
  link: string;
  catpoints: number;
  image: IImage;
}
