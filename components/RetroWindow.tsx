import { useSyncExternalStore } from 'react';
import { subscribeRetro, useRetro } from '../retroTheme';

export function RetroWindow({
  title,
  sober = false,
  children,
}: {
  title: string;
  /** Academy screens stay plain: a window and a table, without yellow trim. */
  sober?: boolean;
  children: React.ReactNode;
}) {
  const retro = useSyncExternalStore(subscribeRetro, useRetro, () => false);
  return (
    <div className={retro ? (sober ? 'retro-window retro-sober' : 'retro-window') : undefined}>
      {retro && (
        <div className="retro-titlebar">
          <span>{title}</span>
          <span className="retro-win-buttons" aria-hidden="true">
            <i /><i /><i />
          </span>
        </div>
      )}
      <div className={retro ? 'retro-window-body' : undefined}>{children}</div>
    </div>
  );
}
