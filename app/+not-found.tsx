import { Redirect } from 'expo-router';
import { useSession } from '@/store/SessionProvider';

export default function NotFound() {
  const { account, ready } = useSession();
  if (!ready) return null;
  return <Redirect href={account ? '/(tabs)' : '/login'} />;
}
