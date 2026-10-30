import React, { useState } from 'react';
import { sendMagicLink } from '../auth';

export function SignInBox({
  prompt,
  onClose,
}: {
  prompt?: boolean;
  onClose?: () => void;
}) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await sendMagicLink(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The email could not be sent. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mx-auto mb-4 w-full max-w-xl rounded-lg border border-slate-300 bg-white p-4 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
    >
      {prompt && <p className="mb-2 text-base font-semibold">Sign in free to get 3 free lessons.</p>}
      <p className="text-base">We'll email you a sign-in link. No password needed.</p>
      <label className="mt-3 block text-sm font-semibold" htmlFor="sign-in-email">
        Email
      </label>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <input
          id="sign-in-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg border border-slate-400 px-3 py-2 text-base text-slate-900 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-50"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 rounded-lg bg-blue-700 px-4 py-2 text-base font-bold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {busy ? 'Sending...' : 'Send link'}
        </button>
      </div>
      {sent && <p className="mt-3 text-base font-semibold">Check your email for your sign-in link.</p>}
      {error && <p className="mt-3 text-base text-red-800 dark:text-red-300">{error}</p>}
      <p className="mt-3 text-sm">
        By signing in you agree to our <a href="/terms" className="underline">Terms</a> and <a href="/privacy" className="underline">Privacy Policy</a>.
      </p>
      {onClose && (
        <button type="button" onClick={onClose} className="mt-3 text-sm font-semibold underline">
          Close
        </button>
      )}
    </form>
  );
}
