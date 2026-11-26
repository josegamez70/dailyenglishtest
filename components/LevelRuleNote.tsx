import { levelRuleText, type LevelAccess } from '../levelProgress';

export function LevelRuleNote({ access }: { access: Pick<LevelAccess, 'b1Passes' | 'b2Passes'> | null }) {
  return (
    <p className="mt-2 text-base text-slate-900 dark:text-slate-50" role="note">
      {levelRuleText(access)}
    </p>
  );
}
