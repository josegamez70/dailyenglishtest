import React from 'react';

export type LegalPageId = 'legal' | 'privacy' | 'terms';

const UPDATED = '30 October 2026';

export function legalPageFromPath(pathname: string): LegalPageId | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/legal') return 'legal';
  if (path === '/privacy') return 'privacy';
  if (path === '/terms') return 'terms';
  return null;
}

export function SiteFooter() {
  return (
    <footer className="mt-auto w-full border-t border-slate-300 px-4 py-6 text-center text-sm text-slate-700 dark:border-slate-600 dark:text-slate-300">
      <nav className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1" aria-label="Legal">
        <a href="/legal" className="underline">Legal Notice</a>
        <span aria-hidden="true">·</span>
        <a href="/privacy" className="underline">Privacy</a>
        <span aria-hidden="true">·</span>
        <a href="/terms" className="underline">Terms</a>
      </nav>
      <p className="mt-2">© 2026 Daily English Test</p>
    </footer>
  );
}

function PageShell({ title, updated = UPDATED, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-50 flex flex-col px-4 pt-6 pb-4 sm:px-6">
      <header className="mx-auto mb-6 w-full max-w-3xl">
        <a href="/" className="text-2xl font-fun leading-tight sm:text-3xl">
          <span className="text-blue-800 dark:text-blue-300">Your daily </span>
          <span className="text-red-700 dark:text-red-400">English Test!</span>
        </a>
      </header>
      <article className="mx-auto w-full max-w-3xl text-base leading-relaxed">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Last updated: {updated}</p>
        <div className="mt-6 space-y-6">{children}</div>
      </article>
      <SiteFooter />
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold">{heading}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

function LegalNotice() {
  return (
    <PageShell title="Legal Notice">
      <p>
        This page tells you who runs Daily English Test and the basic rules for this website. It is written in simple English so learners can read it.
      </p>
      <Section heading="Who runs this site">
        <p>
          Daily English Test is run by José María Gámez, a private individual. He is not a company. He is not yet registered as self-employed (autónomo) in Spain.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Name: José María Gámez</li>
          <li>Tax number (NIF): 53681665X</li>
          <li>Place: Alhaurín de la Torre (Málaga), Spain</li>
          <li>Email: <a className="underline" href="mailto:josegamez70@hotmail.com">josegamez70@hotmail.com</a></li>
        </ul>
      </Section>
      <Section heading="What this site is for">
        <p>
          The site helps people practise reading and listening in English. You can read or hear a short story and then answer questions. An AI service writes the stories and the questions.
        </p>
      </Section>
      <Section heading="Intellectual property">
        <p>
          The site name, design, and the text of these pages belong to José María Gámez, unless another credit is shown. You may use the lessons for your own study. Please do not copy the site or sell the lessons.
        </p>
        <p>
          Stories and quizzes are made for practice. They are not official exam papers.
        </p>
      </Section>
      <Section heading="Liability">
        <p>
          Lessons are created automatically. They may contain mistakes in facts, grammar, or answers. Do not use them as professional, medical, legal, or financial advice. José María Gámez is not responsible for choices you make because of a lesson, or for problems caused by your connection or by the companies that help run the site, except where Spanish law says otherwise.
        </p>
      </Section>
      <Section heading="Law">
        <p>
          This notice follows Spanish law, including the Information Society Services Act (LSSI-CE). Privacy is explained in the <a className="underline" href="/privacy">Privacy Policy</a>. If there is a dispute, the courts of Málaga, Spain, will decide it, unless a consumer law lets you use the courts where you live.
        </p>
      </Section>
    </PageShell>
  );
}

function PrivacyPolicy() {
  return (
    <PageShell title="Privacy Policy" updated="31 October 2026">
      <p>
        This page explains what personal data Daily English Test uses, why, and what you can ask us to do. It is written in simple English.
      </p>
      <Section heading="Who is responsible">
        <p>The data controller is José María Gámez, a private individual (not a company, and not yet registered as self-employed).</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>NIF: 53681665X</li>
          <li>Place: Alhaurín de la Torre (Málaga), Spain</li>
          <li>Email: <a className="underline" href="mailto:josegamez70@hotmail.com">josegamez70@hotmail.com</a></li>
        </ul>
      </Section>
      <Section heading="What we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your email address, so we can send you a sign-in link.</li>
          <li>Your account plan and how many lessons you have used.</li>
          <li>The lesson settings and text you send so we can create a lesson (level, topic, length, and the story text when we write the quiz).</li>
          <li>Words you tap, which are sent to a dictionary service to show a meaning.</li>
        </ul>
        <p>We do not ask for your name, address, or payment details.</p>
      </Section>
      <Section heading="Why we use it">
        <p>
          We use this data to give you the service you asked for: sign-in, lessons, and word meanings. The legal basis is a contract (Article 6(1)(b) of the GDPR). We need the data to provide the account and the lessons.
        </p>
      </Section>
      <Section heading="Who else receives data">
        <ul className="list-disc space-y-1 pl-5">
          <li>Supabase: sign-in and the account database. The project is in the EU/UK region.</li>
          <li>Resend: sends the sign-in emails.</li>
          <li>Netlify: hosts the website.</li>
          <li>Google Gemini API: writes the lessons. We send lesson settings and story text. We do not send your email or other personal data to Gemini.</li>
          <li>Free Dictionary API and Wiktionary: look up words you tap.</li>
          <li>Cloudflare Web Analytics: anonymous visit counts, with no cookies. It is used only if it is turned on.</li>
        </ul>
        <p>
          Some of these companies may be outside the EU. When that happens, the transfer is covered by an adequacy decision or by standard contractual clauses.
        </p>
      </Section>
      <Section heading="How long we keep it">
        <p>
          We keep your account data while your account exists. You can ask us to delete it by email. We will delete it unless the law says we must keep it.
        </p>
      </Section>
      <Section heading="Your rights">
        <p>You can ask to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>see your data (access)</li>
          <li>correct it (rectification)</li>
          <li>delete it (erasure)</li>
          <li>object to how we use it</li>
          <li>limit how we use it (restriction)</li>
          <li>receive a copy (portability)</li>
        </ul>
        <p>
          Email <a className="underline" href="mailto:josegamez70@hotmail.com">josegamez70@hotmail.com</a>. You can also complain to the Spanish Data Protection Agency (AEPD) at <a className="underline" href="https://www.aepd.es/">aepd.es</a>.
        </p>
      </Section>
      <Section heading="Cookies and local storage">
        <p>
          We do not use advertising cookies or tracking cookies. Cloudflare Web Analytics, when it is on, does not use cookies. Your browser stores the sign-in session on your device. That storage is strictly necessary to keep you signed in. Because of this, we do not show a cookie banner.
        </p>
      </Section>
      <Section heading="Academies">
        <p>
          If you join an academy, that academy can see your name, your email, and your test results. It cannot see your saved lessons. You can leave the academy at any time from Profile. Academies are responsible for consent for students under 14.
        </p>
      </Section>
      <Section heading="Age">
        <p>You must be at least 14 years old to use this site.</p>
      </Section>
    </PageShell>
  );
}

function TermsOfUse() {
  return (
    <PageShell title="Terms of Use">
      <p>
        These terms are the rules for using Daily English Test. They are written in simple English. If you use the site, you agree to them.
      </p>
      <Section heading="Sign-in">
        <p>
          You sign in with an email link. There is no password. Keep the link private. The link signs you in to your account.
        </p>
      </Section>
      <Section heading="Free lessons">
        <p>
          Each account can create 3 free lessons. After that, you cannot create more free lessons until a paid plan exists.
        </p>
      </Section>
      <Section heading="Premium plan">
        <p>
          A premium plan is coming soon. The planned price is 5 € per month. These terms will be updated before any payment is taken. You will not be charged unless you choose to pay later.
        </p>
      </Section>
      <Section heading="Fair use">
        <p>
          Use the site yourself, for learning. Do not abuse it. Do not use bots or other automated tools to create many lessons, attack the site, or copy it in bulk.
        </p>
      </Section>
      <Section heading="AI lessons">
        <p>
          Stories, questions, and word help are provided as they are, for practice only. They may be wrong. They are not an official exam and not professional advice.
        </p>
      </Section>
      <Section heading="Changes and stopping the service">
        <p>
          José María Gámez may change these terms, change the site, or stop the service. If the terms change in an important way, the date at the top of this page will change.
        </p>
      </Section>
      <Section heading="Law">
        <p>
          Spanish law applies. If there is a dispute, the courts of Málaga, Spain, will decide it, unless a consumer law lets you use the courts where you live.
        </p>
      </Section>
    </PageShell>
  );
}

export function LegalDocument({ page }: { page: LegalPageId }) {
  if (page === 'privacy') return <PrivacyPolicy />;
  if (page === 'terms') return <TermsOfUse />;
  return <LegalNotice />;
}
