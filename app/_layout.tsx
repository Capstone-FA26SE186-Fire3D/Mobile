import { Stack } from 'expo-router';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { useFonts } from 'expo-font';
import { BeVietnamPro_400Regular } from '@expo-google-fonts/be-vietnam-pro/400Regular';
import { BeVietnamPro_500Medium } from '@expo-google-fonts/be-vietnam-pro/500Medium';
import { BeVietnamPro_600SemiBold } from '@expo-google-fonts/be-vietnam-pro/600SemiBold';
import { BeVietnamPro_700Bold } from '@expo-google-fonts/be-vietnam-pro/700Bold';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DemoProvider, useDemo } from '@/store/DemoProvider';
import { colors } from '@/theme/tokens';
import { FontsReady } from '@/components/ui/Text';
import { Brand } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Screen';
function Navigation() {
  const { state, ready, reduceMotion, storageError } = useDemo();
  if (!ready)
    return (
      <View style={styles.loading}>
        <Brand />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  return (
    <View style={styles.app}>
      {!!storageError && <Notice error>{storageError}</Notice>}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: reduceMotion ? 'none' : 'fade',
          animationDuration: 280,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Protected guard={!state.signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Protected guard={state.signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="scan"
            options={{ animation: reduceMotion ? 'none' : 'slide_from_bottom' }}
          />
          <Stack.Screen name="buildings" />
          <Stack.Screen name="training/[id]" />
          <Stack.Screen name="chat" />
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
    ...Ionicons.font,
  });
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <FontsReady.Provider value={loaded}>
        <DemoProvider>
          {!loaded && !error ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <Navigation />
          )}
        </DemoProvider>
      </FontsReady.Provider>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.background },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    backgroundColor: colors.background,
  },
});
