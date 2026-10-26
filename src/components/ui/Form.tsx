import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { colors, fonts } from '@/theme/tokens';
import { Raised, Segments } from './Game';
import { Text } from './Text';

/** Six boxes over one hidden input (keeps paste and SMS autofill working). */
export function OtpInput({
  value,
  onChange,
  onSubmit,
  length = 6,
  label = 'Mã xác minh',
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  length?: number;
  label?: string;
}) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable accessible={false} onPress={() => input.current?.focus()} style={styles.otpRow}>
      {Array.from({ length }, (_, i) => {
        const active = focused && i === Math.min(value.length, length - 1);
        return (
          <Raised
            key={i}
            depth={active ? 3 : 0}
            shadow={colors.emberShadow}
            radius={16}
            faceStyle={[styles.otpBox, active && { borderColor: colors.ember }]}
          >
            <Text style={styles.otpDigit}>{value[i] ?? ''}</Text>
          </Raised>
        );
      })}
      <TextInput
        ref={input}
        accessibilityLabel={label}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmit}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={length}
        autoFocus
        caretHidden
        style={styles.otpHidden}
      />
    </Pressable>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={children}
      onPress={() => onChange(!checked)}
      style={styles.checkRow}
    >
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked && <Check size={14} color={colors.emberForeground} strokeWidth={3} />}
      </View>
      <Text variant="small" muted style={{ flex: 1, lineHeight: 18 }}>
        {children}
      </Text>
    </Pressable>
  );
}

/** Field-styled picker opening a sheet of options. */
export function SelectField<T>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Chọn',
}: {
  label: string;
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder}`}
        onPress={() => setOpen(true)}
        style={styles.select}
      >
        <Text style={[styles.selectText, !current && { color: colors.dim }]} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <ChevronDown size={18} color={colors.dim} strokeWidth={2.25} />
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.label}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={[styles.option, selected && styles.optionOn]}
                >
                  <Text style={[styles.optionText, selected && { color: colors.ember }]}>
                    {option.label}
                  </Text>
                  {selected && <Check size={18} color={colors.ember} strokeWidth={2.5} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Rough strength hint for the 12+ character rule; BE still validates the password. */
export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  const score =
    password.length < 12
      ? 1
      : Math.min(4, 1 + (password.length >= 16 ? 1 : 0) + Math.min(2, classes - 1));
  const look =
    score <= 1
      ? { label: 'yếu', color: colors.danger, fill: colors.hex.danger }
      : score === 2
        ? { label: 'trung bình', color: colors.warning, fill: colors.hex.warning }
        : {
            label: score === 3 ? 'tốt' : 'rất tốt',
            color: colors.success,
            fill: colors.hex.success,
          };
  return (
    <View style={{ gap: 8 }}>
      <Segments total={4} filled={score} color={look.fill} />
      <Text style={[styles.strength, { color: look.color }]}>
        Độ mạnh: {look.label} · tối thiểu 12 ký tự
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  otpBox: {
    width: 48,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSoft,
    borderWidth: 2,
    borderColor: colors.lineStrong,
  },
  otpDigit: { fontFamily: fonts.black, fontSize: 26, lineHeight: 34 },
  otpHidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.ember, borderColor: colors.bg },
  label: {
    fontFamily: fonts.black,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.8,
    color: colors.muted,
  },
  select: {
    minHeight: 56,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bgSoft,
  },
  selectText: { flex: 1, fontFamily: fonts.medium, fontSize: 15, lineHeight: 20 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    gap: 8,
    padding: 20,
    paddingBottom: 32,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  sheetTitle: { fontFamily: fonts.black, fontSize: 17, lineHeight: 23, marginBottom: 4 },
  option: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bgSoft,
  },
  optionOn: { borderColor: colors.ember, backgroundColor: colors.emberSoft },
  optionText: { flex: 1, fontFamily: fonts.extrabold, fontSize: 15, lineHeight: 20 },
  strength: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
});
