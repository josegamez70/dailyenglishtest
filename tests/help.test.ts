import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEuro, PUBLIC_PLANS, VAT_PERCENT } from '../billingPlans.ts';
import { PILOT_DAYS, PILOT_SEATS } from '../pilotAccess.ts';
import {
  HELP_CONTACT,
  HELP_FAQ,
  HELP_STEPS,
  helpPageFromPath,
  helpParts,
  helpPlainText,
  helpVisibleText,
} from '../helpContent.ts';

test('help path matches /help and ignores other routes', () => {
  assert.equal(helpPageFromPath('/help'), true);
  assert.equal(helpPageFromPath('/help/'), true);
  assert.equal(helpPageFromPath('/helper'), false);
  assert.equal(helpPageFromPath('/admin/pilots'), false);
  assert.equal(helpPageFromPath('/'), false);
});

test('how-to is a short numbered guide', () => {
  assert.ok(HELP_STEPS.length >= 3 && HELP_STEPS.length <= 5);
  assert.deepEqual(HELP_STEPS.map((step) => step.id), ['create', 'invite', 'join', 'progress', 'pdf']);
});

test('help text follows the live academy behaviour', () => {
  const text = helpVisibleText();
  assert.match(text, /My academy/);
  assert.match(text, /\/join\?code=/);
  assert.match(text, /Link copied\./);
  assert.match(text, /6 to 8 letters or numbers/);
  assert.match(text, /Join \{academy name\}\?/);
  assert.match(text, /labeled Student/);
  assert.match(text, /Download PDF/);
  assert.match(text, /My progress/);
  assert.match(text, /Saved lessons/);
  assert.match(text, /latest 5 lessons/);
  assert.match(text, /does not use a free lesson/);
  assert.match(text, /Reading, Listening, and Grammar/);
  assert.match(text, /Last 14 days/);
  assert.match(text, /Fill in the blanks/);
  assert.match(text, /Phrasal verbs/);
  assert.match(text, /Put in order/);
  assert.match(text, /B1, B2, and C1/);
  assert.match(text, /Beginner, Intermediate, or Advanced/);
  assert.match(text, new RegExp(`up to ${PILOT_SEATS} students`));
  assert.match(text, new RegExp(`for ${PILOT_DAYS} days`));
  assert.match(text, /\/pilot\?code=/);
  assert.match(text, /No card is taken/);
  assert.match(text, /does not start a payment/);
  assert.match(text, /Billing is not active/);
  assert.match(text, /does not charge you/);
  assert.match(text, /cannot see your saved lessons|cannot see their saved lessons|cannot see saved lessons/);
  assert.match(text, new RegExp(HELP_CONTACT.replace('.', '\\.')));
  assert.equal(text.includes('${'), false);
  const privacy = HELP_FAQ.find((item) => item.id === 'privacy');
  assert.ok(helpPlainText(JSON.stringify(privacy)).includes(HELP_CONTACT));
  assert.equal(text.includes('/admin/pilots'), false);
  assert.equal(text.toLowerCase().includes('pilot_admin'), false);
  assert.equal(text.includes('price_'), false);
  for (const plan of PUBLIC_PLANS) {
    assert.ok(text.includes(formatEuro(plan.amountCents)), plan.key);
  }
  assert.ok(text.includes(`${VAT_PERCENT}% VAT`));
});

test('link markup keeps the label and the address', () => {
  const raw = `Email [[${HELP_CONTACT}|mailto:${HELP_CONTACT}]].`;
  assert.equal(helpPlainText(raw), `Email ${HELP_CONTACT}.`);
  assert.deepEqual(helpParts(raw), [
    { kind: 'text', text: 'Email ' },
    { kind: 'link', label: HELP_CONTACT, href: `mailto:${HELP_CONTACT}` },
    { kind: 'text', text: '.' },
  ]);
});

test('every FAQ question is unique and has an answer', () => {
  const ids = HELP_FAQ.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of HELP_FAQ) {
    assert.ok(item.question.endsWith('?'));
    assert.ok(item.blocks.length > 0);
  }
});
