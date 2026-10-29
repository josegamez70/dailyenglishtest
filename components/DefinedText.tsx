import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { defineWord, normalizeLookupWord, popupPosition, type DictEntry } from '../dictionary';

type Anchor = { top: number; bottom: number; left: number; width: number; height: number };

type OpenWord = {
  id: number;
  surface: string;
  anchor: Anchor;
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
    defineWord(open.surface)
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
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      cancelled = true;
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open?.id]);

  useLayoutEffect(() => {
    const node = popupRef.current;
    if (!open || !node) return;
    const rect = node.getBoundingClientRect();
    setPosition(popupPosition(open.anchor, { width: rect.width, height: rect.height }, {
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    setPlaced(true);
  }, [open, status, entry]);

  if (!open) return null;

  return createPortal(
    <div
      ref={popupRef}
      role="dialog"
      aria-label="Word definition"
      data-lookup-popup
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      className="fixed z-[70] w-[min(18rem,calc(100vw-1rem))] max-h-[50vh] overflow-y-auto rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 shadow-lg dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50"
      style={{ top: position.top, left: position.left, visibility: placed ? 'visible' : 'hidden' }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold break-words">{entry?.word ?? normalizeLookupWord(open.surface)}</p>
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
      {status === 'loading' && <p className="mt-2">Looking up...</p>}
      {status === 'missing' && <p className="mt-2">No definition found.</p>}
      {status === 'error' && <p className="mt-2">Could not load the definition. Try again.</p>}
      {status === 'ready' && entry && (
        <div className="mt-2 space-y-2">
          {entry.senses.map((sense, index) => (
            <p key={`${sense.partOfSpeech}-${index}`}>
              <span className="font-semibold italic">{sense.partOfSpeech}. </span>
              {sense.definition}
            </p>
          ))}
          {entry.example && <p className="text-slate-700 dark:text-slate-200">Example: {entry.example}</p>}
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
    if (openWord?.surface === surface && Date.now() < suppressCloseUntil) return;
    const rect = element.getBoundingClientRect();
    cancelClose();
    suppressCloseUntil = Date.now() + 500;
    emit({
      id: nextId++,
      surface,
      anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height },
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
  return (
    <span className={className} data-transcript={transcript}>
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
