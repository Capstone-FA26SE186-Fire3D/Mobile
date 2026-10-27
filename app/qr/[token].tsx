import { modeName } from '@/features/training/mode-ui';
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Lock,
  Play,
  ScanLine,
  Search,
  X,
} from 'lucide-react-native';
import { ApiError } from '@/api';
import {
  getQrTrainings,
  resolveBuildingQr,
  verifyParticipationCode,
  type BuildingQrResolution,
  type Training,
} from '@/api/qr';
import { Button } from '@/components/ui/Button';
import { BackButton, Callout, Card, Diorama, Field, HexBadge, Pill } from '@/components/ui/Game';
import { Notice } from '@/components/ui/Screen';
import { StateScreen } from '@/components/ui/StateScreen';
import { Text } from '@/components/ui/Text';
import { parseQrToken } from '@/features/qr/qr-token';
import { allowedTrainingModes, type TrainingMode } from '@/features/training/session-contract';
import { useSession } from '@/store/SessionProvider';
import { colors, fonts, type HexTone } from '@/theme/tokens';
const dioramaWide = require('../../assets/images/diorama-login.png');

type Failure = 'revoked' | 'missing' | null;
function failureOf(error: unknown): Failure {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 410 || error.payload?.code === 'QR_REVOKED') return 'revoked';
  if (error.status === 404 || error.payload?.code === 'QR_NOT_FOUND') return 'missing';
  return null;
}
function describe(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.payload?.code === 'BUILDING_ACCESS_REQUIRED')
      return 'Hãy nhập mã tham gia của tòa nhà riêng tư.';
    if (error.payload?.code === 'PARTICIPATION_CODE_INVALID')
      return 'Mã tham gia không đúng hoặc đã bị đổi/thu hồi.';
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : 'Không kết nối được máy chủ FET3D. Kiểm tra mạng rồi thử lại.';
}

export const MODE_PILL: Record<TrainingMode, 'success' | 'info' | 'warning'> = {
  Learn: 'success',
  Guided: 'info',
  Assessment: 'warning',
};
const MISSION_TONES: HexTone[] = ['ember', 'warning', 'info'];
const SERVICE: Record<
  BuildingQrResolution['serviceStatus'],
  { label: string; tone: 'success' | 'danger' | 'warning' }
> = {
  Active: { label: 'Hoạt động', tone: 'success' },
  Expired: { label: 'Hết hạn', tone: 'danger' },
  NotPurchased: { label: 'Chưa kích hoạt', tone: 'warning' },
};

