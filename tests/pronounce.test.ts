import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickPronunciationAudio, pronunciationLang, pronunciationVoice } from '../pronounce.ts';

test('dictionary audio prefers a UK recording and ignores empty files', () => {
  const uk = 'https://api.dictionaryapi.dev/media/pronunciations/en/strife-uk.mp3';
  const us = 'https://api.dictionaryapi.dev/media/pronunciations/en/strife-us.mp3';
  assert.equal(pickPronunciationAudio([
    { text: '/straɪf/', audio: '' },
    { audio: us },
    { audio: uk },
  ]), uk);
  assert.equal(pickPronunciationAudio([
    { audio: 'https://ssl.gstatic.com/dictionary/static/sounds/hello--_us_1.mp3' },
    { audio: 'https://ssl.gstatic.com/dictionary/static/sounds/hello--_gb_1.mp3' },
  ]), 'https://ssl.gstatic.com/dictionary/static/sounds/hello--_gb_1.mp3');
  assert.equal(pickPronunciationAudio([{ audio: us }]), us);
  assert.equal(pickPronunciationAudio([{ audio: '' }, { audio: 'http://example.com/a.mp3' }]), null);
});

test('speech falls back to en-GB unless the profile accent is American', () => {
  const voices = [
    { lang: 'en-US', name: 'US', voiceURI: 'us' },
    { lang: 'en-GB', name: 'UK', voiceURI: 'uk', default: true },
    { lang: 'es-ES', name: 'ES', voiceURI: 'es' },
  ];
  assert.equal(pronunciationLang('british'), 'en-GB');
  assert.equal(pronunciationLang('american'), 'en-US');
  assert.equal(pronunciationVoice(voices, 'british')?.voiceURI, 'uk');
  assert.equal(pronunciationVoice(voices, 'american')?.voiceURI, 'us');
  assert.equal(pronunciationVoice([{ lang: 'fr-FR', name: 'FR' }], 'british'), null);
});

test('the vocabulary list, flashcard, and lookup card can play a word', () => {
  const page = readFileSync(new URL('../components/VocabularyPage.tsx', import.meta.url), 'utf8');
  const button = readFileSync(new URL('../components/PronounceButton.tsx', import.meta.url), 'utf8');
  const lookup = readFileSync(new URL('../pronounce.ts', import.meta.url), 'utf8');
  assert.equal(page.split('<PronounceButton').length - 1, 3);
  assert.match(page, /role="button"/);
  assert.match(button, /aria-label="Play pronunciation"/);
  assert.match(button, /stopPropagation/);
  assert.match(lookup, /api\.dictionaryapi\.dev/);
  assert.equal(lookup.includes('azure'), false);
});
