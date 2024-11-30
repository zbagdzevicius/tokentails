import { IQuiz, IQuizQuestion, IQuizQuestionOption } from "@/models/quiz";
import classNames from "classnames";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

const QuizQuestionOption = ({
  option,
  isRightOption,
  isAnswered,
  onSelect,
}: IQuizQuestionOption & { isAnswered: boolean; onSelect: () => void }) => {
  return (
    <button
      onClick={() => (isAnswered ? {} : onSelect())}
      className={classNames(
        "rem:h-[40px] rounded-lg border border-primary-200",
        {
          "bg-red-600 text-primary-0":
            isAnswered && !isRightOption,
          "bg-accent-600 text-primary-0":
            isAnswered && isRightOption,
          "hover:bg-gray-200 hover:border-0":
            !isAnswered,
        }
      )}
    >
      {option}
    </button>
  );
};

const QuizQuestion = ({
  question,
  image,
  options,
  explanation,
  answer,
}: IQuizQuestion & { answer: (isAnswerRight: boolean) => void }) => {
  const [isAnswerRight, setIsAnswerRight] = useState<null | boolean>(null);
  useEffect(() => {
    setIsAnswerRight(null);
  }, [question, options]);

  return (
    <div>
      <Image
        priority
        alt={question}
        src={image.url}
        className="object-cover h-full w-full overflow-hidden mb-4 md:mb-6"
        height={350}
        width={720}
      />
      <h2
        className="word-break text-p1 font-bold capitalize mb-4 px-4"
        dangerouslySetInnerHTML={{ __html: question }}
      ></h2>
      <div className="flex flex-col gap-1 px-4">
        {options.map((option) => (
          <QuizQuestionOption
            key={option.option}
            {...option}
            isAnswered={isAnswerRight !== null}
            onSelect={() => setIsAnswerRight(option.isRightOption)}
          />
        ))}
      </div>
      {isAnswerRight !== null && (
        <div className="mt-2 px-4">
          <div className="flex justify-between gap-4">
            <div
              className={`flex items-center gap-2  ${
                isAnswerRight
                  ? "text-accent-800"
                  : "text-red-700"
              }`}
            >
              <i
                className={`bx bx-${
                  isAnswerRight ? "happy-beaming" : "upside-down"
                } text-p1 md:text-h4`}
              ></i>{" "}
              <div className="md:text-h6">
                {isAnswerRight ? "Teisingai" : "Neteisingai"}
              </div>
            </div>
            <button onClick={() => answer(isAnswerRight)}>
              <div className="">Kitas</div>
            </button>
          </div>
          {explanation && <div className="mt-2">{explanation}</div>}
        </div>
      )}
    </div>
  );
};

interface IProps extends IQuiz {
  questionIndex: number | null;
  setQuestionIndex: (index: number | null) => void;
  question: IQuizQuestion | null;
}

export const Quiz = ({
  title,
  image,
  questions,
  question,
  setQuestionIndex,
  questionIndex,
}: IProps) => {
  const [answeredQuestions, setAnsweredQuestions] = useState<boolean[]>([]);
  const correctAnswers = useMemo(
    () => answeredQuestions.filter((answer) => !!answer)?.length,
    [answeredQuestions]
  );
  const progress = useMemo(
    () => `${Math.floor(((questionIndex || 0) / questions.length) * 100)}%`,
    [questionIndex, questions]
  );
  const onAnswer = useCallback(
    (isAnswerRight: boolean) => {
      setAnsweredQuestions([...answeredQuestions, isAnswerRight]);
      setQuestionIndex(questionIndex! + 1);
    },
    [questionIndex, setQuestionIndex, answeredQuestions, setAnsweredQuestions]
  );

  if (!question) {
    return (
      <div className="rem:h-[350px] relative flex">
        <Image
          loading="lazy"
          height={350}
          width={720}
          src={image.url}
          className=" object-cover z-0 rem:h-[350px]"
          alt={image?.caption || title}
        />

        <div className="absolute bottom-0 left-0 right-0 p-6 min-h-[6rem] xl:min-h-0 pt-12 flex items-center justify-end flex-col z-10 mt-40 bg-gradient-to-b from-transparent to-black h-full">
          {answeredQuestions?.length === questions.length ? (
            <div>
              <div className="text-white">
                Tavo rezultatas:
                <div className="text-h4 mb-2">
                  <span className="text-accent">{correctAnswers}</span> /{" "}
                  {questions?.length}
                </div>
              </div>
              <button
                onClick={() => {
                  setAnsweredQuestions([]);
                  setQuestionIndex(0);
                }}
              >
                <div className="text-p1">Bandyk dar kartą</div>
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setQuestionIndex(0);
              }}
            >
              <div className="text-p1">Spausk pradėti testą</div>
            </button>
          )}
          <h2
            className="word-break text-h5 text-white font-bold capitalize mt-2"
            dangerouslySetInnerHTML={{ __html: title }}
          ></h2>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="w-full bg-gray-200 h-2.5">
        <div className="bg-accent h-2.5" style={{ width: progress }}></div>
      </div>
      <QuizQuestion {...question} answer={onAnswer} />
      <div className="ml-4 mt-2 text-gray-500 mb-2">
        {questionIndex! + 1} / {questions.length}
      </div>
    </div>
  );
};
