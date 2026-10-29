import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Download, Play, ScanLine, TriangleAlert } from 'lucide-react-native';
import { getCurrentAccount } from '@/api/auth';
import { Button } from '@/components/ui/Button';
import { Callout, Card, HexBadge, Pill } from '@/components/ui/Game';
import { PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  listDownloads,
  pinOfRecord,
  type DownloadRecord,
} from '@/features/training/downloads-store';
import { packageStatus, type PackageStatus } from '@/features/training/package-cache.native';
import { isOfflineError } from '@/features/training/training-runtime';
import { unityBridge } from '@/features/training/unity-bridge.native';
import { usePendingSync } from '@/features/training/use-pending-sync';
import { useSession } from '@/store/SessionProvider';
import { colors, fonts } from '@/theme/tokens';

const STATUS: Record<PackageStatus, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  ready: { label: 'Sẵn sàng trên máy', tone: 'success' },
  partial: { label: 'Tải dở, sẽ tải tiếp', tone: 'warning' },
  missing: { label: 'Chưa có dữ liệu trên máy', tone: 'neutral' },
};

const savedDate = (iso: string) => {
  const date = new Date(iso);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * "Bài đã tải": trainings this account downloaded on this device. The list works offline; "Chơi lại" opens the
 * existing mode screen with the saved Building QR, where BE checks the QR, the allowed list and the start again.
 */
export default function DownloadsScreen() {
  const { account } = useSession();
  const pending = usePendingSync();
  const [items, setItems] = useState<DownloadRecord[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, PackageStatus>>({});
  const [probeOffline, setProbeOffline] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!account) return;
      let live = true;
      void (async () => {
        const list = await listDownloads(account.id).catch(() => []);
        if (!live) return;
        setItems(list);
        for (const item of list) {
          const status: PackageStatus = unityBridge.available
            ? await packageStatus(pinOfRecord(item)).catch(() => 'missing' as const)
            : 'missing';
          if (!live) return;
          setStatuses((current) => ({ ...current, [item.trainingId]: status }));
        }
      })();
      getCurrentAccount()
        .then(() => live && setProbeOffline(false))
        .catch((issue) => live && setProbeOffline(isOfflineError(issue)));
      return () => {
        live = false;
      };
    }, [account?.id]),
  );

  const offline = probeOffline || pending.offline;
  const replay = (item: DownloadRecord) =>
    router.push({
      pathname: '/training/[trainingId]',
      params: { trainingId: item.trainingId, qr: item.qrToken },
    });

  return (
    <Screen contentStyle={styles.content}>
      <PageHeader
        title="Bài đã tải"
        subtitle="Gói nhiệm vụ đã lưu trên máy này"
        onBack={() => router.back()}
      />
      {offline && (
        <Callout tone="warning" icon={TriangleAlert} title="Bạn đang offline">
          Chơi lại cần mạng để kiểm tra quyền và bắt đầu lượt mới. Gói đã tải vẫn được giữ trên máy.
        </Callout>
      )}
      {items === null && <ActivityIndicator color={colors.ember} />}
      {items?.length === 0 && (
        <Card contentStyle={styles.empty}>
          <HexBadge icon={Download} tone="neutral" size={64} />
          <Text variant="strong">Chưa có bài đã tải</Text>
          <Text variant="small" muted style={{ textAlign: 'center' }}>
            Quét QR của tòa nhà, chọn bài và tải gói nhiệm vụ. Bài sẽ hiện ở đây để chơi lại.
          </Text>
          <Button title="Quét QR tòa nhà" icon={ScanLine} onPress={() => router.push('/scan-qr')} />
        </Card>
      )}
      {items?.map((item) => {
        const status = statuses[item.trainingId];
        return (
          <Card key={item.trainingId} contentStyle={{ gap: 12 }}>
            <View style={styles.row}>
              <HexBadge icon={Play} size={52} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="strong" numberOfLines={2}>
                  {item.trainingName}
                </Text>
                <Text variant="small" muted numberOfLines={1}>
                  {item.buildingName} · tải ngày {savedDate(item.savedAt)}
                </Text>
              </View>
            </View>
            <View style={styles.row}>
              {status ? (
                <Pill label={STATUS[status].label} tone={STATUS[status].tone} />
              ) : (
                <Text variant="small" muted>
                  Đang kiểm tra dữ liệu trên máy…
                </Text>
              )}
            </View>
            <Button
              title="Chơi lại"
              icon={Play}
              disabled={offline}
              accessibilityLabel={`Chơi lại ${item.trainingName}`}
              onPress={() => replay(item)}
            />
          </Card>
        );
      })}
      {!!items?.length && (
        <Text variant="small" dim style={styles.note}>
          Mỗi lần chơi lại là một lượt mới. Nếu bài có phiên bản mới, ứng dụng sẽ tải gói mới.
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  empty: { alignItems: 'center', gap: 10, padding: 20 },
  note: { fontSize: 11, lineHeight: 17, textAlign: 'center', fontFamily: fonts.regular },
});
