import React, { useEffect } from 'react';
import {
  HELP_CONTACT,
  HELP_FAQ,
  HELP_STEPS,
  helpParts,
  type HelpBlock,
} from '../helpContent';
import { SiteFooter } from './LegalPages';

function HelpText({ value }: { value: string }) {
  return (
    <>
      {helpParts(value).map((part, index) => (
        part.kind === 'link'
          ? (
            <a key={`${part.href}-${index}`} className="underline" href={part.href}>
              {part.label}
            </a>
          )
          : <span key={index}>{part.text}</span>
      ))}
    </>
  );
}

function Blocks({ blocks }: { blocks: readonly HelpBlock[] }) {
  return (
    <div className="space-y-3 text-base leading-relaxed text-slate-700 dark:text-slate-200">
      {blocks.map((block, index) => (
        block.type === 'ul' ? (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {block.items.map((item) => <li key={item}><HelpText value={item} /></li>)}
          </ul>
        ) : (
          <p key={index}><HelpText value={block.text} /></p>
        )
      ))}
    </div>
  );
}

function StepIcon({ id }: { id: string }) {
  const common = { viewBox: '0 0 24 24', className: 'h-7 w-7', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, 'aria-hidden': true } as const;
  if (id === 'create') {
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 20.5V9.2L12 4l8 5.2v11.3" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 20.5v-6h6v6" />
      </svg>
    );
  }
  if (id === 'invite') {
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.5h6M10 8.5H8.5A3.5 3.5 0 0 0 8.5 15.5H10M14 8.5h1.5a3.5 3.5 0 0 1 0 7H14" />
      </svg>
    );
  }
  if (id === 'join') {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="2.4" />
        <path strokeLinecap="round" d="M4.5 18.5v-.3c0-2.2 2-3.7 4.5-3.7s4.5 1.5 4.5 3.7v.3" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 8.5v6M14 11.5h6" />
      </svg>
    );
  }
  if (id === 'progress') {
    return (
      <svg {...common}>
        <path strokeLinecap="round" d="M4 19h16" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V11M12 16V7M17 16v-4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3.5h7.2L19 8.2V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path strokeLinecap="round" d="M14 3.5V8h4.8M8.5 13h7M8.5 16.5h4" />
    </svg>
  );
}

export function AcademyHelpLink({ className = 'mt-3 text-base' }: { className?: string }) {
  return (
    <p className={className}>
      <a href="/help" className="font-semibold text-blue-800 underline dark:text-blue-300">
        How it works
      </a>
    </p>
  );
}

export function HelpPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'How it works – Daily English Test';
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#e7eef6] px-4 pb-4 pt-6 text-[#172033] dark:bg-[#172033] dark:text-slate-100 sm:px-6">
      <header className="mx-auto mb-6 w-full max-w-3xl">
        <a href="/" className="text-2xl font-fun leading-tight sm:text-3xl">
          <span className="text-blue-800 dark:text-blue-300">Your daily </span>
          <span className="text-red-700 dark:text-red-400">English Test!</span>
        </a>
      </header>
      <main className="mx-auto w-full max-w-3xl">
        <p className="text-sm font-bold uppercase tracking-wide text-blue-800 dark:text-blue-300">For academies</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">How it works</h1>
        <p className="mt-3 text-base leading-relaxed text-slate-700 dark:text-slate-200">
          A short guide for an academy owner and their students. It describes only what the site does today.
        </p>

        <ol className="mt-6 space-y-4" aria-label="Steps">
          {HELP_STEPS.map((step, index) => (
            <li key={step.id} className="rounded-2xl border border-slate-300 bg-white p-5 dark:border-slate-600 dark:bg-[#22304a] sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-700 text-base font-bold text-white">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-bold">{step.title}</h2>
                    <span className="text-blue-700 dark:text-blue-300"><StepIcon id={step.id} /></span>
                  </div>
                  <p className="mt-2 text-base leading-relaxed text-slate-700 dark:text-slate-200">
                    <HelpText value={step.body} />
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <h2 id="questions" className="mt-10 text-2xl font-bold">Questions</h2>
        <div className="mt-4 space-y-3">
          {HELP_FAQ.map((item) => (
            <details
              key={item.id}
              id={item.id}
              className="group scroll-mt-4 rounded-2xl border border-slate-300 bg-white open:border-blue-700 dark:border-slate-600 dark:bg-[#22304a] dark:open:border-blue-300"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-base font-semibold [&::-webkit-details-marker]:hidden">
                <span>{item.question}</span>
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-blue-800 transition group-open:rotate-45 dark:text-blue-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                </svg>
              </summary>
              <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-600">
                <Blocks blocks={item.blocks} />
              </div>
            </details>
          ))}
        </div>

        <p className="mt-8 text-base leading-relaxed">
          Still stuck? Email{' '}
          <a className="font-semibold underline" href={`mailto:${HELP_CONTACT}`}>{HELP_CONTACT}</a>.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
