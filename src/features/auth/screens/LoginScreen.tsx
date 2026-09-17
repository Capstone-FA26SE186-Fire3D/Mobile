import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/ui/Text';
import { Brand, Button, IconButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Screen';
import { colors, fonts } from '@/theme/tokens';
import { BuildingArt } from '@/features/buildings/components/BuildingArt';
import { useDemo } from '@/store/DemoProvider';
import { DEMO_EMAIL, DEMO_PASSWORD, validateDemoLogin } from '@/store/demo.model';

export default function LoginScreen() {
  const { signIn, reduceMotion } = useDemo();
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [show, setShow] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [keyboard, setKeyboard] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useSharedValue(0);
  useEffect(() => {
    const open = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const close = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => {
      open.remove();
      close.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const formStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ translateY: progress.value * 18 }],
  }));
  const artStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - progress.value * 0.18 }, { translateY: -progress.value * 24 }],
  }));
  function login(demo = false) {
    if (busy) return;
    const issue = validateDemoLogin(demo ? DEMO_EMAIL : email, demo ? DEMO_PASSWORD : password);
    if (issue) {
      setError(issue);
      return;
    }
    setError('');
    setBusy(true);
    Keyboard.dismiss();
    progress.value = withTiming(1, {
      duration: reduceMotion ? 0 : 450,
      easing: Easing.out(Easing.cubic),
    });
    timer.current = setTimeout(signIn, reduceMotion ? 0 : 460);
  }
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={styles.top}>
            <Brand />
            <View style={styles.demo}>
              <Text variant="small">BẢN TRẢI NGHIỆM</Text>
            </View>
          </View>
          {!keyboard && (
            <Animated.View style={[styles.hero, artStyle]}>
              <LinearGradient colors={['#E4E9D7', '#F7F3EA']} style={styles.halo} />
              <View style={styles.orbit} />
              <BuildingArt style={styles.building} />
              <View style={styles.floatTag}>
                <Ionicons name="shield-checkmark" size={17} color={colors.green} />
                <Text variant="small">Học kỹ năng. Thêm chủ động.</Text>
              </View>
            </Animated.View>
          )}
          <Animated.View style={[styles.form, formStyle]}>
            <View style={styles.intro}>
              <Text variant="title">Một lần làm quen.{'\n'}Thêm phần chủ động.</Text>
              <Text muted>
                Đăng nhập để khám phá tòa nhà và bắt đầu hành trình tập huấn của bạn.
              </Text>
            </View>
            <View style={styles.field}>
              <Text variant="label">Email</Text>
              <View style={styles.inputRow}>
                <Ionicons name="mail-outline" size={20} color={colors.muted} />
                <TextInput
                  accessibilityLabel="Email"
                  placeholder="ban@example.com"
                  placeholderTextColor={colors.muted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  style={styles.input}
                />
              </View>
            </View>
            <View style={styles.field}>
              <Text variant="label">Mật khẩu</Text>
              <View style={styles.inputRow}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.muted} />
                <TextInput
                  accessibilityLabel="Mật khẩu"
                  placeholder="Nhập mật khẩu"
                  placeholderTextColor={colors.muted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!show}
                  autoCapitalize="none"
                  autoComplete="off"
                  style={styles.input}
                  onSubmitEditing={() => login()}
                />
                <IconButton
                  name={show ? 'eye-off-outline' : 'eye-outline'}
                  label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  onPress={() => setShow(!show)}
                />
              </View>
            </View>
            {!!error && <Notice error>{error}</Notice>}
            <Button title="Đăng nhập" loading={busy} onPress={() => login()} />
            <View style={styles.divider}>
              <View style={styles.line} />
              <Text variant="small" muted>
                CHƯA CẦN TÀI KHOẢN THẬT
              </Text>
              <View style={styles.line} />
            </View>
            <Button
              title="Khám phá bản trải nghiệm"
              variant="secondary"
              icon="sparkles-outline"
              disabled={busy}
              onPress={() => login(true)}
            />
            <Text variant="small" muted style={styles.footnote}>
              Tài khoản mẫu: {DEMO_EMAIL} · {DEMO_PASSWORD}
              {'\n'}Chỉ dùng dữ liệu mẫu, không nhập mật khẩu thật.
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: 26,
    paddingTop: 18,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  demo: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hero: { height: 250, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  halo: { position: 'absolute', height: 206, width: 270, borderRadius: 120, top: 27 },
  orbit: {
    position: 'absolute',
    width: 290,
    height: 95,
    borderRadius: 150,
    borderWidth: 1,
    borderColor: '#D3D9C8',
    bottom: 16,
    transform: [{ rotate: '-9deg' }],
  },
  building: { width: 238, height: 238 },
  floatTag: {
    position: 'absolute',
    bottom: 4,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 30,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  form: { gap: 16 },
  intro: { gap: 8, marginTop: 13, marginBottom: 4 },
  field: { gap: 7 },
  inputRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 4,
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D5D2C9',
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
  },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  footnote: { textAlign: 'center', fontSize: 10, lineHeight: 17 },
});
