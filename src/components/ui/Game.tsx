import { forwardRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Polygon, Rect, Stop } from 'react-native-svg';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { colors, fonts, type HexTone } from '@/theme/tokens';
import { Text } from './Text';

export type { LucideIcon };
const dioramaHero = require('../../../assets/images/diorama.webp');

/**
 * Figma's "game" depth: a hard, unblurred shadow offset straight down (box-shadow 0 Npx 0). Android elevation
 * blurs, so the shadow is the same shape drawn underneath and shifted by `depth`.
 */
export function Raised({
  depth = 4,
  shadow = colors.hardShadow,
  radius,
  pressed = false,
  style,
  faceStyle,
  children,
}: PropsWithChildren<{
  depth?: number;
  shadow?: string;
  radius: number;
  pressed?: boolean;
  style?: StyleProp<ViewStyle>;
  faceStyle?: StyleProp<ViewStyle>;
}>) {
  return (
    <View style={[{ paddingBottom: depth }, style]}>
      {depth > 0 && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { top: depth, borderRadius: radius, backgroundColor: shadow },
          ]}
        />
      )}
      {/* Opaque base so tinted (semi-transparent) faces don't show the shadow through them. */}
      <View
        style={[
          { borderRadius: radius, backgroundColor: depth > 0 ? colors.bg : undefined },
          pressed && { transform: [{ translateY: depth - 1 }] },
        ]}
      >
        <View style={[{ borderRadius: radius }, faceStyle]}>{children}</View>
      </View>
    </View>
  );
}

type CardProps = PropsWithChildren<{
  accent?: boolean;
  radius?: number;
  padding?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}>;
/** "Game card": surface, 2px strong border, 4px hard shadow. `accent` uses the ember border (in-progress items). */
export function Card({
  accent,
  radius = 20,
  padding = 16,
  onPress,
  accessibilityLabel,
  style,
  contentStyle,
  children,
}: CardProps) {
  const face = (pressed: boolean) => (
    <Raised
      radius={radius}
      pressed={pressed}
      faceStyle={[
        styles.card,
        { padding, borderColor: accent ? colors.ember : colors.lineStrong },
        contentStyle,
      ]}
    >
      {children}
    </Raised>
  );
  if (!onPress) return <View style={style}>{face(false)}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={style}
    >
      {({ pressed }) => face(pressed)}
    </Pressable>
  );
}

export function Ribbon({
  label,
  color = colors.ribbon,
  shadow = colors.emberShadow,
}: {
  label: string;
  color?: string;
  shadow?: string;
}) {
  return (
    <Raised
      depth={3}
      shadow={shadow}
      radius={8}
      style={{ alignSelf: 'flex-start' }}
      faceStyle={[styles.ribbon, { backgroundColor: color }]}
    >
      <Text style={styles.ribbonText}>{label.toUpperCase()}</Text>
    </Raised>
  );
}

/** Pointy-top hexagon with a 3px dark outline and 3px hard drop, icon centred (Figma "Hex badge"). */
export function HexBadge({
  icon: Icon,
  tone = 'ember',
  size = 44,
}: {
  icon: LucideIcon;
  tone?: HexTone;
  size?: number;
}) {
  const h = size - 4;
  const w = h * 0.866;
  const x0 = (size - w) / 2;
  const y0 = 2;
  const points = (dy: number) =>
    [
      [size / 2, y0],
      [x0 + w, y0 + h / 4],
      [x0 + w, y0 + (3 * h) / 4],
      [size / 2, y0 + h],
      [x0, y0 + (3 * h) / 4],
      [x0, y0 + h / 4],
    ]
      .map(([x, y]) => `${x},${y + dy}`)
      .join(' ');
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size + 4} style={StyleSheet.absoluteFill}>
        <Polygon
          points={points(3)}
          fill={colors.hardShadow}
          stroke={colors.hardShadow}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <Polygon
          points={points(0)}
          fill={colors.hex[tone]}
          stroke={colors.hardShadow}
          strokeWidth={3}
          strokeLinejoin="round"
        />
      </Svg>
      <View style={styles.hexIcon}>
        <Icon size={size * 0.46} color={colors.ink} strokeWidth={2} absoluteStrokeWidth />
      </View>
    </View>
  );
}

