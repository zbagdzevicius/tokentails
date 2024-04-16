import { IComment } from './comment';
import { IGroup } from './group';
import { IImage } from './image';
import { IProfile } from './profile';

export interface IPublication {
    _id: string;
    content: string;
    slug: string;
    image: IImage;
    group?: IGroup;
    user: IProfile;
    comments: IComment[];
}
