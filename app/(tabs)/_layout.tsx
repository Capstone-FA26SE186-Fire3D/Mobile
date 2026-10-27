import { Tabs } from 'expo-router';
import { GameTabBar } from '@/components/ui/TabBar';
import { colors } from '@/theme/tokens';

// Figma v2: Nhà · Bài học · [Quét QR — centre button] · Kết quả · Tôi. The scan button opens /scan-qr.
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <GameTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="index" options={{ title: 'Nhà' }} />
      <Tabs.Screen name="learn" options={{ title: 'Bài học' }} />
      <Tabs.Screen name="results" options={{ title: 'Kết quả' }} />
      <Tabs.Screen name="profile" options={{ title: 'Tôi' }} />
    </Tabs>
  );
}
