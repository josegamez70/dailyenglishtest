import React, { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { isEnUsLang, narrationVoice, type ListedVoice } from '../dialogue';
import { defineInContext } from '../contextDefine';
import { meaningToSave, normalizeLookupWord, popupPosition, searchLookupTerm, type DictEntry } from '../dictionary';
import {
  getVocabLessonContext,
  requestVocabSignIn,
  sentenceWith,
  subscribeVocabContext,
  termKey,
} from '../vocabulary';
import {
  getVocabularyState,
  removeVocabularyWord,
  saveVocabularyWord,
  savedTermSet,
  subscribeVocabulary,
} from '../vocabularyStore';
import { SenseText } from './SenseText';

type Anchor = { top: number; bottom: number; left: number; width: number; height: number };

type OpenWord = {
  id: number;
  surface: string;
  anchor: Anchor;
  sentence: string;
};

type PopupStatus = 'loading' | 'ready' | 'missing' | 'error';

let nextId = 1;
let openWord: OpenWord | null = null;
let listener: ((value: OpenWord | null) => void) | null = null;
let closeTimer = 0;
let suppressCloseUntil = 0;

function emit(value: OpenWord | null) {
  openWord = value;
  listener?.(value);
}

let phraseOpenedAt = 0;

export function openDictionaryLookup(surface: string, anchor: Anchor, sentence = '') {
  cancelClose();
  phraseOpenedAt = Date.now();
  suppressCloseUntil = Date.now() + 500;
  emit({ id: nextId++, surface, anchor, sentence });
}

function sentenceAround(element: HTMLElement, term: string): string {
  const block = element.closest('p, .lesson-copy, [data-transcript]')?.textContent
    || element.parentElement?.textContent
    || '';
  return sentenceWith(block, term) || block.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function scheduleClose() {
  window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => emit(null), 220);
}

function cancelClose() {
  window.clearTimeout(closeTimer);
}

function useFinePointer() {
  const [fine, setFine] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  });
  useEffect(() => {
    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setFine(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return fine;
}

function sayWord(word: string) {
  try {
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    const live = window.speechSynthesis.getVoices();
    const listed: ListedVoice[] = live.map((voice) => ({
      name: voice.name,
      lang: voice.lang,
      voiceURI: voice.voiceURI,
      default: voice.default,
    }));
    const choice = narrationVoice(listed);
    const match = (choice.voiceURI && live.find((voice) => voice.voiceURI === choice.voiceURI))
      || live.find((voice) => choice.name && voice.name === choice.name && isEnUsLang(voice.lang || ''));
    if (match && isEnUsLang(match.lang || '')) utterance.voice = match;
    window.speechSynthesis.speak(utterance);
  } catch {
    /* the story audio keeps playing */
  }
}

export function DictionaryPopup() {
  const [open, setOpen] = useState<OpenWord | null>(null);
  const [status, setStatus] = useState<PopupStatus>('loading');
  const [entry, setEntry] = useState<DictEntry | null>(null);
  const [position, setPosition] = useState({ top: 8, left: 8 });
  const [placed, setPlaced] = useState(false);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const lesson = useSyncExternalStore(subscribeVocabContext, getVocabLessonContext, getVocabLessonContext);
  const vocab = useSyncExternalStore(subscribeVocabulary, getVocabularyState, getVocabularyState);
  const headword = entry?.word || normalizeLookupWord(open?.surface ?? '') || open?.surface || '';
  const saved = savedTermSet(vocab.rows).has(termKey(headword));

  useEffect(() => {
    listener = setOpen;
    return () => {
      if (listener === setOpen) listener = null;
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setPlaced(false);
    setStatus('loading');
    setEntry(null);
    defineInContext(open.surface, open.sentence || sentenceWith(lesson?.story ?? '', open.surface))
      .then((result) => {
        if (cancelled) return;
        setEntry(result);
        setStatus(result ? 'ready' : 'missing');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    const onPointerDown = (event: PointerEvent) => {
      if (Date.now() < suppressCloseUntil) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (popupRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-lookup-word]')) return;
      emit(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') emit(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open?.id]);

  useLayoutEffect(() => {
    const node = popupRef.current;
    if (!open || !node) return;
    const rect = node.getBoundingClientRect();
    setPosition(popupPosition(open.anchor, { width: rect.width, height: rect.height }, {
      width: window.innerWidth,
      height: window.innerHeight,
    }, 8, 96));
    setPlaced(true);
  }, [open, status, entry, saved]);

  const toggleSaved = () => {
    if (!lesson?.signedIn) {
      requestVocabSignIn();
      return;
    }
    if (!headword || saving || status === 'loading') return;
    const meaning = entry ? meaningToSave(entry.senses) : '';
    const example = entry?.example || sentenceWith(lesson.story, headword);
    setSaving(true);
    const task = saved
      ? removeVocabularyWord(headword)
      : saveVocabularyWord({
        term: headword,
        meaning,
        example,
        sourceType: lesson.sourceType,
        lessonTitle: lesson.lessonTitle,
        topic: lesson.topic,
        level: lesson.level,
      });
    void task.finally(() => setSaving(false));
  };

  if (!open) return null;

  return createPortal(
    <div
      ref={popupRef}
      role="dialog"
      aria-label="Word definition"
      data-lookup-popup
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      className="fixed z-[70] w-[min(18rem,calc(100vw-1rem))] max-h-[min(70vh,calc(100vh-7rem))] overflow-y-auto rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 shadow-lg dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50"
      style={{ top: position.top, left: position.left, visibility: placed ? 'visible' : 'hidden' }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold break-words">{entry?.word ?? normalizeLookupWord(open.surface)}</p>
          {status === 'ready' && entry?.note && (
            <p className="text-sm text-slate-600 dark:text-slate-300">{entry.note}</p>
          )}
          {status === 'ready' && entry?.phonetic && (
            <p className="text-slate-600 dark:text-slate-300">{entry.phonetic}</p>
          )}
        </div>
        <button
          type="button"
          aria-label="Say this word"
          onClick={() => sayWord(entry?.word ?? open.surface)}
          className="shrink-0 rounded-md bg-blue-700 px-2 py-1 text-sm font-bold text-white hover:bg-blue-800"
        >
          Say
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={() => emit(null)}
          className="shrink-0 rounded-md px-2 py-1 text-base font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700"
        >
          X
        </button>
      </div>
      <button
        type="button"
        aria-pressed={saved}
        disabled={saving || status === 'loading'}
        onClick={toggleSaved}
        className={saved
          ? 'mt-3 w-full rounded-lg border-2 border-blue-800 bg-blue-700 py-2 text-base font-bold text-white'
          : 'mt-3 w-full rounded-lg border-2 border-slate-900 bg-white py-2 text-base font-bold text-slate-900 hover:bg-slate-100 dark:border-slate-100 dark:bg-slate-900 dark:text-slate-50'}
      >
        {lesson?.signedIn ? (saved ? 'Saved' : 'Save word') : 'Sign in to save'}
      </button>
      {status === 'loading' && <p className="mt-2">Looking up...</p>}
      {status === 'missing' && <p className="mt-2">No definition found.</p>}
      {status === 'error' && <p className="mt-2">Could not load the definition. Try again.</p>}
      {status === 'ready' && entry && (
        <div className="mt-2">
          <SenseText senses={entry.senses} />
          {entry.example && <p className="mt-2 text-slate-700 dark:text-slate-200">Example: {entry.example}</p>}
        </div>
      )}
    </div>,
    document.body
  );
}

function LookupWord({ surface, highlighted }: { surface: string; highlighted: boolean }) {
  const fine = useFinePointer();
  const hoverTimer = React.useRef(0);
  const openFrom = (element: HTMLElement) => {
    if (Date.now() - phraseOpenedAt < 500) return;
    if (openWord?.surface === surface && Date.now() < suppressCloseUntil) return;
    const rect = element.getBoundingClientRect();
    cancelClose();
    suppressCloseUntil = Date.now() + 400;
    emit({
      id: nextId++,
      surface,
      anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height },
      sentence: sentenceAround(element, surface),
    });
  };
  return (
    <span
      data-lookup-word
      role="button"
      tabIndex={0}
      className="cursor-pointer touch-manipulation rounded-sm underline decoration-dotted decoration-slate-400 underline-offset-2"
      style={highlighted ? {
        color: '#0f172a',
        fontWeight: 700,
        backgroundColor: '#fde68a',
        borderRadius: '0.25rem',
      } : undefined}
      onMouseEnter={fine ? (event) => {
        cancelClose();
        window.clearTimeout(hoverTimer.current);
        const element = event.currentTarget;
        hoverTimer.current = window.setTimeout(() => openFrom(element), 400);
      } : undefined}
      onMouseLeave={fine ? () => {
        window.clearTimeout(hoverTimer.current);
        scheduleClose();
      } : undefined}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openFrom(event.currentTarget);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openFrom(event.currentTarget);
        }
      }}
    >
      {surface}
    </span>
  );
}

export function DefinedText({
  text,
  className,
  highlightIndex = null,
  transcript,
}: {
  text: string;
  className?: string;
  highlightIndex?: number | null;
  transcript?: 'static' | 'synced';
}) {
  const tokens = text.split(/(\s+)/);
  let wordIndex = -1;
  const rootRef = React.useRef<HTMLSpanElement>(null);
  const takePhrase = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const raw = selection.toString().replace(/\s+/g, ' ').trim().replace(/[.,!?;:]+$/g, '');
    const term = searchLookupTerm(raw);
    if (!term || !term.includes(' ')) return;
    const range = selection.getRangeAt(0);
    const node = rootRef.current;
    if (!node || !node.contains(range.commonAncestorContainer)) return;
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    selection.removeAllRanges();
    openDictionaryLookup(term, { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height }, sentenceWith(node.textContent || '', term) || node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 240) || '');
  };
  return (
    <span ref={rootRef} className={className} data-transcript={transcript} onPointerUp={takePhrase}>
      {tokens.map((token, index) => {
        if (!token) return null;
        if (/^\s+$/.test(token)) return <span key={index}>{token}</span>;
        wordIndex += 1;
        const current = wordIndex;
        return <LookupWord key={index} surface={token} highlighted={highlightIndex === current} />;
      })}
    </span>
  );
}
