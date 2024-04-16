import { ICategory } from './category';
import { IComment } from './comment';
import { IImage } from './image';
import { EntityType } from './save';

export interface IQuizQuestionOption {
    option: string;
    isRightOption: boolean;
}

export interface IQuizQuestion {
    question: string;
    image: IImage;
    options: IQuizQuestionOption[];
    explanation?: string;
}

export interface IQuiz {
    _id: string;
    title: string;
    slug: string;
    description: string;
    image: IImage;
    createdAt: string;
    category: ICategory;
    questions: IQuizQuestion[];
    type: EntityType.QUIZ;
    comments: IComment[];
}
