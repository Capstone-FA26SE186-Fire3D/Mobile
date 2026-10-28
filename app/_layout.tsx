import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useFonts } from 'expo-font';
import { BeVietnamPro_400Regular } from '@expo-google-fonts/be-vietnam-pro/400Regular';
import { BeVietnamPro_500Medium } from '@expo-google-fonts/be-vietnam-pro/500Medium';
import { BeVietnamPro_600SemiBold } from '@expo-google-fonts/be-vietnam-pro/600SemiBold';
import { BeVietnamPro_700Bold } from '@expo-google-fonts/be-vietnam-pro/700Bold';
import { BeVietnamPro_800ExtraBold } from '@expo-google-fonts/be-vietnam-pro/800ExtraBold';
import { BeVietnamPro_900Black } from '@expo-google-fonts/be-vietnam-pro/900Black';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '@/store/SessionProvider';
import { colors, scheme } from '@/theme/tokens';
import { FontsReady } from '@/components/ui/Text';
import { Callout } from '@/components/ui/Game';
import { Splash } from '@/components/ui/Splash';
import { startTrainingRuntime } from '@/features/training/training-runtime';

function Navigation() {
  const { account, ready, reduceMotion, error, dismissError } = useSession();
  const insets = useSafeAreaInsets();
  // Device-wide, one receiver for Trainee training and OrganizationUser playtests: ingest Unity callbacks and sync the
  // signed-in account's started sessions (events, completion) on callbacks, app start and foreground.
  const accountId = account?.id;
  const role = account?.role;
  useEffect(
    () =>
      accountId && (role === 'Trainee' || role === 'OrganizationUser')
        ? startTrainingRuntime({ accountId, role })
        : undefined,
    [accountId, role],
  );
  if (!ready) return <Splash />;
  return (
    <View style={styles.app}>
      {!!error && (
        // Floats below the status bar / camera cutout instead of under it, and can be closed.
        <View style={[styles.notice, { top: insets.top + 8 }]} pointerEvents="box-none">
          <View style={styles.noticeRow}>
            <View style={{ flex: 1 }}>
              <Callout tone="danger" style={{ paddingRight: 40 }}>{error}</Callout>
            </View>
            <Pressable onPress={dismissError} accessibilityRole="button" accessibilityLabel="Đóng thông báo" hitSlop={12} style={styles.noticeClose}>
              <X size={18} color={colors.text} />
            </Pressable>
          </View>
        </View>
      )}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: reduceMotion ? 'none' : 'fade',
          animationDuration: 280,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="verify-email" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="scan-qr" />
        <Stack.Screen name="qr/[token]" />
        <Stack.Screen name="learn/index" />
        <Stack.Screen name="learn/[slug]" />
        <Stack.Screen name="playtest/handoff" />
        <Stack.Protected guard={!account}>
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="forgot-password" />
          <Stack.Screen name="google-onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={account?.role === 'Trainee'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="account-settings" />
          <Stack.Screen name="support" />
          <Stack.Screen name="ai/index" />
          <Stack.Screen name="history/index" />
          <Stack.Screen name="history/[sessionId]" />
          <Stack.Screen name="training/[trainingId]" />
          <Stack.Screen name="training/session/[sessionId]" />
          <Stack.Screen name="learn/bookmarks" />
        </Stack.Protected>
        <Stack.Protected guard={account?.role === 'OrganizationUser'}>
          <Stack.Screen name="playtest/index" />
        </Stack.Protected>
      </Stack>
    </View>
  );
}

export default function Layout() {
  const [loaded, error] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    BeVietnamPro_800ExtraBold,
    BeVietnamPro_900Black,
  });
  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={scheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={colors.bg}
      />
      <FontsReady.Provider value={loaded}>
        <SessionProvider>
          {!loaded && !error ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.ember} />
            </View>
          ) : (
            <Navigation />
          )}
        </SessionProvider>
      </FontsReady.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.bg },
  // Above the screens (they keep their own safe-area padding), so the notice never shifts the layout.
  notice: { position: 'absolute', left: 12, right: 12, zIndex: 10, elevation: 10 },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start' },
  noticeClose: { position: 'absolute', right: 6, top: 6, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    backgroundColor: colors.bg,
  },
});
