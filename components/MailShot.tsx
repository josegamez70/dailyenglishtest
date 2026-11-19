import { sampleScoreboardMail } from '../scoreboardEmail';

/** Local sample of the scoreboard email. The names are fictitious. Vite drops this route from production. */
export function MailShot() {
  const message = sampleScoreboardMail();
  return (
    <iframe
      id="shot-mail"
      title="Scoreboard email sample"
      srcDoc={message.html}
      style={{ width: 390, height: 2800, border: 0, display: 'block', margin: '0 auto', background: '#c0c0c0' }}
    />
  );
}