export default function QrBuildingScreen() {
  const params = useLocalSearchParams<{ token: string }>();
  const token = typeof params.token === 'string' ? parseQrToken(params.token) : null;
  const { account, pendingQrToken, setPendingQrToken } = useSession();
  const [building, setBuilding] = useState<BuildingQrResolution | null>(null);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failure, setFailure] = useState<Failure>(null);

  const load = useCallback(async () => {
    if (!account || !token) return;
    setBusy(true);
    setError('');
    setFailure(null);
    try {
      const resolved = await resolveBuildingQr(token);
      setBuilding(resolved);
      if (pendingQrToken === token) await setPendingQrToken(null);
      if (resolved.hasAccess) setTrainings(await getQrTrainings(token));
      else setTrainings([]);
    } catch (issue) {
      const kind = failureOf(issue);
      if (kind) setFailure(kind);
      else setError(describe(issue));
    } finally {
      setBusy(false);
    }
  }, [account, token, pendingQrToken, setPendingQrToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function login() {
    if (!token) return;
    await setPendingQrToken(token);
    router.push('/login');
  }

  async function verify() {
    if (!building || !code.trim()) return;
    setBusy(true);
    setError('');
    try {
      await verifyParticipationCode(building.buildingId, code.trim());
      setCode('');
      await load();
    } catch (issue) {
      setError(describe(issue));
    } finally {
      setBusy(false);
    }
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const home = () => {
    void setPendingQrToken(null).then(() => router.replace('/(tabs)'));
  };
  const rescan = () => router.replace('/scan-qr');

  if (!token || failure === 'missing')
    return (
      <StateScreen
        header="Quét QR tòa nhà"
        onBack={back}
        icon={Search}
        tone="neutral"
        ribbon="Không tìm thấy"
        title="Không tìm thấy tòa nhà"
        body="Mã QR không khớp với tòa nhà nào trong hệ thống. Kiểm tra lại mã hoặc liên hệ tổ chức."
        actions={
          <>
            <Button title="Quét lại" icon={ScanLine} onPress={rescan} />
            <Button title="Về trang chủ" variant="secondary" size="sm" onPress={home} />
          </>
        }
      />
    );
  if (failure === 'revoked')
    return (
      <StateScreen
        header="Quét QR tòa nhà"
        onBack={back}
        icon={X}
        tone="danger"
        ribbon="QR không còn hiệu lực"
        title="Mã QR này đã bị thu hồi"
        body="Tổ chức đã thay mã mới cho tòa nhà. Hãy quét mã QR mới đang dán tại tòa nhà."
        actions={
          <>
            <Button title="Quét lại" icon={ScanLine} onPress={rescan} />
            <Button title="Về trang chủ" variant="secondary" size="sm" onPress={home} />
          </>
        }
      />
    );

  const service = building ? SERVICE[building.serviceStatus] : null;
  const closed = !!building && !building.canStartNewSessions;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <View>
          <Diorama source={dioramaWide} height={230} />
          <View style={styles.back}>
            <BackButton onPress={back} />
          </View>
        </View>
        <View style={styles.body}>
          {!account ? (
            <>
              <Text variant="title">Tòa nhà từ mã QR</Text>
              <Text muted>Đăng nhập để xem tòa nhà và các bài tập được cấp quyền.</Text>
              <Button
                title="Đăng nhập và tiếp tục"
                icon={ArrowUpRight}
                onPress={() => void login()}
              />
            </>
          ) : (
            <>
              {busy && !building && (
                <ActivityIndicator color={colors.ember} style={{ marginTop: 24 }} />
              )}
              {building && (
                <>
                  <View style={styles.titleRow}>
                    <Text variant="title" style={{ flex: 1 }}>
                      {building.buildingName}
                    </Text>
                    {service && <Pill label={service.label} tone={service.tone} />}
                  </View>
                  <Text variant="small" muted>
                    {building.visibility === 'Private' ? 'Riêng tư' : 'Công khai'}
                    {building.serviceEndsAt
                      ? ` · Dịch vụ đến ${new Date(building.serviceEndsAt).toLocaleDateString('vi-VN')}`
                      : ''}
                  </Text>
                  {!building.hasAccess && building.visibility === 'Private' ? (
                    <Card contentStyle={{ gap: 12 }}>
                      <View style={styles.row}>
                        <HexBadge icon={Lock} tone="warning" size={60} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text variant="heading">Tòa nhà riêng tư</Text>
                          <Text variant="small" muted style={{ lineHeight: 18 }}>
                            Nhập mã tham gia do tổ chức cung cấp để mở bảng nhiệm vụ.
                          </Text>
                        </View>
                      </View>
                      <Field
                        label="Mã tham gia"
                        value={code}
                        onChangeText={setCode}
                        autoCapitalize="characters"
                        placeholder="VD: FIRE-2026"
                        onSubmitEditing={() => void verify()}
                      />
                      {!!error && <Notice error>{error}</Notice>}
                      <Button
                        title="Xác minh mã"
                        icon={Check}
                        loading={busy}
                        disabled={!code.trim()}
                        onPress={() => void verify()}
                      />
                    </Card>
                  ) : (
                    <>
                      {closed && (
                        <Callout tone="warning">
                          {building.serviceStatus === 'Expired'
                            ? 'Dịch vụ của tòa nhà đã hết hạn nên chưa thể bắt đầu phiên mới. Bạn vẫn xem được bảng nhiệm vụ.'
                            : 'Tòa nhà chưa mở phiên mới. Bạn vẫn xem được bảng nhiệm vụ.'}
                        </Callout>
                      )}
                      {!!error && <Notice error>{error}</Notice>}
                      <Text variant="caps" style={{ letterSpacing: 1.5 }}>
                        BẢNG NHIỆM VỤ
                      </Text>
                      {trainings.length === 0 && !busy && (
                        <Text muted>Chưa có bài tập được phát hành.</Text>
                      )}
                      {trainings.map((training, index) => {
                        const modes = allowedTrainingModes(training.allowedModes);
                        return (
                          <Card
                            key={training.id}
                            accessibilityLabel={`Mở bài tập ${training.name}`}
                            style={(closed || modes.length === 0) && { opacity: 0.6 }}
                            contentStyle={{ gap: 10 }}
                            onPress={
                              modes.length === 0
                                ? undefined
                                : () =>
                                    router.push({
                                      pathname: '/training/[trainingId]',
                                      params: { trainingId: training.id, qr: token },
                                    })
                            }
                          >
                            <View style={styles.row}>
                              <HexBadge icon={Play} tone={MISSION_TONES[index % 3]} size={56} />
                              <View style={{ flex: 1, gap: 3 }}>
                                <Text variant="strong">{training.name}</Text>
                                {!!training.description && (
                                  <Text variant="small" muted numberOfLines={2}>
                                    {training.description}
                                  </Text>
                                )}
                              </View>
                              <ChevronRight size={18} color={colors.dim} strokeWidth={2.5} />
                            </View>
                            <View style={styles.pills}>
                              {modes.length > 0 ? (
                                modes.map((mode) => (
                                  <Pill key={mode} label={modeName(mode)} tone={MODE_PILL[mode]} />
                                ))
                              ) : (
                                <Pill label="Chưa mở chế độ nào" tone="neutral" />
                              )}
                            </View>
                          </Card>
                        );
                      })}
                    </>
                  )}
                </>
              )}
              {!building && !busy && (
                <>
                  {!!error && <Notice error>{error}</Notice>}
                  <Button
                    title="Thử lại"
                    variant="secondary"
                    size="sm"
                    onPress={() => void load()}
                  />
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  back: { position: 'absolute', top: 16, left: 16 },
  body: {
    flex: 1,
    gap: 12,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
