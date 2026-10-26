import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowUpRight, RefreshCw, ScanLine, User, X } from 'lucide-react-native';
import { redeemPlaytestHandoff } from '@/api/playtest';
import { Button } from '@/components/ui/Button';
import { StateScreen } from '@/components/ui/StateScreen';
import { validHandoffCode } from '@/features/playtest/pending-handoff';
import { describePlaytestProblem, handoffView } from '@/features/playtest/playtest-flow';
import { saveRecentPlaytest } from '@/features/playtest/recent-playtest';
import { useSession } from '@/store/SessionProvider';

export default function PlaytestHandoffScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const valid = typeof code === 'string' && validHandoffCode(code);
  const { account, setPendingHandoffCode, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const view = handoffView(valid, account);

  useEffect(() => {
    if (view !== 'redeem' || !account) return;
    let active = true;
    setBusy(true);
    setError('');
    redeemPlaytestHandoff(code)
      .then(async (status) => {
        if (!active) return;
        await saveRecentPlaytest(account.id, status.id);
        await setPendingHandoffCode(null);
        router.replace({ pathname: '/playtest', params: { id: status.id } });
      })
      .catch((issue) => {
        if (active) setError(describePlaytestProblem(issue, 'Không nhận được handoff playtest.'));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [view, code, account?.id, setPendingHandoffCode, attempt]);

  async function login() {
    if (!valid) return;
    await setPendingHandoffCode(code);
    router.push('/login');
  }

  const rescan = () => router.replace('/scan-qr');
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (view === 'login')
    return (
      <StateScreen
        icon={User}
        tone="info"
        ribbon="Cần đăng nhập"
        title="Đăng nhập để nhận playtest"
        body="Dùng tài khoản tổ chức (OrganizationUser) đã tạo playtest trên Web."
        actions={
          <Button
            title="Đăng nhập và nhận playtest"
            icon={ArrowUpRight}
            onPress={() => void login()}
          />
        }
      />
    );
  if (view === 'wrong-role')
    return (
      <StateScreen
        icon={User}
        tone="warning"
        ribbon="Sai loại tài khoản"
        title="Playtest chỉ dành cho tài khoản tổ chức"
        body="Bạn đang đăng nhập bằng tài khoản học viên. Hãy đổi sang tài khoản OrganizationUser đã tạo playtest."
        actions={
          <>
            <Button
              title="Đổi tài khoản"
              onPress={() => void setPendingHandoffCode(code).then(signOut)}
            />
            <Button title="Hủy" variant="secondary" size="sm" onPress={leave} />
          </>
        }
      />
    );
  if (view === 'invalid' || (!!error && !busy))
    return (
      <StateScreen
        icon={X}
        tone="danger"
        ribbon="Mã không hợp lệ"
        title="Mã bàn giao đã dùng, hết hạn hoặc bị thu hồi"
        body={
          view === 'invalid'
            ? 'Liên kết bàn giao không hợp lệ hoặc thiếu mã. Hãy tạo mã mới trên Web rồi quét lại.'
            : `${error} Mã chỉ dùng được một lần trong 5 phút.`
        }
        actions={
          <>
            <Button title="Quét mã khác" icon={ScanLine} onPress={rescan} />
            {view === 'redeem' && (
              <Button
                title="Thử lại"
                variant="secondary"
                size="sm"
                onPress={() => setAttempt((value) => value + 1)}
              />
            )}
            <Button title="Đăng xuất" variant="ghost" onPress={() => void signOut()} />
          </>
        }
      />
    );
  return (
    <StateScreen
      icon={RefreshCw}
      tone="info"
      ribbon="Đang nhận playtest"
      title="Đang xác nhận mã bàn giao…"
      body="Vui lòng chờ trong giây lát."
    />
  );
}
