import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Keyboard, StyleSheet, TextInput } from 'react-native';
import { resetPassword } from '@/api/auth';
import { ApiError } from '@/api';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors, fonts } from '@/theme/tokens';
import { useDemo } from '@/store/DemoProvider';

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const { signOut } = useDemo();
  const token = typeof params.token === 'string' ? params.token : '';
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const validToken = /^[a-f0-9]{64}$/i.test(token);

  async function submit() {
    if (busy || !validToken) return;
    if (password.length < 12 || password.length > 128 || !password.trim()) {
      setError('Mật khẩu mới cần từ 12 đến 128 ký tự và không chỉ gồm khoảng trắng.');
      return;
    }
    if (password !== confirmed) {
      setError('Mật khẩu xác nhận chưa khớp.');
      return;
    }
    setBusy(true);
    setError('');
    Keyboard.dismiss();
    try {
      await resetPassword(token, password);
      await signOut();
      setPassword('');
      setConfirmed('');
      setDone(true);
    } catch (issue) {
      setError(
        issue instanceof ApiError && [400, 409].includes(issue.status)
          ? 'Liên kết đặt lại mật khẩu không hợp lệ, đã hết hạn hoặc đã dùng.'
          : issue instanceof ApiError
            ? `Chưa đặt lại được mật khẩu (HTTP ${issue.status}).`
            : 'Không kết nối được Fire3D API.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <PageHeader title="Đặt lại mật khẩu" onBack={() => router.replace('/login')} />
      {done ? (
        <Notice>Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.</Notice>
      ) : validToken ? (
        <>
          <Text muted>Nhập mật khẩu mới cho tài khoản Fire3D.</Text>
          <TextInput
            accessibilityLabel="Mật khẩu mới"
            placeholder="Mật khẩu mới, từ 12 ký tự"
            placeholderTextColor={colors.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
          />
          <TextInput
            accessibilityLabel="Xác nhận mật khẩu mới"
            placeholder="Xác nhận mật khẩu mới"
            placeholderTextColor={colors.muted}
            value={confirmed}
            onChangeText={setConfirmed}
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
          />
          <Button title="Lưu mật khẩu mới" loading={busy} onPress={() => void submit()} />
        </>
      ) : (
        <Notice error>Liên kết đặt lại mật khẩu thiếu mã hợp lệ.</Notice>
      )}
      {!!error && <Notice error>{error}</Notice>}
      <Button title="Về đăng nhập" variant="secondary" onPress={() => router.replace('/login')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    fontFamily: fonts.regular,
    color: colors.ink,
  },
});
