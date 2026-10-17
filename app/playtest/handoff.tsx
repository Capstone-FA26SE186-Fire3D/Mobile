import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { redeemPlaytestHandoff } from '@/api/playtest';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { validHandoffCode } from '@/features/playtest/pending-handoff';
import { saveRecentPlaytest } from '@/features/playtest/recent-playtest';
import { useSession } from '@/store/SessionProvider';
import { colors } from '@/theme/tokens';

export default function PlaytestHandoffScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const valid = typeof code === 'string' && validHandoffCode(code);
  const { account, setPendingHandoffCode, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!valid || account?.role !== 'OrganizationUser') return;
    let active = true;
    setBusy(true);
    redeemPlaytestHandoff(code)
      .then(async (status) => {
        if (!active) return;
        await saveRecentPlaytest(account.id, status.id);
        await setPendingHandoffCode(null);
        router.replace({ pathname: '/playtest', params: { id: status.id } });
      })
      .catch((issue) => {
        if (active)
          setError(issue instanceof Error ? issue.message : 'Không nhận được handoff playtest.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [valid, code, account?.id, account?.role, setPendingHandoffCode, attempt]);

  async function login() {
    if (!valid) return;
    await setPendingHandoffCode(code);
    router.push('/login');
  }

  return (
    <Screen>
      <PageHeader title="Nhận playtest" onBack={() => router.back()} />
      {!valid ? (
        <Notice error>Link handoff không hợp lệ hoặc thiếu mã.</Notice>
      ) : !account ? (
        <>
          <Text>Đăng nhập bằng tài khoản OrganizationUser đã tạo playtest để tiếp tục.</Text>
          <Button title="Đăng nhập và nhận playtest" onPress={() => void login()} />
        </>
      ) : account.role !== 'OrganizationUser' ? (
        <>
          <Notice error>
            Handoff này chỉ dành cho OrganizationUser. Hãy đăng nhập đúng tài khoản.
          </Notice>
          <Button
            title="Đổi tài khoản"
            onPress={() => void setPendingHandoffCode(code).then(signOut)}
          />
        </>
      ) : (
        <>
          {busy && <ActivityIndicator color={colors.primary} />}
          {!!error && <Notice error>{error}</Notice>}
          {!!error && <Button title="Thử lại" onPress={() => setAttempt((value) => value + 1)} />}
        </>
      )}
    </Screen>
  );
}
