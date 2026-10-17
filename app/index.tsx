import { Redirect } from 'expo-router';
import { useSession } from '@/store/SessionProvider';
export default function Index() {
  const { ready, account, pendingHandoffCode } = useSession();
  if (!ready) return null;
  if (account?.role === 'OrganizationUser')
    return (
      <Redirect
        href={pendingHandoffCode ? `/playtest/handoff?code=${pendingHandoffCode}` : '/playtest'}
      />
    );
  return <Redirect href={account ? '/(tabs)' : '/login'} />;
}
