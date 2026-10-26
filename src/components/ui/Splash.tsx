import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { colors, fonts } from '@/theme/tokens';
import { Brand } from './Button';
import { Diorama, Segments } from './Game';
import { Text } from './Text';
const dioramaTower = require('../../../assets/images/diorama-splash.png');

/** Start-up screen (Figma "Mobile · Splash"): tall diorama, brand, tagline, looping segment loader. */
export function Splash() {
  const [step, setStep] = useState(5);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!reduce) timer = setInterval(() => setStep((s) => (s % 8) + 1), 260);
    });
    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);
  return (
    <View style={styles.root} accessibilityLabel="Đang mở FET3D">
      <Diorama source={dioramaTower} height={undefined} style={styles.diorama} />
      <View style={styles.block}>
        <Brand size="lg" />
        <Text style={styles.tagline}>Luyện thoát hiểm trong{'\n'}chính tòa nhà của bạn</Text>
        <Segments total={8} filled={step} style={{ width: 180 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  diorama: { flex: 1, maxHeight: 560 },
  block: { alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, minHeight: 256 },
  tagline: {
    fontFamily: fonts.extrabold,
    fontSize: 19,
    lineHeight: 27,
    textAlign: 'center',
  },
});