type Tone = 'success' | 'danger' | 'warning' | 'info' | 'ember';
const TONES: Record<Tone, { fg: string; bg: string }> = {
  success: { fg: colors.success, bg: colors.successSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
  warning: { fg: colors.warning, bg: colors.warningSoft },
  info: { fg: colors.info, bg: colors.infoSoft },
  ember: { fg: colors.ember, bg: colors.emberSoft },
};

/** Outlined status chip, e.g. "Đã đồng bộ" on Home. */
export function Chip({
  label,
  tone = 'success',
  icon: Icon,
}: {
  label: string;
  tone?: Tone;
  icon?: LucideIcon;
}) {
  const t = TONES[tone];
  return (
    <View style={[styles.chip, { borderColor: t.fg, backgroundColor: t.bg }]}>
      {Icon && <Icon size={14} color={t.fg} strokeWidth={2.5} />}
      <Text style={[styles.chipText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const NEUTRAL = { fg: colors.dim, bg: colors.line };
/** Rounded pill with a dot, e.g. role and email-verified on the profile card, outcome on result rows. */
export function Pill({ label, tone = 'success' }: { label: string; tone?: Tone | 'neutral' }) {
  const t = tone === 'neutral' ? NEUTRAL : TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <View style={[styles.dot, { backgroundColor: t.fg }]} />
      <Text variant="caption" style={{ color: t.fg }}>
        {label}
      </Text>
    </View>
  );
}

const CALLOUT_ICON: Record<Tone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  danger: CircleAlert,
  warning: TriangleAlert,
  ember: Info,
};
/** Tinted message box with a 2px tone border. */
export function Callout({
  tone = 'info',
  icon,
  title,
  children,
  style,
}: PropsWithChildren<{
  tone?: Tone;
  icon?: LucideIcon;
  title?: string;
  style?: StyleProp<ViewStyle>;
}>) {
  const t = TONES[tone];
  const Icon = icon ?? CALLOUT_ICON[tone];
  return (
    <View
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={[styles.callout, { borderColor: t.fg, backgroundColor: t.bg }, style]}
    >
      <Icon size={18} color={t.fg} strokeWidth={2} />
      <View style={{ flex: 1, gap: 2 }}>
        {!!title && <Text style={[styles.calloutTitle, { color: t.fg }]}>{title}</Text>}
        {typeof children === 'string' ? (
          <Text variant="small" style={{ color: t.fg, lineHeight: 18 }}>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  icon?: LucideIcon;
  trailing?: ReactNode;
  error?: boolean;
};
/** Labelled input: caps label, 56px soft field, ember border + shadow while focused. */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, icon: Icon, trailing, error, style, onFocus, onBlur, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const accent = error ? colors.danger : focused ? colors.ember : null;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <Raised
        depth={accent ? 3 : 0}
        shadow={error ? colors.hardShadow : colors.emberShadow}
        radius={16}
        faceStyle={[styles.field, accent ? { borderColor: accent } : null]}
      >
        {Icon && <Icon size={20} color={accent ?? colors.dim} strokeWidth={2} />}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.dim}
          selectionColor={colors.ember}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, style]}
        />
        {trailing}
      </Raised>
    </View>
  );
});

/** Unlabelled 50px search box (Learn). */
export function SearchField({
  icon: Icon,
  style,
  ...props
}: TextInputProps & { icon: LucideIcon }) {
  return (
    <View style={styles.search}>
      <Icon size={18} color={colors.dim} strokeWidth={2} />
      <TextInput
        placeholderTextColor={colors.dim}
        selectionColor={colors.ember}
        {...props}
        style={[styles.input, { minHeight: 46, fontFamily: fonts.regular, fontSize: 14 }, style]}
      />
    </View>
  );
}

/** Evacuation scene illustration (people leaving a burning building); same artwork in light and dark mode. */
export function Diorama({
  height = 210,
  source = dioramaHero,
  style,
}: {
  height?: number;
  source?: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ height, backgroundColor: '#171B1C', overflow: 'hidden' }, style]}>
      <Image
        source={source}
        accessibilityIgnoresInvertColors
        style={{ width: '100%', height: '100%' }}
        resizeMode="cover"
      />
    </View>
  );
}

/** Row inside a list card: hex badge, title/subtitle, chevron or custom trailing. */
export function ListRow({
  icon,
  tone = 'ember',
  title,
  subtitle,
  trailing,
  onPress,
}: {
  icon: LucideIcon;
  tone?: HexTone;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <HexBadge icon={icon} tone={tone} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {!!subtitle && (
          <Text variant="small" muted>
            {subtitle}
          </Text>
        )}
      </View>
      {trailing ??
        (onPress ? <ChevronRight size={16} color={colors.dim} strokeWidth={2.5} /> : null)}
    </Pressable>
  );
}

