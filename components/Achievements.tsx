import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { presentBadges, presentLevelBadges, type BadgeId, type BadgeView } from '../badges';
import { loadBadgeStats } from '../badgeStats';
import { dismissBadgeUnlock, subscribeBadgeUnlock } from '../badgeToast';
import { playEffect } from '../effects';

function BadgeCard({ badge, onOpen }: { badge: BadgeView; onOpen: (badge: BadgeView) => void }) {
  return (
    <li>
      <button type="button" className={`badge-card ${badge.unlocked ? 'badge-earned' : 'badge-locked'}`} onClick={() => onOpen(badge)} aria-haspopup="dialog">
        <div className="badge-art">
          <img src={badge.icon} alt="" width={96} height={96} />
          {badge.unlocked && <img className="badge-check" src="/badges/check.svg" alt="" width={16} height={16} />}
        </div>
        <p className="badge-name">{badge.label}</p>
        <p className="badge-rule">{badge.unlocked ? 'Unlocked' : 'Locked'} · {badge.progress}</p>
      </button>
    </li>
  );
}

export function AchievementsPanel() {
  const [badges, setBadges] = useState<BadgeView[] | null>(null);
  const [open, setOpen] = useState<BadgeView | null>(null);

  useEffect(() => {
    let ignore = false;
    loadBadgeStats().then((stats) => {
      if (!ignore) setBadges(presentBadges(stats));
    }).catch(() => {
      if (!ignore) setBadges(presentBadges({ reading: 0, listening: 0, grammar: 0, vocabAnswers: 0, perfect: 0, days: [] }));
    });
    return () => { ignore = true; };
  }, []);

  return (
    <section className="badge-panel" aria-labelledby="achievements-title">
      <h2 id="achievements-title" className="text-xl font-bold">Achievements</h2>
      <p className="mt-1 text-base">Exercise milestones come first. Tap a badge to see what it counts.</p>
      {!badges && <p className="mt-3 text-base">Loading...</p>}
      {badges && (
        <ul className="badge-grid">
          {badges.map((badge) => <BadgeCard key={badge.id} badge={badge} onOpen={setOpen} />)}
        </ul>
      )}
      {presentLevelBadges().length > 0 && <p className="mt-2 text-base">Level badges</p>}
      {open && <BadgeDetail badge={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function BadgeDetail({ badge, onClose }: { badge: BadgeView; onClose: () => void }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="phase2-dialog badge-popup-layer" data-open="true" role="dialog" aria-modal="true" aria-labelledby="badge-detail-title">
      <div className="phase2-dialog-card badge-popup">
        <div className="badge-titlebar">
          <span>{badge.unlocked ? 'Badge earned' : 'Badge locked'}</span>
          <span className="badge-win-buttons" aria-hidden="true"><i /><i /><i className="badge-close" /></span>
        </div>
        <div className="badge-window-body">
          <img src={badge.icon} alt="" width={128} height={128} />
          <h2 id="badge-detail-title" className="badge-name">{badge.label}</h2>
          <p className="mt-2 text-base">{badge.detail}</p>
          <button type="button" className="mt-4 w-full py-3 text-lg font-bold" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function BadgeUnlockDialog() {
  const [id, setId] = useState<BadgeId | null>(null);
  const [badges, setBadges] = useState<BadgeView[]>([]);

  useEffect(() => subscribeBadgeUnlock(setId), []);
  useEffect(() => {
    if (!id) return undefined;
    playEffect('complete', true);
    let ignore = false;
    loadBadgeStats().then((stats) => {
      if (!ignore) setBadges(presentBadges(stats));
    }).catch(() => undefined);
    return () => { ignore = true; };
  }, [id]);

  if (!id || typeof document === 'undefined') return null;
  const badge = badges.find((item) => item.id === id);
  return createPortal(
    <div className="phase2-dialog badge-popup-layer" data-open="true" role="dialog" aria-modal="true" aria-labelledby="badge-unlock-title">
      <div className="phase2-dialog-card badge-popup">
        <div className="badge-titlebar">
          <span>Badge unlocked</span>
          <span className="badge-win-buttons" aria-hidden="true"><i /><i /><i className="badge-close" /></span>
        </div>
        <div className="badge-window-body">
          <img src={badge?.icon ?? `/badges/set/${id}.svg`} alt="" width={128} height={128} />
          <h2 id="badge-unlock-title" className="badge-name">{badge?.label ?? 'Badge'}</h2>
          <p className="mt-2 text-base">{badge?.detail ?? 'A saved exercise unlocked this badge.'}</p>
          <button type="button" className="mt-4 w-full py-3 text-lg font-bold" onClick={() => dismissBadgeUnlock()}>
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
