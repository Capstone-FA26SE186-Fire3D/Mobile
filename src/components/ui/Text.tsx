import { createContext, useContext } from 'react';
import { Text as NativeText, type TextProps, StyleSheet } from 'react-native';
import { colors, fonts } from '@/theme/tokens';
export const FontsReady = createContext(false);
type Props = TextProps & {
  variant?: 'body' | 'small' | 'label' | 'title' | 'heading';
  muted?: boolean;
};
export function Text({ variant = 'body', muted, style, ...props }: Props) {
  const ready = useContext(FontsReady);
  return (
    <NativeText
      {...props}
      style={[
        styles.base,
        styles[variant],
        !ready && { fontFamily: undefined },
        muted && { color: colors.muted },
        style,
      ]}
    />
  );
}
const styles = StyleSheet.create({
  base: { color: colors.ink, fontFamily: fonts.regular, fontSize: 15, lineHeight: 23 },
  body: {},
  small: { fontSize: 12, lineHeight: 19 },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 21 },
  title: { fontFamily: fonts.bold, fontSize: 29, lineHeight: 39, letterSpacing: -1 },
  heading: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 29, letterSpacing: -0.5 },
});
