import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { dismissLevelUnlock, subscribeLevelUnlock, type UnlockLevel } from '../levelUnlock';
import { playEffect } from '../effects';

function LevelBadge({ level }: { level: UnlockLevel }) {
  const ink = level === 'C1' ? '#7c3aed' : '#1d4ed8';
  return (
    <svg className="pixel-art" viewBox="0 0 16 16" width="128" height="128" aria-hidden="true">
      <rect width="16" height="16" fill="#111827" />
      <rect x="2" y="2" width="12" height="12" fill={ink} />
      <rect x="4" y="4" width="8" height="8" fill="#f8fafc" />
      <rect x="6" y="5" width="4" height="2" fill={ink} />
      <rect x="5" y="8" width="6" height="2" fill="#facc15" />
      <rect x="7" y="11" width="2" height="2" fill={ink} />
    </svg>
  );
}

export function LevelUnlockDialog() {
  const [level, setLevel] = useState<UnlockLevel | null>(null);
  useEffect(() => subscribeLevelUnlock(setLevel), []);
  useEffect(() => {
    if (level) playEffect('complete', true);
  }, [level]);
  if (!level || typeof document === 'undefined') return null;
  return createPortal(
    <div className="phase2-dialog badge-popup-layer" data-open="true" role="dialog" aria-modal="true" aria-labelledby="level-unlock-title">
      <div className="phase2-dialog-card badge-popup">
        <div className="badge-titlebar">
          <span>Daily Challenge</span>
          <span className="badge-win-buttons" aria-hidden="true"><i /><i /><i className="badge-close" /></span>
        </div>
        <div className="badge-window-body">
          <LevelBadge level={level} />
          <h2 id="level-unlock-title" className="badge-name">¡Nuevo nivel desbloqueado!</h2>
          <p className="mt-2 text-base">{level} is open on the Daily Challenge. This is practice, not a certificate.</p>
          <button type="button" className="mt-4 w-full py-3 text-lg font-bold" onClick={() => dismissLevelUnlock()}>OK</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
