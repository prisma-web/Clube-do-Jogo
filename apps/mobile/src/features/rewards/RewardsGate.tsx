import { useCallback, useState } from 'react';
import { useRewardGrants } from '@/state/reward-queries';
import { RewardCelebration } from './RewardCelebration';

export function RewardsGate() {
  const grants = useRewardGrants();
  const [dismissed, setDismissed] = useState<readonly string[]>([]);

  const dismiss = useCallback((grantId: string) => {
    setDismissed(current => (current.includes(grantId) ? current : [...current, grantId]));
  }, []);

  const grant = (grants.data ?? []).find(item => !item.seen_at && !dismissed.includes(item.id));
  if (!grant) return null;

  return <RewardCelebration key={grant.id} grant={grant} onClose={() => dismiss(grant.id)} />;
}
