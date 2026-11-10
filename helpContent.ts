import { formatEuro, PUBLIC_PLANS, VAT_PERCENT } from './billingPlans.ts';
import { PILOT_DAYS, PILOT_SEATS } from './pilotAccess.ts';

export const HELP_PATH = '/help';
export const HELP_CONTACT = 'info@dailyenglishtest.es';

const LINK = /\[\[([^\]|]+)\|([^\]|]+)\]\]/g;

export type HelpBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] };

export type HelpStep = {
  id: string;
  title: string;
  body: string;
};

export type HelpFaq = {
  id: string;
  question: string;
  blocks: HelpBlock[];
};

export function helpPageFromPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === HELP_PATH;
}

/** Visible words, with link labels kept and addresses removed. */
export function helpPlainText(value: string): string {
  return value.replace(LINK, '$1');
}

export type HelpLinkPart = { kind: 'text'; text: string } | { kind: 'link'; label: string; href: string };

export function helpParts(value: string): HelpLinkPart[] {
  const parts: HelpLinkPart[] = [];
  let cursor = 0;
  for (const match of value.matchAll(LINK)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ kind: 'text', text: value.slice(cursor, index) });
    parts.push({ kind: 'link', label: match[1], href: match[2] });
    cursor = index + match[0].length;
  }
  if (cursor < value.length) parts.push({ kind: 'text', text: value.slice(cursor) });
  return parts;
}

function academyExamplePrices(): string {
  return PUBLIC_PLANS
    .filter((plan) => plan.seats != null)
    .map((plan) => `Up to ${plan.seats} students is ${formatEuro(plan.amountCents)} per month`)
    .join('. ');
}

const premium = PUBLIC_PLANS.find((plan) => plan.key === 'premium');
const premiumPrice = premium ? formatEuro(premium.amountCents) : '';

export const HELP_STEPS: readonly HelpStep[] = [
  {
    id: 'create',
    title: 'Create your academy',
    body: 'Open My academy in the menu. Enter a name and press Create academy. Only an academy account can create an academy. A private pilot invitation turns your account into one when you press Activate. Then you name the academy here.',
  },
  {
    id: 'invite',
    title: 'Copy the invite link',
    body: 'My academy shows the invite code in large letters, and the full link under the buttons. The link ends with /join?code= and the code. Press Copy. The page says “Link copied.” Send that link, or read out the code. The code is 6 to 8 letters or numbers. Press New code only when you want a new link. The old link then stops working.',
  },
  {
    id: 'join',
    title: 'The student signs in and joins',
    body: 'The student opens the link on the device they will use. The page says they have been invited to join an academy. They enter an email and open the sign-in link. There is no password. The site then asks “Join {academy name}?”. They press Join. A pill labeled Student appears with their name. Their lessons are covered by the academy.',
  },
  {
    id: 'progress',
    title: 'Open a student',
    body: 'My academy lists each student, how many tests they have done, and their average score. Three cards show students used of your seat limit, tests this week, and the academy average. Press a name to open Student detail.',
  },
  {
    id: 'pdf',
    title: 'Download the PDF',
    body: 'On Student detail, press Download PDF. The student can press the same button on My progress. Saved lessons keeps that person’s latest 5 lessons. Opening one does not use a free lesson. The academy cannot see saved lessons.',
  },
];

