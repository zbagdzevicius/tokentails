import { IImage } from './image';

export interface IQuest {
  _id?: string;
  name: string;
  link: string;
  catpoints: number;
  tails: number;
  image: IImage;
}

/**
 * Write payload for POST/PUT /quest: the image is sent as its id, and the
 * reward inputs keep '' while the number field is empty.
 */
export type IQuestInput = Omit<IQuest, 'image' | 'catpoints' | 'tails'> & {
  image?: string;
  catpoints: number | '';
  tails: number | '';
};
