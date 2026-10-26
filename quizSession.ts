export type QuizSession = {
  questionIndex: number;
  answers: string[];
  reviewOpen: boolean;
};

/** Opens or closes story review without moving the question or dropping answers. */
export function withStoryReview(session: QuizSession, reviewOpen: boolean): QuizSession {
  return {
    questionIndex: session.questionIndex,
    answers: session.answers.slice(),
    reviewOpen,
  };
}
