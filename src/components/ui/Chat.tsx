import type { ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { ArrowUpRight } from 'lucide-react-native';
import { colors, fonts } from '@/theme/tokens';
import { Raised } from './Game';
import { Text } from './Text';

/** Chat bubble: own messages ember-tinted on the right, others surface on the left. */
export function Bubble({ mine, children }: { mine?: boolean; children: ReactNode }) {
  return (
    <View style={[styles.row, mine && { justifyContent: 'flex-end' }]}>
      <Raised
        depth={3}
        radius={18}
        style={{ maxWidth: '80%' }}
        faceStyle={[styles.bubble, mine && styles.mine]}
      >
        {typeof children === 'string' ? <Text style={styles.text}>{children}</Text> : children}
      </Raised>
    </View>
  );
}

/** Bottom composer: soft field with a raised ember send button and an optional footnote. */
export function Composer({
  value,
  onChangeText,
  onSend,
  canSend,
  busy,
  label,
  sendLabel = 'Gửi',
  footnote,
  ...input
}: TextInputProps & {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  busy?: boolean;
  label: string;
  sendLabel?: string;
  footnote?: string;
}) {
  return (
    <View style={styles.composer}>
      <View style={styles.inputRow}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          multiline
          placeholderTextColor={colors.dim}
          selectionColor={colors.ember}
          {...input}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sendLabel}
          accessibilityState={{ disabled: !canSend, busy }}
          disabled={!canSend}
          onPress={onSend}
          style={!canSend && { opacity: 0.45 }}
        >
          {({ pressed }) => (
            <Raised
              depth={3}
              shadow={colors.emberShadow}
              radius={14}
              pressed={pressed}
              faceStyle={styles.send}
            >
              <ArrowUpRight size={18} color={colors.emberForeground} strokeWidth={2.5} />
            </Raised>
          )}
        </Pressable>
      </View>
      {!!footnote && <Text style={styles.footnote}>{footnote}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  bubble: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  mine: { borderColor: colors.ember, backgroundColor: colors.emberSoft },
  text: { fontSize: 14, lineHeight: 21 },
  composer: {
    gap: 6,
    padding: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 2,
    borderColor: colors.lineStrong,
  },
  inputRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bgSoft,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    paddingVertical: 12,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  send: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ember,
  },
  footnote: { fontSize: 10, lineHeight: 14, textAlign: 'center', color: colors.dim },
});
