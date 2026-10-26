import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '@/theme/tokens';
import { Text } from './Text';
import { BackButton, Callout, type LucideIcon } from './Game';

export function Screen({
  children,
  scroll = true,
  footer,
  contentStyle,
}: PropsWithChildren<{
  scroll?: boolean;
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}>) {
  return (
    <SafeAreaView
      style={styles.safe}
      edges={footer ? ['top', 'left', 'right', 'bottom'] : ['top', 'left', 'right']}
    >
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, contentStyle]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, contentStyle]}>{children}</View>
      )}
      {footer && <View style={styles.footer}>{footer}</View>}
    </SafeAreaView>
  );
}

/** Back button + Black 17 title (Figma sub-page header). */
export function PageHeader({
  title,
  subtitle,
  onBack,
  backIcon,
  children,
}: PropsWithChildren<{
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backIcon?: LucideIcon;
}>) {
  return (
    <View style={styles.header}>
      {onBack && <BackButton onPress={onBack} icon={backIcon} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          {title}
        </Text>
        {!!subtitle && (
          <Text variant="small" muted>
            {subtitle}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

/** Large tab title, e.g. "Tôi", "Kết quả". */
export function ScreenTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={styles.titleRow}>
      <Text style={styles.screenTitle} accessibilityRole="header">
        {children}
      </Text>
      {right}
    </View>
  );
}

export function Notice({ children, error = false }: PropsWithChildren<{ error?: boolean }>) {
  return <Callout tone={error ? 'danger' : 'info'}>{children}</Callout>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  content: { padding: 20, paddingBottom: 32, gap: 16 },
  footer: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontFamily: fonts.black, fontSize: 17, lineHeight: 23 },
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 12 },
  screenTitle: { flex: 1, fontFamily: fonts.black, fontSize: 28, lineHeight: 36 },
});
