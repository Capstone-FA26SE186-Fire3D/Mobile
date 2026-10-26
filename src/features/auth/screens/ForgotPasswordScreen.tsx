import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Platform } from 'react-native';
import { ArrowUpRight, MessageSquare } from 'lucide-react-native';
import { requestPasswordReset } from '@/api/auth';
import { ApiError } from '@/api';
import { Button } from '@/components/ui/Button';
import { Callout, Field } from '@/components/ui/Game';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (busy) return;
    const normalized = email.trim().toLowerCase();
    if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }
    setBusy(true);
    setError('');
    Keyboard.dismiss();
    try {
      await requestPasswordReset(normalized);
      setDone(true);
    } catch (issue) {
      if (issue instanceof ApiError && issue.status === 429)
        setError('Bạn thử quá nhiều lần. Vui lòng đợi rồi thử lại.');
      else if (issue instanceof ApiError && issue.status >= 500)
        setError(`Dịch vụ đặt lại mật khẩu đang gián đoạn (HTTP ${issue.status}).`);
      else setError('Chưa gửi được yêu cầu. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        footer={
          done ? (
            <Button
              title="Quay về đăng nhập"
              icon={ArrowUpRight}
              onPress={() => router.replace('/login')}
            />
          ) : (
            <Button
              title="Gửi liên kết"
              icon={ArrowUpRight}
              loading={busy}
              onPress={() => void submit()}
            />
          )
        }
      >
        <PageHeader title="Quên mật khẩu" onBack={() => router.replace('/login')} />
        {done ? (
          <Callout tone="success" title="Đã nhận yêu cầu">
            Nếu tài khoản đủ điều kiện, liên kết đặt lại mật khẩu sẽ được gửi tới email. Việc nhận
            yêu cầu chưa bảo đảm email đã được gửi; hãy kiểm tra cả mục spam.
          </Callout>
        ) : (
          <>
            <Text muted>Nhập email, chúng tôi gửi liên kết đặt lại mật khẩu.</Text>
            <Field
              label="Email"
              icon={MessageSquare}
              placeholder="ban@vidu.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              onSubmitEditing={() => void submit()}
            />
            <Callout tone="info">
              Nếu email tồn tại, liên kết sẽ được gửi ngay. Vì bảo mật chúng tôi không xác nhận
              email có trong hệ thống hay không.
            </Callout>
            {!!error && <Notice error>{error}</Notice>}
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
