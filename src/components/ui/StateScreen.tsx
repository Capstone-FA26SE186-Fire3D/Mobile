import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, fonts, type HexTone } from '@/theme/tokens';
import { HexBadge, Ribbon, type LucideIcon } from './Game';
import { PageHeader, Screen } from './Screen';
import { Text } from './Text';

const RIBBON: Partial<Record<HexTone, { color: string; shadow: string }>> = {
  danger: { color: colors.hex.danger, shadow: '#2A2F31' },
  warning: { color: colors.hex.warning, shadow: '#7A5B12' },
  info: { color: colors.hex.info, shadow: '#2A2F31' },
  success: { color: colors.exit, shadow: '#1F6B44' },
  exit: { color: colors.exit, shadow: '#1F6B44' },
  neutral: { color: colors.hex.neutral, shadow: '#2A2F31' },
};

/** Full-screen system state (Figma "QR bị thu hồi", "Camera bị từ chối", "Cần cập nhật ứng dụng"…). */
export function StateView({
  icon,
  tone = 'danger',
  ribbon,
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  tone?: HexTone;
  ribbon?: string;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  const r = RIBBON[tone];
  return (
    <View style={styles.state}>
      <HexBadge icon={icon} tone={tone} size={140} />
      {!!ribbon && <Ribbon label={ribbon} color={r?.color} shadow={r?.shadow} />}
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {!!body && (
        <Text muted style={styles.body}>
          {body}
        </Text>
      )}
      {children}
    </View>
  );
}

export function StateScreen({
  header,
  onBack,
  actions,
  ...state
}: Parameters<typeof StateView>[0] & {
  header?: string;
  onBack?: () => void;
  actions?: ReactNode;
}) {
  return (
    <Screen footer={actions} contentStyle={{ paddingHorizontal: 24 }}>
      {!!header && <PageHeader title={header} onBack={onBack} />}
      <StateView {...state} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  state: { alignItems: 'center', gap: 14, paddingVertical: 30 },
  title: { fontFamily: fonts.black, fontSize: 22, lineHeight: 29, textAlign: 'center' },
  body: { fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 310 },
});
