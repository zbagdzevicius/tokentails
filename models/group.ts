import { IComment } from './comment';
import { IImage } from './image';

export interface IGroup {
    _id: string;
    name: string;
    image: IImage;
    bgImage: IImage;
    description: string;
    slug: string;
    comments: IComment[];
}
