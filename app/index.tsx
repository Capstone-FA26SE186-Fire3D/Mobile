import { Redirect } from 'expo-router';
import { useDemo } from '@/store/DemoProvider';
export default function Index() {
  const { ready, state } = useDemo();
  if (!ready) return null;
  return <Redirect href={state.signedIn ? '/(tabs)' : '/login'} />;
}
