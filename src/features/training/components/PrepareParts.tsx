import { Pressable, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { HexBadge, Raised, Segments } from '@/components/ui/Game';
import { Text } from '@/components/ui/Text';
import { colors, fonts } from '@/theme/tokens';
import { MODE_UI } from '../mode-ui';
import type { TrainingMode } from '../session-contract';

const STEPS = ['CHẾ ĐỘ', 'TẢI GÓI', 'BẮT ĐẦU'];

/** Preparation progress: Chế độ · Tải gói · Bắt đầu (step 1 has no labels in Figma). */
export function PrepareSteps({ step }: { step: 1 | 2 | 3 }) {
  if (step === 1) return <Segments total={3} filled={1} />;
  return (
    <View style={{ gap: 6 }}>
      <Segments total={3} filled={step} style={{ width: 100 }} />
      <View style={styles.labels}>
        {STEPS.map((label, i) => (
          <Text
            key={label}
            style={[
              styles.label,
              { textAlign: i === 0 ? 'left' : i === 1 ? 'center' : 'right' },
              { color: i + 1 === step ? colors.ember : i + 1 < step ? colors.text : colors.dim },
            ]}
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function ModeCard({
  mode,
  selected,
  disabled,
  onPress,
}: {
  mode: TrainingMode;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const ui = MODE_UI[mode];
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={ui.title}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={disabled && !selected ? { opacity: 0.5 } : undefined}
    >
      {({ pressed }) => (
        <Raised
          depth={selected ? 5 : 4}
          shadow={selected ? colors.emberShadow : colors.hardShadow}
          radius={20}
          pressed={pressed}
          faceStyle={[styles.mode, selected && styles.modeOn]}
        >
          <HexBadge icon={ui.icon} tone={ui.tone} size={64} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.modeTitle}>{ui.title}</Text>
            <Text variant="small" muted>
              {ui.description}
            </Text>
          </View>
          <View style={[styles.radio, selected && styles.radioOn]}>
            {selected && <Check size={16} color={colors.emberForeground} strokeWidth={3} />}
          </View>
        </Raised>
      )}
    </Pressable>
  );
}

/** Key/value rows on a game card (Nhiệm vụ · Chế độ · Tòa nhà · Dung lượng). */
export function SummaryRows({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <>
      {rows
        .filter(([, value]) => !!value)
        .map(([key, value]) => (
          <View key={key} style={styles.summary}>
            <Text muted style={{ flex: 1, fontSize: 13 }}>
              {key}
            </Text>
            <Text style={styles.summaryValue} numberOfLines={1}>
              {value}
            </Text>
          </View>
        ))}
    </>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row' },
  label: { flex: 1, fontFamily: fonts.black, fontSize: 10, lineHeight: 14, letterSpacing: 1 },
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  modeOn: { borderColor: colors.ember, backgroundColor: colors.emberSoft },
  modeTitle: { fontFamily: fonts.black, fontSize: 20, lineHeight: 26 },
  radio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.ember, borderColor: colors.ember },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryValue: { fontFamily: fonts.extrabold, fontSize: 13, lineHeight: 18, maxWidth: '60%' },
});
