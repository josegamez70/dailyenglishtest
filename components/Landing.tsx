import React from 'react';
import { PricingPanel } from './PricingPanel';
import { SignInBox } from './SignInBox';

const points = [
  {
    title: 'Listen. Learn. Improve.',
    text: 'Build your listening skills with natural-sounding audio for every lesson.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7 overflow-visible" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <g className="landing-phones">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 13.25v-1.5a8 8 0 0 1 16 0v1.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 19.25a1.75 1.75 0 0 0 1.75 1.75H6a1.75 1.75 0 0 0 1.75-1.75v-3.5A1.75 1.75 0 0 0 6 14H3.5A1.75 1.75 0 0 0 3 15.25v4Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 19.25a1.75 1.75 0 0 1-1.75 1.75H18a1.75 1.75 0 0 1-1.75-1.75v-3.5A1.75 1.75 0 0 1 18 14h2.5A1.75 1.75 0 0 1 21 15.25v4Z" />
          <path className="landing-wave landing-wave-a" strokeLinecap="round" d="M9.1 9.35a3.3 3.3 0 0 1 5.8 0" />
          <path className="landing-wave landing-wave-b" strokeLinecap="round" d="M7.7 7.55a5.4 5.4 0 0 1 8.6 0" />
        </g>
      </svg>
    ),
  },
  {
    title: 'Grammar Practice',
    text: 'Fill in the blanks, phrasal verbs and sentence order. Levels B1 to C1.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7 overflow-visible" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <g className="landing-grammar">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.2 4.8 19.2 9.8 8.2 20.8H3.2v-5L14.2 4.8Z" />
          <path strokeLinecap="round" d="M12.2 6.8 17.2 11.8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.2 20.8 5.4 18.6" />
        </g>
        <path className="landing-grammar-mark" strokeLinecap="round" strokeLinejoin="round" d="m9.1 13.1 1.3 1.3 2.7-2.9" />
      </svg>
    ),
  },
  {
    title: 'Test your reading comprehension',
    text: 'Read a short story made for your level, then answer the questions.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7 overflow-visible" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <g className="landing-book-left">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.04A8.97 8.97 0 0 0 6 3.75c-1.05 0-2.06.18-3 .51v14.25A8.99 8.99 0 0 1 6 18a8.97 8.97 0 0 1 6 2.29V6.04Z" />
          <path strokeLinecap="round" d="M6.2 8.2h3.1M6.2 11.1h3.1" />
        </g>
        <g className="landing-book-right">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.04A8.97 8.97 0 0 1 18 3.75c1.05 0 2.06.18 3 .51v14.25A8.99 8.99 0 0 0 18 18a8.97 8.97 0 0 0-6 2.29V6.04Z" />
          <path strokeLinecap="round" d="M14.7 8.2h3.1M14.7 11.1h3.1" />
        </g>
      </svg>
    ),
  },
  {
    title: 'Discover Words Instantly',
    text: 'Tap any word to discover its meaning as you read, with the popup dictionary.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7 overflow-visible" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <g className="landing-rays">
          <path strokeLinecap="round" d="M12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.59" />
        </g>
        <g className="landing-pointer">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672" />
        </g>
      </svg>
    ),
  },
];

