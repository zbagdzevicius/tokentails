import { IProfile } from './profile';
import { EntityType } from './save';

export interface IComment {
    _id?: string;
    createdAt: string;
    user: IProfile;
    text: string;
    likesCount: string;
    entity: string;
    type: EntityType;
}
