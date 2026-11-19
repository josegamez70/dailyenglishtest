import { formatDuration, presentChallenge, type ChallengeEntry } from '../dailyChallenge';
import { formatPercent } from '../scoreboard';

function medal(rank: number | null): string {
  if (rank === 1) return 'scoreboard-gold';
  if (rank === 2) return 'scoreboard-silver';
  if (rank === 3) return 'scoreboard-bronze';
  return '';
}

/** Today's challenge ranking. Same order as the scoreboard Challenge tab. */
export function ChallengeRankTable({
  rows,
  level,
  missing = false,
  heading = true,
}: {
  rows: readonly ChallengeEntry[];
  level: string;
  missing?: boolean;
  heading?: boolean;
}) {
  const challenge = presentChallenge(rows);
  return (
    <section className="mt-4" aria-label={`Today's ${level} challenge ranking`}>
      {heading && (
        <>
          <h2 className="text-lg font-bold">Today's ranking · {level}</h2>
          <p className="mt-1 text-sm">Ranked by percent. A shorter time breaks a tie.</p>
        </>
      )}
      {missing && (
        <p className="mt-3 border-2 border-slate-900 bg-amber-100 px-3 py-2 text-base text-slate-900" role="note">
          Today's challenge ranking will appear after the database update.
        </p>
      )}
      {!missing && challenge.top.length === 0 && (
        <p className="mt-2 text-base">No one has finished today's challenge at {level} yet.</p>
      )}
      {!missing && challenge.top.length > 0 && (
        <div className="scoreboard-scroll mt-2 overflow-x-auto">
          <table className="challenge-rank w-full border-collapse text-left">
            <caption className="sr-only">Today's challenge at {level}, ranked by combined percent, then by shorter time.</caption>
            <thead className="scoreboard-head">
              <tr>
                <th>#</th>
                <th>Student</th>
                <th>Correct</th>
                <th>%</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {challenge.top.map((row) => (
                <tr key={row.alias} className={`${medal(row.rank)} ${row.isSelf ? 'scoreboard-you' : ''} ${row.demo ? 'scoreboard-demo' : ''}`}>
                  <td className="font-bold">{row.rank}</td>
                  <td>
                    <span className="block font-semibold">{row.alias}</span>
                    {row.demo && <span className="block text-xs">Fictitious</span>}
                    {row.isSelf && <span className="block text-xs">Your row</span>}
                  </td>
                  <td>{row.correct}/{row.total}</td>
                  <td>{formatPercent(row.correct, row.total, true)}</td>
                  <td>{formatDuration(row.seconds)}</td>
                </tr>
              ))}
              {challenge.self && (
                <tr className={`scoreboard-you ${challenge.self.demo ? 'scoreboard-demo' : ''}`}>
                  <td className="font-bold">{challenge.self.rank}</td>
                  <td className="font-semibold">{challenge.self.alias}</td>
                  <td>{challenge.self.correct}/{challenge.self.total}</td>
                  <td>{formatPercent(challenge.self.correct, challenge.self.total, true)}</td>
                  <td>{formatDuration(challenge.self.seconds)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
