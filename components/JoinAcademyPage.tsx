import { useEffect, useState } from 'react';
import { lookupAcademyName } from '../academy';
import { BackButton } from './BackButton';

export function JoinAcademyPage({
  code,
  onNotNow,
}: {
  code: string;
  onJoined?: () => void;
  onNotNow: () => void;
}) {
  const [name, setName] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let ignore = false;
    lookupAcademyName(code).then((result) => {
      if (ignore) return;
      setName(result.name);
      setMissing(result.missing);
      setReady(true);
    }).catch(() => {
      if (!ignore) setReady(true);
    });
    return () => { ignore = true; };
  }, [code]);

  return (
    <div className="mx-auto w-full max-w-xl">
      <BackButton onClick={onNotNow} />
      <h1 className="text-2xl font-bold">Join an academy</h1>
      {!ready && <p className="mt-3 text-base">Loading...</p>}
      {ready && missing && <p className="mt-3 text-base">Academy joining will work after the database update.</p>}
      {ready && !missing && !name && <p className="mt-3 text-base">That code does not match an academy.</p>}
      {ready && name && (
        <>
          <p className="mt-3 text-lg">Your account stays an individual learner. Progress, results, vocabulary, and badges stay on this account.</p>
          <p className="mt-2 text-base">{name} keeps its teacher panel. Academy owners sign in from the academy entrance.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/academy-sign-in" className="rounded-lg border-2 border-slate-900 px-4 py-3 text-base font-bold text-slate-900 dark:border-slate-100 dark:text-slate-50">Academy owners</a>
            <button type="button" onClick={onNotNow} className="rounded-lg bg-blue-700 px-4 py-3 text-base font-bold text-white hover:bg-blue-800">
              Continue as a learner
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function AcademyContact() {
  return (
    <p className="text-center text-sm text-slate-700 dark:text-slate-300">
      Are you an academy? Contact us at <a className="underline" href="mailto:info@dailyenglishtest.es">info@dailyenglishtest.es</a>
    </p>
  );
}
