import { Redirect } from 'expo-router';
import { useSession } from '@/store/SessionProvider';
export default function Index() {
  const { ready, account } = useSession();
  if (!ready) return null;
  return <Redirect href={account ? '/(tabs)' : '/login'} />;
}
