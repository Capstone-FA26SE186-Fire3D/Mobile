import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import {
  cancelPlaytest,
  getPlaytest,
  reissuePlaytestGrant,
  type PlaytestStatus,
} from '@/api/playtest';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { readRecentPlaytest } from '@/features/playtest/recent-playtest';
import { useSession } from '@/store/SessionProvider';
import { colors } from '@/theme/tokens';

export default function PlaytestScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { account, signOut } = useSession();
  const [playtestId, setPlaytestId] = useState<string | null>(typeof id === 'string' ? id : null);
  const [status, setStatus] = useState<PlaytestStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!playtestId && account) void readRecentPlaytest(account.id).then(setPlaytestId);
  }, [account?.id, playtestId]);
  useEffect(() => {
    if (typeof id === 'string') setPlaytestId(id);
  }, [id]);

  async function refresh() {
    if (!playtestId) return;
    setBusy(true);
    setError('');
    try {
      setStatus(await getPlaytest(playtestId));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Không tải được playtest.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, [playtestId]);

  async function cancel() {
    if (!playtestId) return;
    setBusy(true);
    setError('');
    try {
      setStatus(await cancelPlaytest(playtestId));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Không hủy được playtest.');
    } finally {
      setBusy(false);
    }
  }

  async function reissue() {
    if (!playtestId) return;
    setBusy(true);
    setError('');
    try {
      await reissuePlaytestGrant(playtestId);
      await refresh();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Không cấp lại được grant.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <PageHeader title="Playtest tổ chức" />
      <Text muted>
        Chỉ playtest đã được bàn giao từ Web bằng cùng tài khoản OrganizationUser xuất hiện ở đây.
      </Text>
      {busy && <ActivityIndicator color={colors.primary} />}
      {!!error && <Notice error>{error}</Notice>}
      {!playtestId && (
        <Notice>Chưa có handoff playtest trên thiết bị này. Mở link từ Web để nhận.</Notice>
      )}
      {status && (
        <View style={{ gap: 12 }}>
          <Text variant="heading">Trạng thái: {status.status}</Text>
          <Text>Package: {status.package.manifestHash}</Text>
          {status.grant && (
            <Text muted>
              Grant thế hệ {status.grant.generation}, hết hạn{' '}
              {new Date(status.grant.expiresAt).toLocaleString('vi-VN')}.
            </Text>
          )}
          {!status.launchSession && (
            <Notice error>Phiên đăng nhập này không có quyền mở hoặc đồng bộ playtest.</Notice>
          )}
          {status.recovery.canStart && (
            <Notice>
              Chờ BE cấp URL tải manifest và từng file package trước khi mở Unity. Mobile chưa tiêu
              hao lượt Trial.
            </Notice>
          )}
          {status.recovery.canReissueGrant && status.launchSession && (
            <Button
              title="Cấp lại grant"
              disabled={busy}
              variant="secondary"
              onPress={() => void reissue()}
            />
          )}
          {status.recovery.canCancel && (
            <Button
              title="Hủy playtest"
              disabled={busy}
              variant="secondary"
              onPress={() => void cancel()}
            />
          )}
          <Button title="Cập nhật trạng thái" disabled={busy} onPress={() => void refresh()} />
        </View>
      )}
      <Button title="Đăng xuất" variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}
