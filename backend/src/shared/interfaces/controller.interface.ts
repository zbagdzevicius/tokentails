import { SearchModel } from '../../common/validators';
import { RESPONSES } from '../constants/common';

export interface IController<T> {
    search: (params: SearchModel) => Promise<T[]>;
    findOne: (slug: string, ...args: any) => Promise<T> | any;
    create: (entity: T, ...args: any) => Promise<T>;
    update: (id: string, entity: T) => Promise<T>;
    delete: (slug: string) => Promise<typeof RESPONSES.success>;
}