const motionCss = `
.landing-book-left,
.landing-book-right,
.landing-phones,
.landing-pointer,
.landing-grammar {
  transform-box: fill-box;
}
.landing-book-left {
  transform-origin: right center;
  animation: landing-book-left 2.8s ease-in-out infinite;
}
.landing-book-right {
  transform-origin: left center;
  animation: landing-book-right 2.8s ease-in-out infinite;
}
.landing-phones {
  transform-origin: center;
  animation: landing-phones 2.6s ease-in-out 0.45s infinite;
}
.landing-wave {
  opacity: 0.9;
}
.landing-wave-a { animation: landing-wave 2.6s ease-in-out 0.45s infinite; }
.landing-wave-b { animation: landing-wave 2.6s ease-in-out 0.7s infinite; }
.landing-pointer {
  transform-origin: 20% 15%;
  animation: landing-pointer 2.4s ease-in-out 0.9s infinite;
}
.landing-rays {
  opacity: 0.85;
  animation: landing-rays 2.4s ease-in-out 0.9s infinite;
}
.landing-grammar {
  transform-origin: 70% 80%;
  animation: landing-grammar 2.7s ease-in-out 1.2s infinite;
}
.landing-grammar-mark {
  opacity: 0.85;
  animation: landing-grammar-mark 2.7s ease-in-out 1.2s infinite;
}
@keyframes landing-book-left {
  0%, 100% { transform: perspective(140px) rotateY(0deg); }
  50% { transform: perspective(140px) rotateY(14deg); }
}
@keyframes landing-book-right {
  0%, 100% { transform: perspective(140px) rotateY(0deg); }
  50% { transform: perspective(140px) rotateY(-14deg); }
}
@keyframes landing-phones {
  0%, 100% { transform: translateY(0) scale(1); }
  35% { transform: translateY(-2px) scale(1.045); }
  55% { transform: translateY(0) scale(1); }
  78% { transform: translateY(-1px) scale(1.02); }
}
@keyframes landing-wave {
  0%, 100% { opacity: 0.28; }
  50% { opacity: 1; }
}
@keyframes landing-pointer {
  0%, 100% { transform: translate(0, 0); }
  42% { transform: translate(1.5px, 2.5px); }
  58% { transform: translate(0, 0); }
}
@keyframes landing-rays {
  0%, 32% { opacity: 0.2; }
  48% { opacity: 1; }
  68%, 100% { opacity: 0.35; }
}
@keyframes landing-grammar {
  0%, 100% { transform: rotate(0deg); }
  45% { transform: rotate(-7deg); }
}
@keyframes landing-grammar-mark {
  0%, 35% { opacity: 0.2; }
  55% { opacity: 1; }
  80%, 100% { opacity: 0.35; }
}
@media (prefers-reduced-motion: reduce) {
  .landing-book-left,
  .landing-book-right,
  .landing-phones,
  .landing-wave,
  .landing-pointer,
  .landing-rays,
  .landing-grammar,
  .landing-grammar-mark {
    animation: none;
  }
}
`;

export function Landing() {
  return (
    <main className="w-full max-w-2xl md:max-w-3xl">
      <style>{motionCss}</style>
      <section className="px-1 pt-5 text-center sm:pt-8">
        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-[#172033] dark:text-white sm:text-5xl">
          Your English at your own pace.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-center text-base leading-relaxed text-slate-500 dark:text-slate-300 sm:text-lg">
          Improve your English every day with AI-powered stories, listening practice, grammar exercises, and lessons made just for you.
        </p>
      </section>

      <div className="mt-6 sm:mt-8">
        <SignInBox submitLabel="Get 3 free lessons" />
      </div>

      <ul className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
        {points.map((point) => (
          <li
            key={point.title}
            className="rounded-2xl border border-slate-300 bg-white p-6 text-left dark:border-slate-400/30 dark:bg-[#22304a] sm:p-7"
          >
            <div className="text-blue-700 dark:text-blue-300">{point.icon}</div>
            <h2 className="mt-3 text-lg font-bold text-[#172033] dark:text-white">{point.title}</h2>
            <p className="mt-1.5 text-base leading-relaxed text-slate-600 dark:text-slate-300">{point.text}</p>
          </li>
        ))}
      </ul>

      <PricingPanel signedIn={false} plan={null} academyRole={null} variant="landing" onSignIn={focusSignIn} />
      <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-300">
        Questions about an academy? Contact us at <a className="underline" href="mailto:info@dailyenglishtest.es">info@dailyenglishtest.es</a>
      </p>
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
