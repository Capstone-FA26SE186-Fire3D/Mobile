import { createContext, useContext } from 'react';
import { Text as NativeText, type TextProps, StyleSheet } from 'react-native';
import { colors, fonts } from '@/theme/tokens';
export const FontsReady = createContext(false);
type Props = TextProps & {
  variant?: 'body' | 'small' | 'caption' | 'label' | 'title' | 'heading' | 'caps' | 'strong';
  muted?: boolean;
  dim?: boolean;
};
export function Text({ variant = 'body', muted, dim, style, ...props }: Props) {
  const ready = useContext(FontsReady);
  return (
    <NativeText
      {...props}
      style={[
        styles.base,
        styles[variant],
        muted && { color: colors.muted },
        dim && { color: colors.dim },
        style,
        !ready && { fontFamily: undefined },
      ]}
    />
  );
}
const styles = StyleSheet.create({
  base: { color: colors.text, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22 },
  body: {},
  small: { fontSize: 12, lineHeight: 17 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 17 },
  label: { fontFamily: fonts.extrabold, fontSize: 13, lineHeight: 18 },
  strong: { fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 22 },
  title: { fontFamily: fonts.black, fontSize: 24, lineHeight: 31 },
  heading: { fontFamily: fonts.black, fontSize: 18, lineHeight: 24 },
  // Section/field labels: uppercase Black with tracking, e.g. "NHIỆM VỤ ĐANG DỞ", "EMAIL".
  caps: {
    fontFamily: fonts.black,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.2,
    color: colors.dim,
  },
});
