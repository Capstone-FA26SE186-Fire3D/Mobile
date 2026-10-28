import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowUpRight, Eye, EyeOff, Lock, MessageSquare } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Diorama, Field, Ribbon } from '@/components/ui/Game';
import { Notice } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/api';
import { useSession } from '@/store/SessionProvider';
import { colors, fonts } from '@/theme/tokens';
const dioramaLogin = require('../../../../assets/images/login-evacuation.png');

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.payload?.code === 'ACCOUNT_LINK_REQUIRED')
      return 'Email này đã có tài khoản FET3D. Hãy đăng nhập bằng mật khẩu, rồi liên kết Google trong Cài đặt tài khoản.';
    if (error.status === 401) return 'Email hoặc mật khẩu không đúng.';
    return `Không đăng nhập được (HTTP ${error.status}).${error.payload?.traceId ? ` Mã tra cứu: ${error.payload.traceId}.` : ''}`;
  }
  return error instanceof Error
    ? error.message
    : 'Không kết nối được máy chủ FET3D. Kiểm tra mạng rồi thử lại.';
}

export default function LoginScreen() {
  const { signInWithPassword, signInWithGoogle } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function passwordLogin() {
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) {
      setError('Hãy nhập email và mật khẩu hợp lệ.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await signInWithPassword(email.trim().toLowerCase(), password);
    } catch (issue) {
      setError(describe(issue));
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await signInWithGoogle();
      if (result === 'onboarding') router.push('/google-onboarding');
    } catch (issue) {
      setError(describe(issue));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
          bounces={false}
        >
          <Diorama source={dioramaLogin} />
          <View style={styles.form}>
            <Ribbon label="Đăng nhập" />
            <Text variant="title" accessibilityRole="header">
              Chào mừng trở lại!
            </Text>
            <Field
              label="Email"
              icon={MessageSquare}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              placeholder="ban@vidu.com"
            />
            <Field
              label="Mật khẩu"
              icon={Lock}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="current-password"
              placeholder="Mật khẩu"
              onSubmitEditing={() => void passwordLogin()}
              trailing={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  hitSlop={10}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff size={18} color={colors.dim} strokeWidth={2} />
                  ) : (
                    <Eye size={18} color={colors.dim} strokeWidth={2} />
                  )}
                </Pressable>
              }
            />
            <Button
              title="Quên mật khẩu?"
              variant="ghost"
              disabled={busy}
              style={{ alignSelf: 'flex-end' }}
              onPress={() => router.push('/forgot-password')}
            />
            {!!error && <Notice error>{error}</Notice>}
            <Button
              title="Vào game"
              icon={ArrowUpRight}
              loading={busy}
              onPress={() => void passwordLogin()}
            />
            {Platform.OS === 'android' && (
              <Button
                title="Tiếp tục với Google"
                variant="secondary"
                size="sm"
                disabled={busy}
                onPress={() => void googleLogin()}
              />
            )}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              accessibilityLabel="Chưa có tài khoản? Đăng ký"
              onPress={() => router.push('/register')}
              style={styles.linkRow}
            >
              <Text muted style={{ fontSize: 13 }}>
                Chưa có tài khoản?
              </Text>
              <Text style={styles.link}>Đăng ký</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => router.push('/learn')}
              style={styles.linkRow}
            >
              <Text style={styles.guest}>Xem Learn không cần đăng nhập</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  form: {
    flex: 1,
    padding: 22,
    gap: 14,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: colors.lineStrong,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  linkRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 2 },
  link: { fontFamily: fonts.black, fontSize: 13, lineHeight: 18, color: colors.ember },
  guest: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 17, color: colors.dim },
});
