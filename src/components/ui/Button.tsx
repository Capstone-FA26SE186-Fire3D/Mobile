import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, fonts } from '@/theme/tokens';
import { Raised } from './Game';
import { Text } from './Text';
const logoMark = require('../../../assets/images/logo-mark.png');

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Props = {
  title: string;
  onPress: () => void;
  icon?: LucideIcon;
  variant?: Variant;
  /** 58px main action or 52px secondary row (Figma "Game button"). */
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Screen-reader name when several buttons share a title (defaults to the title). */
  accessibilityLabel?: string;
};
const LOOK: Record<Exclude<Variant, 'ghost'>, { face: ViewStyle; fg: string; shadow: string }> = {
  primary: {
    face: { backgroundColor: colors.ember },
    fg: colors.emberForeground,
    shadow: colors.emberShadow,
  },
  secondary: {
    face: { backgroundColor: colors.surfaceRaised, borderWidth: 2, borderColor: colors.lineStrong },
    fg: colors.text,
    shadow: colors.hardShadow,
  },
  danger: {
    face: { backgroundColor: colors.dangerSoft, borderWidth: 2, borderColor: colors.danger },
    fg: colors.danger,
    shadow: colors.hardShadow,
  },
};

export function Button({
  title,
  onPress,
  icon: Icon,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  style,
  testID,
  accessibilityLabel,
}: Props) {
  const off = disabled || loading;
  if (variant === 'ghost')
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityState={{ disabled: off, busy: loading }}
        disabled={off}
        onPress={onPress}
        hitSlop={8}
        style={({ pressed }) => [styles.ghost, (pressed || off) && { opacity: 0.6 }, style]}
      >
        {Icon && <Icon size={16} color={colors.ember} strokeWidth={2.5} />}
        <Text style={styles.ghostLabel}>{title}</Text>
      </Pressable>
    );
  const look = LOOK[variant];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={onPress}
      style={[off && { opacity: 0.55 }, style]}
    >
      {({ pressed }) => (
        <Raised
          depth={5}
          shadow={look.shadow}
          radius={18}
          pressed={pressed}
          faceStyle={[styles.face, { minHeight: size === 'md' ? 58 : 52 }, look.face]}
        >
          {loading ? (
            <ActivityIndicator color={look.fg} />
          ) : (
            Icon && <Icon size={22} color={look.fg} strokeWidth={2.25} />
          )}
          <Text style={[styles.label, { color: look.fg }]}>{title}</Text>
        </Raised>
      )}
    </Pressable>
  );
}

/** Square 42px icon button (header actions). */
export function IconButton({
  icon: Icon,
  label,
  onPress,
  selected = false,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        selected && { borderColor: colors.ember, backgroundColor: colors.emberSoft },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icon size={20} color={selected ? colors.ember : colors.text} strokeWidth={2.25} />
    </Pressable>
  );
}

const BRAND_SIZE = {
  sm: { mark: { width: 35, height: 32 }, text: { fontSize: 20, lineHeight: 26 } },
  md: { mark: { width: 46, height: 42 }, text: { fontSize: 24, lineHeight: 30 } },
  lg: { mark: { width: 66, height: 60 }, text: { fontSize: 33, lineHeight: 41 } },
};
export function Brand({ size = 'md' }: { size?: keyof typeof BRAND_SIZE }) {
  const s = BRAND_SIZE[size];
  return (
    <View style={styles.brand} accessible accessibilityRole="image" accessibilityLabel="FET3D">
      {/* Source asset is 818×742; the sizes keep that ratio so the isometric mark is not cropped. */}
      <Image source={logoMark} style={s.mark} resizeMode="contain" />
      <Text style={[styles.brandText, s.text]}>
        FET<Text style={[styles.brandText, s.text, { color: colors.ember }]}>3D</Text>
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  face: {
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  label: {
    flexShrink: 1,
    textAlign: 'center',
    fontFamily: fonts.extrabold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.3,
  },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 32,
  },
  ghostLabel: { fontFamily: fonts.extrabold, fontSize: 13, lineHeight: 18, color: colors.ember },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandText: { fontFamily: fonts.black, letterSpacing: 1, color: colors.text },
});
