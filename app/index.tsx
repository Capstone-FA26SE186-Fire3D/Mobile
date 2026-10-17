import { Redirect } from 'expo-router';
import { useSession } from '@/store/SessionProvider';
export default function Index() {
  const { ready, account, pendingQrToken, pendingHandoffCode } = useSession();
  if (!ready) return null;
  if (account?.role === 'OrganizationUser')
    return (
      <Redirect
        href={pendingHandoffCode ? `/playtest/handoff?code=${pendingHandoffCode}` : '/playtest'}
      />
    );
  if (account?.role === 'Trainee' && pendingQrToken)
    return <Redirect href={`/qr/${pendingQrToken}`} />;
  return <Redirect href={account ? '/(tabs)' : '/login'} />;
}
