import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brand, Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ApiError } from '@/api';
import { useSession } from '@/store/SessionProvider';
import { colors, fonts } from '@/theme/tokens';

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.payload?.code === 'ACCOUNT_LINK_REQUIRED')
      return 'Email này đã có tài khoản Fire3D. Hãy đăng nhập bằng mật khẩu, rồi liên kết Google trong Cài đặt tài khoản.';
    if (error.status === 401) return 'Email hoặc mật khẩu không đúng.';
    return `Không đăng nhập được (HTTP ${error.status}).${error.payload?.traceId ? ` Mã tra cứu: ${error.payload.traceId}.` : ''}`;
  }
  return error instanceof Error ? error.message : 'Không kết nối được Fire3D API.';
}

export default function LoginScreen() {
  const { signInWithPassword, signInWithGoogle } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Brand />
        <View style={styles.heading}>
          <Text variant="title">Đăng nhập Fire3D</Text>
          <Text muted>Dành cho tài khoản Trainee.</Text>
        </View>
        <Text variant="label">Email</Text>
        <TextInput
          accessibilityLabel="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          style={styles.input}
          placeholder="ban@example.com"
        />
        <Text variant="label">Mật khẩu</Text>
        <TextInput
          accessibilityLabel="Mật khẩu"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          style={styles.input}
          placeholder="Mật khẩu"
        />
        {!!error && <Notice error>{error}</Notice>}
        <Button title="Đăng nhập" loading={busy} onPress={() => void passwordLogin()} />
        {Platform.OS === 'android' && (
          <Button
            title="Đăng nhập với Google"
            icon="logo-google"
            variant="secondary"
            disabled={busy}
            onPress={() => void googleLogin()}
          />
        )}
        <Button
          title="Quên mật khẩu?"
          variant="ghost"
          disabled={busy}
          onPress={() => router.push('/forgot-password')}
        />
        <Button
          title="Chưa có tài khoản? Đăng ký"
          variant="ghost"
          disabled={busy}
          onPress={() => router.push('/register')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    padding: 24,
    gap: 12,
    justifyContent: 'center',
  },
  heading: { gap: 6, marginVertical: 20 },
  input: {
    minHeight: 54,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    fontFamily: fonts.regular,
    color: colors.ink,
  },
});