/** Horizontal filter tabs ("Tất cả · Bài viết · Mẹo · Video"). */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filters}
      style={{ flexGrow: 0, marginHorizontal: -16 }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
          >
            <Raised
              depth={active ? 3 : 0}
              shadow={colors.emberShadow}
              radius={12}
              faceStyle={[styles.filter, active && styles.filterActive]}
            >
              <Text style={[styles.filterText, active && { color: colors.emberForeground }]}>
                {option.label}
              </Text>
            </Raised>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const COVER_TINT: Record<HexTone, string> = {
  ember: '#EE8654',
  danger: '#E5483F',
  info: '#7FB7FF',
  warning: '#F2C14E',
  success: '#5FD08A',
  neutral: '#939DA0',
  exit: '#2FBF71',
};
/** Learn cover placeholder: tone gradient fading to dark, a soft disc and a hex badge. */
export function Cover({
  icon,
  tone = 'ember',
  height,
  width,
  badge = 46,
  style,
}: {
  icon: LucideIcon;
  tone?: HexTone;
  height: number;
  width?: number;
  badge?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const id = `cover-${tone}`;
  return (
    <View
      style={[{ height, width, backgroundColor: colors.surfaceRaised, overflow: 'hidden' }, style]}
    >
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={COVER_TINT[tone]} stopOpacity={0.6} />
            <Stop offset="1" stopColor="#141719" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
        <Circle cx="85%" cy="15%" r={height * 0.6} fill={COVER_TINT[tone]} fillOpacity={0.25} />
      </Svg>
      <View style={styles.hexIcon}>
        <HexBadge icon={icon} tone={tone} size={badge} />
      </View>
    </View>
  );
}

/** Tappable status banner with a tone border and hard shadow ("1 phiên đang chờ đồng bộ"). */
export function Banner({
  tone = 'warning',
  icon,
  title,
  subtitle,
  onPress,
}: {
  tone?: Exclude<Tone, 'ember'>;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  onPress?: () => void;
}) {
  const t = TONES[tone];
  const hex: HexTone = tone;
  return (
    <Pressable
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'alert'}
      onPress={onPress}
    >
      {({ pressed }) => (
        <Raised
          depth={3}
          shadow={BANNER_SHADOW[tone]}
          radius={18}
          pressed={pressed}
          faceStyle={[styles.banner, { borderColor: t.fg, backgroundColor: t.bg }]}
        >
          <HexBadge icon={icon} tone={hex} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: t.fg }]}>{title}</Text>
            {!!subtitle && (
              <Text variant="small" muted>
                {subtitle}
              </Text>
            )}
          </View>
          {onPress && <ChevronRight size={16} color={t.fg} strokeWidth={2.5} />}
        </Raised>
      )}
    </Pressable>
  );
}
const BANNER_SHADOW: Record<Exclude<Tone, 'ember'>, string> = {
  warning: '#7A5B12',
  danger: '#7A2A2A',
  info: '#1F3F66',
  success: '#1E5A38',
};

/** Circular progress with a glowing ember arc; `value` 0..1. */
export function ProgressRing({
  value,
  size = 200,
  stroke = 22,
  color = colors.ribbon,
  children,
}: PropsWithChildren<{ value: number; size?: number; stroke?: number; color?: string }>) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.lineStrong}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c * v} ${c}`}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {children}
    </View>
  );
}

/** Small checklist row used for download steps: done / active / pending. */
export function StepRow({ label, state }: { label: string; state: 'done' | 'active' | 'pending' }) {
  return (
    <View style={styles.stepRow}>
      <View
        style={[
          styles.stepBox,
          state === 'done' && { borderColor: colors.success, backgroundColor: colors.successSoft },
          state === 'active' && { borderColor: colors.ember },
        ]}
      >
        {state === 'done' ? (
          <Check size={14} color={colors.success} strokeWidth={3} />
        ) : state === 'active' ? (
          <View style={styles.stepDot} />
        ) : null}
      </View>
      <Text
        style={[
          styles.stepLabel,
          state === 'active' && { fontFamily: fonts.extrabold, color: colors.ember },
          state === 'pending' && { color: colors.dim },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

/** Segmented "game" progress bar; `filled` may be fractional (rounded down to whole segments). */
export function Segments({
  total = 10,
  filled,
  color = colors.ribbon,
  style,
}: {
  total?: number;
  filled: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: Math.floor(filled) }}
      style={[styles.segments, style]}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.segment,
            { backgroundColor: i < Math.floor(filled) ? color : colors.lineStrong },
          ]}
        />
      ))}
    </View>
  );
}

export function BackButton({
  onPress,
  label = 'Quay lại',
  icon: Icon = ChevronLeft,
}: {
  onPress: () => void;
  label?: string;
  icon?: LucideIcon;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}
    >
      <Icon size={18} color={colors.text} strokeWidth={2.5} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    overflow: 'hidden',
  },
  ribbon: { height: 30, paddingHorizontal: 14, justifyContent: 'center' },
  ribbonText: {
    fontFamily: fonts.black,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1,
    color: colors.emberForeground,
  },
  hexIcon: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipText: { fontFamily: fonts.extrabold, fontSize: 11, lineHeight: 15 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  callout: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, borderWidth: 2 },
  calloutTitle: { fontFamily: fonts.extrabold, fontSize: 13, lineHeight: 18 },
  fieldLabel: {
    fontFamily: fonts.black,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.8,
    color: colors.muted,
  },
  field: {
    minHeight: 56,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgSoft,
    borderWidth: 2,
    borderColor: colors.lineStrong,
  },
  input: {
    flex: 1,
    minHeight: 52,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.text,
  },
  search: {
    height: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  filters: { gap: 8, paddingHorizontal: 16 },
  filter: {
    height: 38,
    paddingHorizontal: 14,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.lineStrong,
  },
  filterActive: { backgroundColor: colors.ember, borderColor: colors.bg },
  filterText: { fontFamily: fonts.extrabold, fontSize: 13, lineHeight: 18, color: colors.muted },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 2 },
  bannerTitle: { fontFamily: fonts.black, fontSize: 14, lineHeight: 19 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ember },
  stepLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 12, borderRadius: 4 },
  rowTitle: { fontFamily: fonts.extrabold, fontSize: 15, lineHeight: 20 },
  back: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
