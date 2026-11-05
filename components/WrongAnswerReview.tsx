import React from 'react';
import type { WrongAnswer } from '../studyStore';

/** The same wrong-answer list used on My progress. Teachers pass "Their answer". */
export function WrongAnswerReview({
  answers,
  answerLabel,
  heading,
}: {
  answers: WrongAnswer[];
  answerLabel: string;
  heading?: string;
}) {
  return (
    <div className="space-y-2 border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-600">
      {heading && <p className="font-semibold">{heading}</p>}
      {answers.length === 0 && <p>No wrong answers.</p>}
      {answers.map((item, index) => (
        <p key={`${item.question}-${index}`}>
          <span className="font-semibold">{item.question}</span>
          <br />
          {answerLabel}: {item.userAnswer || '—'}
          <br />
          Correct answer: {item.correctAnswer}
        </p>
      ))}
    </div>
  );
}
