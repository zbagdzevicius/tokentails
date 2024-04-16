import { IQuiz as Props } from '@/models/quiz';
import { FeedCard } from './FeedCard';
import { Quiz } from '@/components/shared/Quiz';
import { useMemo, useState } from 'react';
import { EntityType } from '@/models/save';
import { EntityRouteOption } from '@/constants/api';

export const FeedQuiz = (quiz: Props) => {
    const [questionIndex, setQuestionIndex] = useState<null | number>(null);
    const question = useMemo(
        () => (questionIndex === null ? null : quiz.questions[questionIndex as number]),
        [questionIndex, quiz.questions],
    );
    const link = useMemo(() => EntityRouteOption.QUIZ.details([quiz.slug]), [quiz.slug]);

    return (
        <FeedCard
            entity={quiz._id}
            type={EntityType.QUIZ}
            description={quiz.description}
            author={quiz.category.name}
            authorLink={quiz.category.slug}
            date={quiz.createdAt}
            comments={quiz.comments}
            link={link}
        >
            <Quiz {...quiz} setQuestionIndex={setQuestionIndex} question={question} questionIndex={questionIndex} />
        </FeedCard>
    );
};