export const HELP_FAQ: readonly HelpFaq[] = [
  {
    id: 'invite-link',
    question: 'Where is the invite link, and how do I share it?',
    blocks: [
      {
        type: 'p',
        text: 'Sign in, then open My academy. If you have not created the academy yet, enter a name and press Create academy. After that, the page shows Invite code, a Copy button, a New code button, and the full link.',
      },
      {
        type: 'p',
        text: 'Copy places the join link on the clipboard. If the browser blocks it, the page says “Select the link and copy it.” The link is written out under the buttons, so you can select it. Share the link by the channel you already use with your students. The site does not email them.',
      },
      {
        type: 'p',
        text: 'A student can also type the code on Profile. It is 6 to 8 letters or numbers. New code replaces the code. Share the new link. The previous link no longer matches an academy.',
      },
    ],
  },
  {
    id: 'student-joins',
    question: 'What does the student see, and how do they join?',
    blocks: [
      {
        type: 'p',
        text: 'On the invite link, before sign-in, they see: “You have been invited to join an academy. Sign in or create an account to join.” The code is saved on that device. They should open the sign-in email on the same device.',
      },
      {
        type: 'p',
        text: 'Sign-in is an email link. There is no password. The form says “We\'ll email you a sign-in link.” After they open it, the page is titled Join an academy and asks “Join {academy name}?”. They press Join, or Not now.',
      },
      {
        type: 'p',
        text: 'If they are already signed in, the invite link opens Join an academy straight away. They can also paste the code into Invite code on Profile and press Join.',
      },
      {
        type: 'p',
        text: 'After they join, the menu and the top of the screen show a pill labeled Student, with their name. The owner still has My academy. The student does not. On Profile they see the academy name and a Leave button. The plans text says the academy covers their lessons, so they do not take out a personal subscription.',
      },
      {
        type: 'p',
        text: 'If joining does not work, the page shows one of these messages:',
      },
      {
        type: 'ul',
        items: [
          'That code does not match an academy.',
          'This academy is full.',
          'This academy is not accepting students right now.',
          'You already belong to an academy.',
        ],
      },
    ],
  },
  {
    id: 'seats',
    question: 'How many students can join?',
    blocks: [
      {
        type: 'p',
        text: `My academy shows a Students card with how many people have joined, of the seats for that academy. A pilot academy has ${PILOT_SEATS} seats. If the site owner set the academy up by hand, the same card shows that academy’s own limit.`,
      },
      {
        type: 'p',
        text: `The example plans on the site are one monthly price for the whole academy, not a price per student. ${academyExamplePrices()}. Students are not charged.`,
      },
      {
        type: 'p',
        text: 'When every seat is taken, the next person sees “This academy is full.” When a pilot has ended, or the academy plan is off, they see “This academy is not accepting students right now.” Names and results that are already stored stay on the list.',
      },
    ],
  },
  {
    id: 'progress',
    question: 'How do I check a student’s progress?',
    blocks: [
      {
        type: 'p',
        text: 'On My academy, each student row shows their name, the number of tests, and the average score. The average is the percentage of correct answers across their tests. Under that, the row shows the date and score of the last test.',
      },
      {
        type: 'p',
        text: 'Three cards sit above the list. Students is how many have joined of your seat limit. Tests this week counts tests since Monday in your local time, across the academy. Academy average is the average score of every test in the academy.',
      },
      {
        type: 'p',
        text: 'Press a student to open Student detail. At the top are three averages: Reading, Listening, and Grammar. Under them, tabs with the same names switch a level list. A level is listed only when that student has a test at that level. Each row shows the average and the number of tests.',
      },
      {
        type: 'p',
        text: 'Grammar tests use the levels B1, B2, and C1. Reading and listening tests are saved as Beginner, Intermediate, or Advanced, so those names appear in the list instead. If a skill has no tests, the page says “No tests for this skill.”',
      },
      {
        type: 'p',
        text: 'Last 14 days is a chart of the average score on each day. If there were no scored tests, it says “No tests in the last 14 days.” Recent tests lists the latest four. View all shows the rest. Open a row to see wrong answers. The student’s answer is labeled “Their answer”.',
      },
      {
        type: 'p',
        text: 'Remove student is at the bottom of Student detail. The page asks you to confirm before it removes them.',
      },
    ],
  },
  {
    id: 'pdf',
    question: 'How do I download the progress PDF?',
    blocks: [
      {
        type: 'p',
        text: 'On Student detail, press Download PDF. That file is for the student you have open. The student can press Download PDF on their own My progress page. The same button is not on the academy list. Open the student first.',
      },
      {
        type: 'p',
        text: 'While the file is being made, the button says “Preparing PDF...”. The PDF is one page. It shows the student name, Reading, Listening, and Grammar averages, the level rows, a Last 14 days chart, and recent tests. If it cannot be made, the page says “Could not create the PDF. Try again.”',
      },
      {
        type: 'p',
        text: 'My progress, for the signed-in person, also shows Tests done, Average score, Day streak, Best score, and a chart of the last 10 scores.',
      },
    ],
  },
  {
    id: 'saved',
    question: 'What are Saved lessons?',
    blocks: [
      {
        type: 'p',
        text: 'Saved lessons is in the menu. It keeps the latest 5 lessons for the signed-in person. Press Open to read or hear one again. Opening a saved lesson does not use a free lesson.',
      },
      {
        type: 'p',
        text: 'An academy can see a student’s name, email, and test results. It cannot see their saved lessons. Saved lessons and progress stay after a pilot ends. They are not deleted.',
      },
    ],
  },
  {
    id: 'practice',
    question: 'What can students practice?',
    blocks: [
      {
        type: 'p',
        text: 'Reading / Listening is the home practice. Choose Reading or Listening, then Text (“A story or monologue”) or Dialogue (“Two speakers”). Then choose a difficulty, a topic, a length, and how many questions, and press Start Learning.',
      },
      {
        type: 'ul',
        items: [
          'Difficulty for reading and listening: Beginner, Intermediate, or Advanced.',
          'A profile level of A1 or A2 starts on Beginner. B1 or B2 starts on Intermediate. C1 or C2 starts on Advanced.',
          'Story length: 60, 100, or 140 words. Questions: 5, 8, or 10.',
          'Topics include Daily Life, School / College, Travel, and Any topic, which picks one at random.',
          'Listening plays the lesson. On a finished test it is tagged Audio. Tap a word in a text to see a meaning.',
        ],
      },
      {
        type: 'p',
        text: 'Grammar is a separate page in the menu. The levels are B1, B2, and C1. The exercises are Fill in the blanks, Phrasal verbs, and Put in order.',
      },
      {
        type: 'p',
        text: 'Each account can create 3 free lessons. They do not expire. They are not a free trial, and you do not enter a card to get them. An active academy covers new lessons for the owner and for students who have joined. When a pilot ends, new lessons stop, and those 3 free lessons do not start again.',
      },
    ],
  },
  {
    id: 'pilot',
    question: 'What is the academy pilot?',
    blocks: [
      {
        type: 'p',
        text: `A pilot is a private invitation for one academy. The link looks like /pilot?code= followed by a code. It is not in the public menu. To ask for one, email [[${HELP_CONTACT}|mailto:${HELP_CONTACT}]].`,
      },
      {
        type: 'p',
        text: `One invitation starts one academy for up to ${PILOT_SEATS} students, for ${PILOT_DAYS} days from the moment the owner presses Activate. The ${PILOT_DAYS} days do not start when the invitation is written. No card is taken, and the page does not start a payment.`,
      },
      {
        type: 'p',
        text: 'The owner opens the link, signs in with the usual email link, and presses Activate academy. The code stays on that device and in the sign-in link. They then open My academy, name it, and invite students the usual way. Students who join are covered until the same end time.',
      },
      {
        type: 'p',
        text: 'Pressing Activate again with the same account does not add more days. A second account cannot use the same code. One account cannot take a second pilot.',
      },
      {
        type: 'p',
        text: `When the ${PILOT_DAYS} days end, new lessons stop for the owner and for the students. Saved lessons and progress stay. The 3 free lessons do not start again. New students cannot join. The owner can email [[${HELP_CONTACT}|mailto:${HELP_CONTACT}]] or look at the example plans.`,
      },
    ],
  },
  {
    id: 'plans',
    question: 'What do the plans cost? Are payments on?',
    blocks: [
      {
        type: 'p',
        text: 'Billing is not active. Paid plans are not on sale yet. The Plans section is an example. Choosing a plan does not charge you, and the site does not ask for a card. No payment is taken until billing is turned on.',
      },
      {
        type: 'p',
        text: `The example prices are in euro per month and include ${VAT_PERCENT}% VAT. VAT is not added on top. Premium is ${premiumPrice} per month for one learner, with unlimited lessons. Academy prices are a fixed monthly price, not a price per student. ${academyExamplePrices()}.`,
      },
      {
        type: 'p',
        text: 'The same prices are written in the [[Terms of Use|/terms]]. The home page and Profile show them with an Example label while billing is off. Students on an academy are not charged.',
      },
    ],
  },
  {
    id: 'privacy',
    question: 'Who can see a student’s results?',
    blocks: [
      {
        type: 'p',
        text: 'If you join an academy, that academy can see your name, your email, and your test results. On Student detail the owner can also open wrong answers. The academy cannot see your saved lessons.',
      },
      {
        type: 'p',
        text: 'You can leave the academy at any time from Profile. You must be at least 14 years old to use the site. Academies are responsible for consent for students under 14.',
      },
      {
        type: 'p',
        text: `The full notice is the [[Privacy Policy|/privacy]]. To ask about your data, email [[${HELP_CONTACT}|mailto:${HELP_CONTACT}]].`,
      },
    ],
  },
  {
    id: 'contact',
    question: 'How do I contact you?',
    blocks: [
      {
        type: 'p',
        text: `Email [[${HELP_CONTACT}|mailto:${HELP_CONTACT}]]. Use that address to ask for a pilot invitation, to ask about an academy, or to use the rights in the Privacy Policy.`,
      },
      {
        type: 'p',
        text: 'Who runs the site is on the [[Legal Notice|/legal]].',
      },
    ],
  },
];

export function helpVisibleText(): string {
  const chunks = [
    ...HELP_STEPS.map((step) => `${step.title} ${step.body}`),
    ...HELP_FAQ.flatMap((item) => [
      item.question,
      ...item.blocks.flatMap((block) => (block.type === 'p' ? [block.text] : block.items)),
    ]),
  ];
  return chunks.map((chunk) => helpPlainText(chunk)).join('\n');
}
