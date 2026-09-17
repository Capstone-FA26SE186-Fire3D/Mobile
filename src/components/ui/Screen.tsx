import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';
import { Text } from './Text';
import { IconButton } from './Button';
export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {children}
        </ScrollView>
      ) : (
        <View style={styles.fill}>{children}</View>
      )}
    </SafeAreaView>
  );
}
export function PageHeader({
  title,
  onBack,
  children,
}: PropsWithChildren<{ title: string; onBack?: () => void }>) {
  return (
    <View style={styles.header}>
      {onBack && <IconButton name="arrow-back" label="Quay lại" onPress={onBack} />}
      <Text variant="heading" style={{ flex: 1 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}
export function Notice({ children, error = false }: PropsWithChildren<{ error?: boolean }>) {
  return (
    <View
      accessibilityRole={error ? 'alert' : undefined}
      style={[styles.notice, error && { backgroundColor: colors.redSoft }]}
    >
      <Text variant="small" style={error ? { color: colors.red } : undefined}>
        {children}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  content: { padding: 24, paddingBottom: 36, gap: 22 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notice: { backgroundColor: colors.greenSoft, padding: 14, borderRadius: 14 },
});
