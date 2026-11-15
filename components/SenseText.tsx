import { useState } from 'react';
import type { DictSense } from '../dictionary';

function MoreButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className="mt-1 text-sm font-bold text-blue-800 underline dark:text-blue-200"
    >
      {open ? 'Less' : 'More'}
    </button>
  );
}

/** One sense, with the others behind More. */
export function SenseText({
  senses,
  note,
}: {
  senses: readonly DictSense[];
  note?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = senses;
  if (!first) return null;
  return (
    <div className="mt-2">
      {note ? <p className="text-sm text-slate-600 dark:text-slate-300">{note}</p> : null}
      <p>
        <span className="font-semibold italic">{first.partOfSpeech}. </span>
        {first.definition}
      </p>
      {open && rest.map((sense, index) => (
        <p key={`${sense.partOfSpeech}-${index}`} className="mt-1">
          <span className="font-semibold italic">{sense.partOfSpeech}. </span>
          {sense.definition}
        </p>
      ))}
      {rest.length > 0 && <MoreButton open={open} onClick={() => setOpen((value) => !value)} />}
    </div>
  );
}

/** Saved text is the main sense, then extras joined with a middle dot. */
export function SavedMeaning({ text, prominent = false }: { text: string; prominent?: boolean }) {
  const [open, setOpen] = useState(false);
  const parts = text.split(' · ').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return <p className={prominent ? 'text-xl font-bold' : 'mt-2 text-base'}>No meaning saved.</p>;
  return (
    <div className={prominent ? '' : 'mt-2'}>
      <p className={prominent ? 'text-xl font-bold' : 'text-base'}>{parts[0]}</p>
      {open && parts.slice(1).map((part) => (
        <p key={part} className="mt-1 text-sm text-slate-800 dark:text-slate-100">{part}</p>
      ))}
      {parts.length > 1 && <MoreButton open={open} onClick={() => setOpen((value) => !value)} />}
    </div>
  );
}
