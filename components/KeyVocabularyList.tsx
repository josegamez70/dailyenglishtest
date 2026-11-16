import type { VocabularyItem } from '../types';
import { lessonWordSaved, termKey } from '../vocabulary';

export function KeyVocabularyList({
  items,
  savedKeys,
  signedIn,
  missing,
  notice,
  onToggle,
}: {
  items: VocabularyItem[];
  savedKeys: Set<string>;
  signedIn: boolean;
  missing: boolean;
  /** Kept so older callers compile. The tick no longer waits on it. */
  pendingKey?: string | null;
  notice?: string | null;
  onToggle: (item: VocabularyItem) => void;
}) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50">Key vocabulary</h3>
      {!signedIn && (
        <p className="mt-2 text-base">Sign in to save words. Academy students can save words too.</p>
      )}
      {missing && (
        <p className="mt-2 text-base">Vocabulary will be saved after the database update.</p>
      )}
      {notice && (
        <p className="mt-2 text-sm text-red-800 dark:text-red-200" role="status">{notice}</p>
      )}
      <ul className="mt-3 space-y-2">
        {items.map((item) => {
          const key = termKey(item.word);
          const saved = lessonWordSaved(savedKeys, item.word);
          return (
            <li key={key || item.word} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className={saved
                    ? 'mt-1 h-6 w-6 shrink-0 rounded border-2 border-blue-800 bg-blue-700 accent-blue-700'
                    : 'mt-1 h-6 w-6 shrink-0 rounded border-2 border-slate-900 bg-white accent-slate-700 dark:border-slate-100 dark:bg-slate-900'}
                  checked={saved}
                  disabled={!signedIn}
                  aria-label={saved ? `Remove ${item.word}` : `Save ${item.word}`}
                  onChange={() => onToggle(item)}
                />
                <span>
                  <span className="block text-lg font-semibold capitalize text-blue-800 dark:text-blue-200">{item.word}</span>
                  <span className="mt-1 block text-base text-slate-900 dark:text-slate-50">{item.definition}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
