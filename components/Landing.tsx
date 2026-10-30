import React from 'react';
import { SignInBox } from './SignInBox';

const points = [
  {
    title: 'Stories at your level',
    text: 'Beginner, Intermediate, and Advanced.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Z" />
        <path strokeLinecap="round" d="M8 8h8M8 12h8" />
      </svg>
    ),
  },
  {
    title: 'Listen with two natural voices',
    text: 'Hear the lesson read aloud.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 10v4a2 2 0 0 0 2 2h1l4 3V5L7 8H6a2 2 0 0 0-2 2Z" />
        <path strokeLinecap="round" d="M16 9a4 4 0 0 1 0 6M18.5 7a7 7 0 0 1 0 10" />
      </svg>
    ),
  },
  {
    title: 'Tap any word',
    text: 'See its meaning.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V6.5a1.5 1.5 0 0 1 3 0V11" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 10.5V5.5a1.5 1.5 0 0 1 3 0V11" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 11V7.5a1.5 1.5 0 0 1 3 0V13c0 3.5-2 6.5-6 6.5-3.2 0-5-2-5.5-4L4 13.2a1.4 1.4 0 0 1 2.2-1.6L8 13" />
      </svg>
    ),
  },
];

export function Landing() {
  return (
    <main className="w-full max-w-3xl">
      <section className="px-1 pt-2 text-center sm:pt-6">
        <h1 className="text-4xl font-fun leading-tight text-blue-800 dark:text-blue-300 sm:text-5xl">
          Daily English Test
        </h1>
        <p className="mx-auto mt-3 max-w-md text-lg leading-snug text-slate-800 dark:text-slate-100">
          Practice English reading and listening with AI lessons, every day.
        </p>
      </section>

      <ul className="mt-8 grid gap-3 sm:grid-cols-3">
        {points.map((point) => (
          <li
            key={point.title}
            className="rounded-xl border border-slate-300 bg-white p-4 text-left dark:border-slate-600 dark:bg-slate-800"
          >
            <div className="text-blue-800 dark:text-blue-300">{point.icon}</div>
            <p className="mt-3 text-base font-bold text-slate-900 dark:text-slate-50">{point.title}</p>
            <p className="mt-1 text-base text-slate-700 dark:text-slate-200">{point.text}</p>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <SignInBox submitLabel="Get 3 free lessons" />
        <p className="text-center text-sm text-slate-700 dark:text-slate-300">
          Premium: 5 € per month, coming soon.
        </p>
      </div>
    </main>
  );
}

export function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-blue-700 dark:border-slate-600 dark:border-t-blue-300" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function focusSignIn() {
  const form = document.getElementById('sign-in');
  form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => document.getElementById('sign-in-email')?.focus(), 350);
}
