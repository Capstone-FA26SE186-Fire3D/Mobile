import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Platform } from 'react-native';
import { ArrowUpRight, Check, Lock } from 'lucide-react-native';
import { resetPassword } from '@/api/auth';
import { ApiError } from '@/api';
import { Button } from '@/components/ui/Button';
import { PasswordStrength } from '@/components/ui/Form';
import { Callout, Field } from '@/components/ui/Game';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSession } from '@/store/SessionProvider';

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const { clearLocal } = useSession();
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
      await clearLocal();
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

  const toLogin = () => router.replace('/login');
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        footer={
          validToken && !done ? (
            <Button
              title="Lưu mật khẩu mới"
              icon={Check}
              loading={busy}
              onPress={() => void submit()}
            />
          ) : (
            <Button title="Về đăng nhập" icon={ArrowUpRight} onPress={toLogin} />
          )
        }
      >
        <PageHeader title="Đặt lại mật khẩu" onBack={toLogin} />
        {done ? (
          <Callout tone="success" title="Đã đặt lại mật khẩu">
            Hãy đăng nhập bằng mật khẩu mới.
          </Callout>
        ) : validToken ? (
          <>
            <Text muted>Nhập mật khẩu mới cho tài khoản FET3D.</Text>
            <Field
              label="Mật khẩu mới"
              icon={Lock}
              placeholder="Từ 12 đến 128 ký tự"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
            />
            <PasswordStrength password={password} />
            <Field
              label="Xác nhận mật khẩu mới"
              icon={Lock}
              placeholder="Nhập lại mật khẩu"
              value={confirmed}
              onChangeText={setConfirmed}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              onSubmitEditing={() => void submit()}
            />
          </>
        ) : (
          <Notice error>Liên kết đặt lại mật khẩu thiếu mã hợp lệ.</Notice>
        )}
        {!!error && <Notice error>{error}</Notice>}
      </Screen>
    </KeyboardAvoidingView>
  );
}
