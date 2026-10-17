import { Redirect } from 'expo-router';
import { useSession } from '@/store/SessionProvider';
export default function Index() {
  const { ready, account, pendingQrToken } = useSession();
  if (!ready) return null;
  if (account && pendingQrToken) return <Redirect href={`/qr/${pendingQrToken}`} />;
  return <Redirect href={account ? '/(tabs)' : '/login'} />;
}
