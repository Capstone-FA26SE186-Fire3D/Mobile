import LearnScreen from '@/features/learn/screens/LearnScreen';

/** Public Learn (guests and deep links); signed-in Trainees use the Learn tab. */
export default function LearnRoute() {
  return <LearnScreen standalone />;
}
