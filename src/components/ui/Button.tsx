import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { colors } from '@/theme/tokens';
import { Text } from './Text';
export type IconName = ComponentProps<typeof Ionicons>['name'];
type Props = {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};
export function Button({
  title,
  onPress,
  icon,
  variant = 'primary',
  loading,
  disabled,
  style,
  testID,
}: Props) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.ink} />
      ) : icon ? (
        <Ionicons name={icon} size={21} color={colors.ink} />
      ) : null}
      <Text variant="label" style={styles.label}>
        {title}
      </Text>
      {variant === 'primary' && !loading && (
        <Ionicons name="arrow-forward" size={19} color={colors.ink} />
      )}
    </Pressable>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  selected = false,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        selected && { backgroundColor: colors.primarySoft },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={name} size={22} color={colors.ink} />
    </Pressable>
  );
}
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <View style={styles.brand}>
      <View style={[styles.mark, small && { width: 31, height: 35 }]}>
        <Ionicons name="flame" color={colors.ink} size={small ? 21 : 26} />
      </View>
      <Text variant="heading" style={{ fontSize: small ? 20 : 24 }}>
        fire
        <Text variant="heading" style={{ color: '#A74723', fontSize: small ? 20 : 24 }}>
          3d
        </Text>
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primary: { backgroundColor: colors.primary, borderBottomWidth: 3, borderBottomColor: '#C2693E' },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent' },
  label: { flexShrink: 1, textAlign: 'center', fontSize: 15 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  mark: {
    width: 38,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ rotate: '-7deg' }],
  },
});
