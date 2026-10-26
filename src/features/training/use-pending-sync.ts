import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/store/SessionProvider';
import { sessionsToSync } from './event-queue.native';
import { subscribeTrainingRuntime } from './training-runtime';
import { unityBridge } from './unity-bridge.native';

export type PendingSync = { count: number; offline: boolean };

/** Sessions of the signed-in Trainee still waiting to reach BE, refreshed on every runtime sync event. */
export function usePendingSync(): PendingSync {
  const { account } = useSession();
  const accountId = account?.id;
  const [state, setState] = useState<PendingSync>({ count: 0, offline: false });
  const refresh = useCallback(
    async (offline = false) => {
      if (!accountId || !unityBridge.available) return;
      try {
        const rows = await sessionsToSync(accountId, account?.role === 'Trainee');
        setState({ count: rows.length, offline });
      } catch {
        // The local queue is best effort for this indicator; the result screen reports real errors.
      }
    },
    [accountId, account?.role],
  );
  useEffect(() => {
    void refresh();
    return subscribeTrainingRuntime((event) => {
      if (event.kind === 'synced' || event.kind === 'unity') void refresh();
      if (event.kind === 'sync-failed') void refresh(event.offline);
    });
  }, [refresh]);
  return state;
}
