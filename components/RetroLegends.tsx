import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getSupabase } from '../auth';
import { listTestResults } from '../studyStore';
import { getVocabularyState, loadVocabulary } from '../vocabularyStore';
import {
  earnedDateLabel,
  earnedShelfPlan,
  presentRetroLegends,
  RETRO_GROUPS,
  type RetroBadge,
  type StoredAchievement,
} from '../retroCollection';
import { GLOBAL_LEGENDS, MODALITY_NEEDS } from '../legends';
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

export function RetroLegendsPanel() {
  const [badges, setBadges] = useState<RetroBadge[] | null>(null);
  const [open, setOpen] = useState<RetroBadge | null>(null);

  useEffect(() => {
    let ignore = false;
    const supabase = getSupabase();
    const stored = supabase
      ? supabase.from('user_achievements').select('achievement_id, unlocked_at')
      : Promise.resolve({ data: [], error: null });
    Promise.all([
      listTestResults(),
      loadVocabulary().catch(() => undefined),
      stored,
    ]).then(([results, , achievements]) => {
      if (ignore) return;
      const words = getVocabularyState().rows.map((row) => ({ createdAt: row.createdAt }));
      const saved: StoredAchievement[] = achievements.error ? [] : (achievements.data ?? []).map((row) => ({
        id: String((row as { achievement_id?: string }).achievement_id ?? ''),
        unlockedAt: String((row as { unlocked_at?: string }).unlocked_at ?? ''),
      }));
      setBadges(presentRetroLegends({
        results: results.rows.map((row) => ({
          createdAt: row.created_at,
          level: row.level,
          score: row.score,
          total: row.total,
          mode: row.mode,
        })),
        words,
        stored: saved,
      }));
    }).catch(() => {
      if (!ignore) setBadges(presentRetroLegends({ results: [], words: [] }));
    });
    return () => { ignore = true; };
  }, []);

  return (
    <section className="legends-window" aria-labelledby="retro-legends-title">
      <div className="badge-titlebar">
        <h2 id="retro-legends-title">Retro Legends</h2>
        <span className="badge-win-buttons" aria-hidden="true"><i /><i /><i /></span>
      </div>
      <div className="badge-window-body">
        <p className="text-base">One collection. A grey badge is still to earn. A lit badge is earned.</p>
        {!badges && <p className="mt-3 text-base">Loading...</p>}
        {badges && <EarnedShelves badges={badges} onOpen={setOpen} />}
        {badges && RETRO_GROUPS.map((group) => {
          const row = badges.filter((badge) => badge.group === group.id);
          if (row.length === 0) return null;
          return <LegendRow key={group.id} label={group.label} badges={row} onOpen={setOpen} />;
        })}
      </div>
      {open && <LegendCard badge={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

const EMPTY_PLACEHOLDERS = 4;

function EarnedShelves({ badges, onOpen }: { badges: RetroBadge[]; onOpen: (badge: RetroBadge) => void }) {
  const plan = earnedShelfPlan(badges);
  return (
    <>
      <div className={`legend-shelf legend-top-shelf${plan.earned.length === 0 ? ' is-empty' : ''}`}>
        <h3 className="legend-shelf-label">Earned</h3>
        <ul className="legend-shelf-row" aria-label="Earned badges">
          {plan.earned.length === 0
            ? Array.from({ length: EMPTY_PLACEHOLDERS }, (_, index) => (
              <li key={`placeholder-${index}`}><EmptySlot large /></li>
            ))
            : plan.earned.map((badge) => (
              <li key={badge.id}>
                <LegendBadge badge={badge} onOpen={onOpen} />
              </li>
            ))}
        </ul>
        {plan.earned.length === 0 && <p className="legend-shelf-note">No badges yet.</p>}
      </div>
      {plan.shelves.map((slots, index) => (
        <div className="legend-shelf legend-slot-shelf" key={index}>
          <ul className="legend-shelf-row" aria-label={`Shelf ${index + 1}`}>
            {slots.map((badge, slot) => (
              <li key={badge?.id ?? `empty-${index}-${slot}`}>
                {badge ? <LegendBadge badge={badge} onOpen={onOpen} compact /> : <EmptySlot />}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function EmptySlot({ large = false }: { large?: boolean }) {
  return (
    <div className={`legend-empty-slot${large ? ' is-large' : ''}`}>
      <span className="sr-only">Empty</span>
      <span className="legend-silhouette" aria-hidden="true" />
    </div>
  );
}

function LegendBadge({ badge, onOpen, compact = false }: {
  badge: RetroBadge;
  onOpen: (badge: RetroBadge) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={`badge-card ${compact ? 'legend-slot-card' : ''} badge-earned legend-lit`}
      onClick={() => onOpen(badge)}
      aria-haspopup="dialog"
      aria-label={badge.label}
    >
      <div className="badge-art">
        <img src={badge.icon} alt="" width={compact ? 52 : 96} height={compact ? 52 : 96} />
      </div>
      {!compact && <p className="badge-name">{badge.label}</p>}
      {!compact && <p className="badge-rule">{badge.progress}</p>}
    </button>
  );
}

function LegendRow({ label, badges, onOpen }: {
  label: string;
  badges: RetroBadge[];
  onOpen: (badge: RetroBadge) => void;
}) {
  return (
    <div className="legend-shelf">
      <h3 className="legend-shelf-label">{label}</h3>
      <ul className="legend-shelf-row" aria-label={label}>
        {badges.map((badge) => (
          <li key={badge.id}>
            <button type="button" className={`badge-card ${badge.unlocked ? 'badge-earned legend-lit' : 'badge-locked'}`} onClick={() => onOpen(badge)} aria-haspopup="dialog">
              <div className="badge-art">
                <img src={badge.icon} alt="" width={96} height={96} />
              </div>
              <p className="badge-name">{badge.label}</p>
              <p className="badge-rule">{badge.progress}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LegendCard({ badge, onClose }: { badge: RetroBadge; onClose: () => void }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="phase2-dialog badge-popup-layer" data-open="true" role="dialog" aria-modal="true" aria-labelledby="legend-card-title">
      <div className="phase2-dialog-card badge-popup">
        <div className="badge-titlebar">
          <span>{badge.unlocked ? 'Earned' : 'Not earned yet'}</span>
          <span className="badge-win-buttons" aria-hidden="true"><i /><i /><i className="badge-close" /></span>
        </div>
        <div className="badge-window-body">
          <img className={`pixel-art ${badge.unlocked ? '' : 'legend-grey'}`} src={badge.icon} alt="" width={128} height={128} />
          <h2 id="legend-card-title" className="badge-name">{badge.label}</h2>
          <p className="mt-2 text-base">{badge.rule}</p>
          <p className="mt-2 text-base">Progress: {badge.progress}</p>
          <p className="mt-1 text-base">{badge.unlocked ? `Earned ${earnedDateLabel(badge.earnedAt)}` : 'Not earned yet'}</p>
          <button type="button" className="mt-4 w-full py-3 text-lg font-bold" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body,
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
