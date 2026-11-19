import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getSupabase } from '../auth';
import {
  emptyLegendCounts,
  globalBadges,
  legendTotal,
  modalityBadges,
  nextGoal,
  GLOBAL_LEGENDS,
  MODALITY_NEEDS,
  type LegendBadge,
  type LegendCounts,
  type LegendModality,
} from '../legends';
import { dismissLegendUnlock, subscribeLegendUnlock } from '../legendsToast';
import { playEffect } from '../effects';

const NAMES: Record<string, string> = Object.fromEntries([
  ...GLOBAL_LEGENDS.map((item) => [item.id, item.name]),
  ...(['reading', 'listening', 'grammar', 'vocabulary'] as const).flatMap((modality) => (
    MODALITY_NEEDS.map((need) => [`${modality}_${need}`, `${modality[0].toUpperCase()}${modality.slice(1)} ${need}`])
  )),
]);

const ICONS: Record<string, string> = Object.fromEntries([
  ...GLOBAL_LEGENDS.map((item) => [item.id, item.icon]),
  ...(['reading', 'listening', 'grammar', 'vocabulary'] as const).flatMap((modality) => (
    MODALITY_NEEDS.map((need) => [`${modality}_${need}`, `/achievements/${modality}_${need}.png`])
  )),
]);

type Board = { counts: LegendCounts; unlocked: string[]; missing: boolean };

const EMPTY: Board = { counts: emptyLegendCounts(), unlocked: [], missing: false };

export function RetroLegendsPanel({ fixture }: { fixture?: Board }) {
  const [board, setBoard] = useState<Board | null>(fixture ?? null);
  const [tab, setTab] = useState<'all' | LegendModality>('all');

  useEffect(() => {
    if (fixture) return undefined;
    let ignore = false;
    const supabase = getSupabase();
    if (!supabase) {
      setBoard({ ...EMPTY, missing: true });
      return undefined;
    }
    Promise.all([
      supabase.from('lesson_completions').select('modality'),
      supabase.from('user_achievements').select('achievement_id'),
    ]).then(([lessons, badges]) => {
      if (ignore) return;
      if (lessons.error || badges.error) {
        setBoard({ ...EMPTY, missing: true });
        return;
      }
      const counts = emptyLegendCounts();
      for (const row of lessons.data ?? []) {
        const modality = String((row as { modality?: string }).modality ?? '');
        if (modality in counts) counts[modality as LegendModality] += 1;
      }
      const unlocked = (badges.data ?? []).map((row) => String((row as { achievement_id?: string }).achievement_id ?? ''));
      setBoard({ counts, unlocked, missing: false });
    }).catch(() => {
      if (!ignore) setBoard({ ...EMPTY, missing: true });
    });
    return () => { ignore = true; };
  }, [fixture]);

  const counts = board?.counts ?? emptyLegendCounts();
  const unlocked = board?.unlocked ?? [];
  const total = legendTotal(counts);
  const badges: LegendBadge[] = tab === 'all'
    ? globalBadges(counts, unlocked)
    : modalityBadges(tab, counts, unlocked);
  const progressCount = tab === 'all' ? total : counts[tab];
  const progressNeeds = tab === 'all' ? GLOBAL_LEGENDS.map((item) => item.need) : MODALITY_NEEDS;
  const next = nextGoal(progressCount, progressNeeds);
  const nextBadge = next ? badges.find((item) => item.need === next.need) : null;
  const fill = next ? Math.min(100, Math.round((next.current / next.need) * 100)) : 100;

  return (
    <section className="legends-window" aria-labelledby="retro-legends-title">
      <div className="badge-titlebar">
        <h2 id="retro-legends-title">Retro Legends</h2>
        <span className="badge-win-buttons" aria-hidden="true"><i /><i /><i /></span>
      </div>
      <div className="badge-window-body">
        <p className="text-base">{total} lessons</p>
        {board?.missing && (
          <p className="mt-2 text-sm">Retro Legends will finish loading after the database update.</p>
        )}
        <p className="mt-2 text-base font-semibold">
          {next && nextBadge ? `Next: ${nextBadge.name}` : 'Every Retro Legend in this list is earned.'}
        </p>
        <div className="legends-meter mt-2" aria-hidden="true">
          <span style={{ width: `${fill}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Retro Legends collections">
          {([
            ['all', 'All'],
            ['reading', 'Reading'],
            ['listening', 'Listening'],
            ['grammar', 'Grammar'],
            ['vocabulary', 'Vocabulary'],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`choice-pill border-2 border-slate-900 px-3 py-1 text-sm font-bold ${tab === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`}>
              {label}
            </button>
          ))}
        </div>
        <ul className="badge-grid legends-grid">
          {badges.map((badge) => (
            <li key={badge.id} className={`badge-card ${badge.unlocked ? 'badge-earned' : 'badge-locked'}`}>
              <div className="badge-art">
                <img src={badge.icon} alt="" width={96} height={96} />
                {badge.unlocked && <img className="badge-check" src="/badges/check.svg" alt="" width={16} height={16} />}
              </div>
              <p className="badge-name">{badge.name}</p>
              <p className="badge-rule">{badge.unlocked ? 'Unlocked' : `${badge.need} lessons`}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function LegendsUnlockDialog() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => subscribeLegendUnlock(setId), []);
  useEffect(() => {
    if (id) playEffect('complete', true);
  }, [id]);
  if (!id || typeof document === 'undefined') return null;
  return createPortal(
    <div className="phase2-dialog badge-popup-layer" data-open="true" role="dialog" aria-modal="true" aria-labelledby="legend-unlock-title">
      <div className="phase2-dialog-card badge-popup">
        <div className="badge-titlebar">
          <span>ACHIEVEMENT UNLOCKED</span>
          <span className="badge-win-buttons" aria-hidden="true"><i /><i /><i className="badge-close" /></span>
        </div>
        <div className="badge-window-body">
          <img className="pixel-art" src={ICONS[id] ?? '/achievements/rookie_floppy.png'} alt="" width={128} height={128} />
          <h2 id="legend-unlock-title" className="badge-name">{NAMES[id] ?? 'Retro Legend'}</h2>
          <p className="mt-2 text-base">This is practice. It is not a certificate.</p>
          <button type="button" className="mt-4 w-full py-3 text-lg font-bold" onClick={() => dismissLegendUnlock()}>OK</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
