import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { presentBadges, type BadgeId, type BadgeView } from '../badges';
import { loadBadgeStats } from '../badgeStats';
import { dismissBadgeUnlock, subscribeBadgeUnlock } from '../badgeToast';
import { playEffect } from '../effects';

const COPY: Record<BadgeId, { label: string; rule: string }> = {
  reading: { label: 'Reading Completed', rule: 'Finish 1 Reading exercise.' },
  listening: { label: 'Listening Completed', rule: 'Finish 1 Listening exercise.' },
  grammar: { label: 'Grammar Completed', rule: 'Finish 1 Grammar exercise.' },
  vocabulary: { label: 'Vocabulary Completed', rule: 'Answer 4 Vocabulary quiz questions, the shortest quiz.' },
  audio: { label: 'Audio Lesson Completed', rule: 'Finish 5 Listening exercises.' },
  video: { label: 'Video Lesson Completed', rule: 'Coming soon. There is no video lesson to complete yet.' },
  walkman: { label: 'Walkman Challenge', rule: 'Finish an exercise on 3 days in a row, using the date in Spain.' },
  bmx: { label: 'BMX Master', rule: 'Finish 25 Reading, Listening, or Grammar exercises.' },
};

function BadgeCard({ badge }: { badge: BadgeView }) {
  const earned = badge.unlocked && !badge.comingSoon;
  return (
    <li className={`badge-card ${earned ? 'badge-earned' : 'badge-locked'}`}>
      <div className="badge-art">
        <img src={badge.icon} alt="" width={96} height={96} />
        {earned && <img className="badge-check" src="/badges/check.svg" alt="" width={16} height={16} />}
      </div>
      <p className="badge-name">{badge.label}</p>
      <p className="badge-rule">{badge.comingSoon ? 'Coming soon' : earned ? 'Unlocked' : 'Locked'}</p>
    </li>
  );
}

export function AchievementsPanel() {
  const [badges, setBadges] = useState<BadgeView[] | null>(null);

  useEffect(() => {
    let ignore = false;
    loadBadgeStats().then((stats) => {
      if (!ignore) setBadges(presentBadges(stats));
    }).catch(() => {
      if (!ignore) setBadges(presentBadges({ reading: 0, listening: 0, grammar: 0, vocabAnswers: 0, days: [] }));
    });
    return () => { ignore = true; };
  }, []);

  return (
    <section className="badge-panel" aria-labelledby="achievements-title">
      <h2 id="achievements-title" className="text-xl font-bold">Achievements</h2>
      <p className="mt-1 text-base">Badges come from exercises you have already finished.</p>
      {!badges && <p className="mt-3 text-base">Loading...</p>}
      {badges && (
        <ul className="badge-grid">
          {badges.map((badge) => <BadgeCard key={badge.id} badge={badge} />)}
        </ul>
      )}
    </section>
  );
}

export function BadgeUnlockDialog() {
  const [id, setId] = useState<BadgeId | null>(null);

  useEffect(() => subscribeBadgeUnlock(setId), []);
  useEffect(() => {
    if (!id) return undefined;
    playEffect('complete', true);
    return undefined;
  }, [id]);

  if (!id || typeof document === 'undefined') return null;
  const copy = COPY[id];
  return createPortal(
    <div className="phase2-dialog badge-popup-layer" data-open="true" role="dialog" aria-modal="true" aria-labelledby="badge-unlock-title">
      <div className="phase2-dialog-card badge-popup">
        <div className="badge-titlebar">
          <span>Badge unlocked</span>
          <span className="badge-win-buttons" aria-hidden="true"><i /><i /><i className="badge-close" /></span>
        </div>
        <div className="badge-window-body">
          <img src={`/badges/${id}.png`} alt="" width={128} height={128} />
          <h2 id="badge-unlock-title" className="badge-name">{copy.label}</h2>
          <p className="mt-2 text-base">{copy.rule}</p>
          <button type="button" className="mt-4 w-full py-3 text-lg font-bold" onClick={() => dismissBadgeUnlock()}>
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
