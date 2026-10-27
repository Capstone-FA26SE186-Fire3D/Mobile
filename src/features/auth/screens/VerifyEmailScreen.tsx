import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowUpRight, Check, MessageSquare } from 'lucide-react-native';
import { verifyEmail } from '@/api/auth';
import { ApiError } from '@/api';
import { Button } from '@/components/ui/Button';
import { HexBadge } from '@/components/ui/Game';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSession } from '@/store/SessionProvider';

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const { account, refreshAccount } = useSession();
  const token = typeof params.token === 'string' ? params.token : '';
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const validToken = /^[a-f0-9]{64}$/i.test(token);

  async function submit() {
    if (busy || !validToken) return;
    setBusy(true);
    setError('');
    try {
      await verifyEmail(token);
      if (account) await refreshAccount().catch(() => {});
      setDone(true);
    } catch (issue) {
      setError(
        issue instanceof ApiError && issue.status === 400
          ? 'Liên kết xác minh không hợp lệ, đã hết hạn hoặc đã dùng.'
          : issue instanceof ApiError
            ? `Chưa xác minh được email (HTTP ${issue.status}).`
            : 'Không kết nối được máy chủ FET3D. Kiểm tra mạng rồi thử lại.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        validToken && !done ? (
          <Button
            title="Xác minh email"
            icon={Check}
            loading={busy}
            onPress={() => void submit()}
          />
        ) : (
          <Button
            title={account ? 'Về trang chủ' : 'Về đăng nhập'}
            icon={ArrowUpRight}
            onPress={() => router.replace(account ? '/' : '/login')}
          />
        )
      }
    >
      <PageHeader title="Xác minh email" onBack={() => router.replace('/')} />
      <HexBadge icon={done ? Check : MessageSquare} tone={done ? 'exit' : 'info'} size={96} />
      {done ? (
        <Text variant="title">Email đã được xác minh</Text>
      ) : validToken ? (
        <Text muted>Nhấn xác minh để hoàn tất đăng ký tài khoản.</Text>
      ) : (
        <Notice error>Liên kết xác minh thiếu mã hợp lệ.</Notice>
      )}
      {!!error && <Notice error>{error}</Notice>}
    </Screen>
  );
}
