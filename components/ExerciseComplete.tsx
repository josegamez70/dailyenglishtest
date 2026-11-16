import { useEffect, useState } from 'react';

function ScoreSegments({ score, total }: { score: number; total: number }) {
  const count = Math.max(0, total);
  const goal = Math.max(0, Math.min(score, count));
  const reduce = prefersReducedMotion();
  const [shown, setShown] = useState(reduce ? goal : 0);

  useEffect(() => {
    if (reduce || goal === 0) {
      setShown(goal);
      return undefined;
    }
    setShown(0);
    let next = 0;
    const id = window.setInterval(() => {
      next += 1;
      setShown(next);
      if (next >= goal) window.clearInterval(id);
    }, 70);
    return () => window.clearInterval(id);
  }, [goal, reduce]);

  if (count === 0) return null;
  return (
    <div className="phase2-segments" role="img" aria-label={`${score} of ${total}`}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className={index < shown ? 'phase2-seg on' : 'phase2-seg'} />
      ))}
    </div>
  );
}

export function ExerciseComplete({
  score,
  total,
  marks = null,
  onReview,
  onNew,
}: {
  score: number;
  total: number;
  /** When set, each answer gets a short tone before the finish tone. Null plays only the finish tone. */
  marks?: boolean[] | null;
  onReview: () => void;
  onNew: () => void;
}) {
  const retro = useRetroTheme();

  useEffect(() => playResultSounds(marks, retro), []);

  return (
    <div className="phase2-dialog" role="dialog" aria-modal="true" aria-labelledby="exercise-complete-title">
      <div className="phase2-dialog-card">
        <RetroWindow title="Exercise complete!">
          <h2 id="exercise-complete-title" className="phase2-heading">Exercise complete!</h2>
          <p className="phase2-score">{score} / {total}</p>
          <ScoreSegments score={score} total={total} />
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" onClick={onReview} className="rounded-lg bg-blue-700 px-4 py-3 text-lg font-bold text-white hover:bg-blue-800">
              Review answers
            </button>
            <button type="button" onClick={onNew} className="rounded-lg border-2 border-slate-900 bg-white px-4 py-3 text-lg font-bold text-slate-900 hover:bg-slate-100 dark:border-slate-100 dark:bg-slate-900 dark:text-slate-50">
              New exercise
            </button>
          </div>
        </RetroWindow>
      </div>
    </div>
  );
}
