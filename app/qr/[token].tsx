import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ApiError } from '@/api';
import {
  getQrTrainings,
  resolveBuildingQr,
  verifyParticipationCode,
  type BuildingQrResolution,
  type Training,
} from '@/api/qr';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { parseQrToken } from '@/features/qr/qr-token';
import { MODE_LABELS, allowedTrainingModes } from '@/features/training/session-contract';
import { useSession } from '@/store/SessionProvider';
import { colors, fonts } from '@/theme/tokens';

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 410 || error.payload?.code === 'QR_REVOKED')
      return 'Mã QR này đã bị thu hồi. Hãy xin mã mới từ tổ chức.';
    if (error.status === 404 || error.payload?.code === 'QR_NOT_FOUND')
      return 'Không tìm thấy mã QR hoặc Building không còn khả dụng.';
    if (error.payload?.code === 'BUILDING_ACCESS_REQUIRED')
      return 'Hãy nhập mã tham gia Building Private.';
    if (error.payload?.code === 'PARTICIPATION_CODE_INVALID')
      return 'Mã tham gia không đúng hoặc đã bị đổi/thu hồi.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'Không kết nối được Fire3D API.';
}

export default function QrBuildingScreen() {
  const params = useLocalSearchParams<{ token: string }>();
  const token = typeof params.token === 'string' ? parseQrToken(params.token) : null;
  const { account, pendingQrToken, setPendingQrToken } = useSession();
  const [building, setBuilding] = useState<BuildingQrResolution | null>(null);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!account || !token) return;
    setBusy(true);
    setError('');
    try {
      const resolved = await resolveBuildingQr(token);
      setBuilding(resolved);
      if (pendingQrToken === token) await setPendingQrToken(null);
      if (resolved.hasAccess) setTrainings(await getQrTrainings(token));
      else setTrainings([]);
    } catch (issue) {
      setError(describe(issue));
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

  return (
    <Screen>
      <PageHeader title="Building từ QR" onBack={() => router.back()} />
      {!token ? (
        <Notice error>Mã QR không hợp lệ.</Notice>
      ) : !account ? (
        <>
          <Text>Đăng nhập để xem Building và các bài tập được cấp quyền.</Text>
          <Button title="Đăng nhập và tiếp tục" onPress={() => void login()} />
        </>
      ) : (
        <>
          {busy && <ActivityIndicator color={colors.primary} />}
          {!!error && <Notice error>{error}</Notice>}
          {building && (
            <View style={styles.section}>
              <Text variant="title">{building.buildingName}</Text>
              <Text muted>Trạng thái dịch vụ: {building.serviceStatus}</Text>
              {building.serviceStatus !== 'Active' && (
                <Notice>Dịch vụ Building chưa hoạt động; hiện không thể bắt đầu phiên mới.</Notice>
              )}
              {!building.hasAccess && building.visibility === 'Private' && (
                <>
                  <Text variant="label">Mã tham gia Building Private</Text>
                  <TextInput
                    accessibilityLabel="Mã tham gia Building Private"
                    value={code}
                    onChangeText={setCode}
                    autoCapitalize="characters"
                    style={styles.input}
                  />
                  <Button
                    title="Xác minh mã tham gia"
                    disabled={busy || !code.trim()}
                    onPress={() => void verify()}
                  />
                </>
              )}
              {building.hasAccess && (
                <>
                  <Text variant="heading">Bài tập được phép</Text>
                  {trainings.length === 0 && !busy ? (
                    <Text muted>Chưa có bài tập được phát hành.</Text>
                  ) : null}
                  {trainings.map((training) => {
                    const modes = allowedTrainingModes(training.allowedModes);
                    return (
                      <Pressable
                        key={training.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Mở bài tập ${training.name}`}
                        disabled={modes.length === 0}
                        onPress={() =>
                          router.push({
                            pathname: '/training/[trainingId]',
                            params: { trainingId: training.id, qr: token },
                          })
                        }
                        style={({ pressed }) => [
                          styles.training,
                          pressed && { opacity: 0.8 },
                          modes.length === 0 && { opacity: 0.5 },
                        ]}
                      >
                        <View style={styles.trainingHead}>
                          <Text variant="label" style={{ flex: 1 }}>
                            {training.name}
                          </Text>
                          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                        </View>
                        {!!training.description && <Text muted>{training.description}</Text>}
                        <Text variant="small" muted>
                          {modes.length > 0
                            ? `Chế độ: ${modes.map((mode) => MODE_LABELS[mode].title).join(' • ')}`
                            : 'Chưa mở chế độ nào.'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </>
              )}
            </View>
          )}
          <Button title="Thử lại" variant="secondary" disabled={busy} onPress={() => void load()} />
          <Button
            title="Về trang chủ"
            variant="ghost"
            onPress={() => {
              void setPendingQrToken(null).then(() => router.replace('/(tabs)'));
            }}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 14 },
  training: { gap: 6, padding: 16, borderRadius: 14, backgroundColor: colors.surface },
  trainingHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
