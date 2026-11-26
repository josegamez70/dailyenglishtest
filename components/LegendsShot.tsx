import { useEffect } from 'react';
import { AppShell } from './AppShell';
import { PixelArt } from './PixelArt';
import { RetroLegendsPanel, LegendsUnlockDialog } from './RetroLegends';
import { enqueueLegendUnlocks } from '../legendsToast';
import { setRetroActive } from '../retroTheme';

/** Local screenshot page. Vite drops this route from the production build. */
export function LegendsShot() {
  const theme = new URLSearchParams(window.location.search).get('theme') || 'light';
  const popup = new URLSearchParams(window.location.search).get('popup') === '1';
  useEffect(() => {
    const dark = theme === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    if (theme === 'retro') document.documentElement.setAttribute('data-theme', 'retro95');
    else document.documentElement.removeAttribute('data-theme');
    setRetroActive(theme === 'retro');
    if (popup) enqueueLegendUnlocks(['rookie']);
  }, [theme, popup]);
  const selected = 'flex flex-col items-center justify-center rounded-lg border-2 border-blue-800 bg-blue-700 p-4 text-white ring-4 ring-blue-300';
  const idle = 'flex flex-col items-center justify-center rounded-lg border-2 border-slate-500 bg-white p-4 text-slate-900 dark:border-slate-300 dark:bg-slate-800 dark:text-slate-50';
  return (
    <AppShell
      active="scoreboard"
      onNavigate={() => undefined}
      onSignOut={() => undefined}
      onHome={() => undefined}
      email="josegamez70+detest@gmail.com"
      status="Free plan"
      showAcademy={false}
    >
      <div id="shot-practice" className="mb-4 w-full max-w-2xl">
        <p className="mb-3 text-center text-lg font-semibold">Selected mode: Reading</p>
        <div className="mb-4 grid grid-cols-2 gap-4">
          <button type="button" aria-pressed="true" className={selected}>
            <span className="mb-2"><PixelArt src="/icons/practice_reading.png" size={32} /></span>
            <span className="font-semibold text-lg">Reading</span>
            <span className="mt-1 text-base text-blue-50">Selected</span>
          </button>
          <button type="button" aria-pressed="false" className={idle}>
            <span className="mb-2"><PixelArt src="/icons/practice_listening.png" size={32} /></span>
            <span className="font-semibold text-lg">Listening</span>
          </button>
        </div>
        <p className="mb-3 text-center text-lg font-semibold">Selected format: Text</p>
        <div className="grid grid-cols-2 gap-4">
          <button type="button" aria-pressed="true" className={selected}>
            <span className="mb-1"><PixelArt src="/icons/terms.png" size={32} /></span>
            <span className="font-semibold">Text</span>
          </button>
          <button type="button" aria-pressed="false" className={idle}>
            <span className="mb-1"><PixelArt src="/icons/practice_dialogue.png" size={32} /></span>
            <span className="font-semibold">Dialogue</span>
          </button>
        </div>
      </div>
      <div id="shot-legends">
        <RetroLegendsPanel />
      </div>
      <LegendsUnlockDialog />
    </AppShell>
  );
}
