import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Check, Play, RefreshCw, ScanLine, TriangleAlert, User } from 'lucide-react-native';
import { getTrainingHistory, type TrainingHistoryItem } from '@/api/training-history';
import { Button } from '@/components/ui/Button';
import { Callout, Card, Chip, Diorama, HexBadge, Ribbon } from '@/components/ui/Game';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { modeName } from '@/features/training/mode-ui';
import { openHistoryItem, outcomeLook } from '@/features/training/screens/ResultsScreen';
import { isOfflineError } from '@/features/training/training-runtime';
import { usePendingSync } from '@/features/training/use-pending-sync';
import { useSession } from '@/store/SessionProvider';
import { colors, fonts } from '@/theme/tokens';

function Skeleton() {
  return (
    <View style={{ gap: 14 }} accessibilityLabel="Đang tải">
      <View style={styles.greeting}>
        <View style={[styles.bone, { width: 48, height: 48, borderRadius: 14 }]} />
        <View style={{ gap: 8 }}>
          <View style={[styles.bone, { width: 90, height: 10 }]} />
          <View style={[styles.bone, { width: 150, height: 14 }]} />
        </View>
      </View>
      <View style={[styles.bone, { height: 260, borderRadius: 24 }]} />
      {[0, 1].map((key) => (
        <View key={key} style={styles.boneCard}>
          <View style={[styles.bone, { width: 52, height: 52, borderRadius: 14 }]} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[styles.bone, { width: '75%', height: 12 }]} />
            <View style={[styles.bone, { width: '45%', height: 10 }]} />
          </View>
        </View>
      ))}
      <View style={styles.loading}>
        <ActivityIndicator color={colors.ember} />
        <Text style={styles.loadingText}>Đang tải…</Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { account } = useSession();
  const pending = usePendingSync();
  const [history, setHistory] = useState<TrainingHistoryItem[] | null>(null);
  const [fetchOffline, setFetchOffline] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      getTrainingHistory(1)
        .then((page) => {
          if (!live) return;
          setHistory(page.items);
          setFetchOffline(false);
        })
        .catch((issue) => {
          if (!live) return;
          setFetchOffline(isOfflineError(issue));
          setHistory((current) => current ?? []);
        });
      return () => {
        live = false;
      };
    }, []),
  );

  const offline = fetchOffline || pending.offline;
  const latest = history?.[0];
  const unfinished = history?.find((item) => !item.resultStatus);
  const recent = (history ?? []).filter((item) => item.resultStatus).slice(0, 3);
  const name = account?.fullName || account?.username || 'Học viên';

  if (!history)
    return (
      <Screen contentStyle={styles.content}>
        <Skeleton />
      </Screen>
    );

  return (
    <Screen contentStyle={styles.content}>
      {offline && (
        <Callout tone="warning" icon={TriangleAlert} title="Bạn đang offline">
          Cần mạng để quét QR, chuẩn bị và bắt đầu phiên mới
        </Callout>
      )}
      <View style={styles.greeting}>
        <HexBadge icon={User} size={48} />
        <View style={{ flex: 1 }}>
          <Text variant="small" muted>
            Xin chào,
          </Text>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
        </View>
        {pending.count > 0 ? (
          <Chip label={`${pending.count} chờ gửi`} tone="warning" icon={RefreshCw} />
        ) : (
          <Chip label="Đã đồng bộ" tone="success" icon={Check} />
        )}
      </View>

      {offline ? (
        <>
          {unfinished && (
            <Card accent contentStyle={{ gap: 14 }}>
              <View style={styles.row}>
                <HexBadge icon={Play} size={54} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="strong" numberOfLines={1}>
                    {unfinished.training.name}
                  </Text>
                  <Text variant="small" muted>
                    Có thể xem tiếp phiên đang mở
                  </Text>
                </View>
              </View>
              <Button
                title="Tiếp tục chơi"
                icon={Play}
                onPress={() => openHistoryItem(unfinished)}
              />
            </Card>
          )}
          <Card style={{ opacity: 0.5 }} contentStyle={styles.row}>
            <HexBadge icon={ScanLine} tone="neutral" size={48} />
            <View style={{ flex: 1 }}>
              <Text variant="strong">Quét QR tòa nhà</Text>
              <Text variant="small" muted>
                Cần kết nối mạng
              </Text>
            </View>
          </Card>
          <Text variant="small" muted style={{ textAlign: 'center' }}>
            Kết quả đã lưu trên máy sẽ tự gửi khi có mạng.
          </Text>
        </>
      ) : (
        <>
          <Card radius={24} padding={0} style={{ marginBottom: 1 }}>
            <Diorama />
            <View style={styles.heroBody}>
              <Ribbon label={latest ? 'Tòa nhà gần nhất' : 'Bắt đầu'} />
              <Text style={styles.heroTitle} numberOfLines={2}>
                {latest ? latest.building.name : 'Quét QR của tòa nhà để vào bài'}
              </Text>
              <Button
                title="Quét QR để vào"
                icon={ScanLine}
                onPress={() => router.push('/scan-qr')}
              />
            </View>
          </Card>

          {unfinished && (
            <>
              <Text variant="caps" style={styles.section}>
                NHIỆM VỤ ĐANG DỞ
              </Text>
              <Card
                accent
                onPress={() => openHistoryItem(unfinished)}
                accessibilityLabel={`Tiếp tục ${unfinished.training.name}`}
                contentStyle={styles.row}
              >
                <HexBadge icon={Play} size={54} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="strong" numberOfLines={1}>
                    {unfinished.training.name}
                  </Text>
                  <Text variant="small" muted numberOfLines={1}>
                    {modeName(unfinished.mode)} · {unfinished.building.name}
                  </Text>
                </View>
                <Ribbon label="Tiếp tục" />
              </Card>
            </>
          )}

          {recent.length > 0 && (
            <>
              <Text variant="caps" style={styles.section}>
                KẾT QUẢ GẦN ĐÂY
              </Text>
              <View style={styles.recent}>
                {recent.map((item) => {
                  const look = outcomeLook(item);
                  return (
                    <Card
                      key={item.sessionId}
                      padding={12}
                      style={{ flex: 1 }}
                      contentStyle={{ gap: 8 }}
                      onPress={() => openHistoryItem(item)}
                      accessibilityLabel={`${item.training.name}, ${look.label}`}
                    >
                      <HexBadge icon={look.icon} tone={look.hex} size={40} />
                      <Text style={styles.recentTitle} numberOfLines={1}>
                        {item.training.name}
                      </Text>
                      <Text style={styles.recentLabel} muted numberOfLines={1}>
                        {look.label}
                      </Text>
                    </Card>
                  );
                })}
              </View>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  greeting: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontFamily: fonts.black, fontSize: 18, lineHeight: 24 },
  heroBody: { padding: 14, gap: 10 },
  heroTitle: { fontFamily: fonts.black, fontSize: 20, lineHeight: 26 },
  section: { letterSpacing: 1.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recent: { flexDirection: 'row', gap: 10 },
  recentTitle: { fontFamily: fonts.extrabold, fontSize: 13, lineHeight: 18 },
  recentLabel: { fontSize: 11, lineHeight: 15 },
  bone: { backgroundColor: colors.surface, borderRadius: 6 },
  boneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  loading: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingTop: 24,
  },
  loadingText: { fontFamily: fonts.extrabold, fontSize: 13, lineHeight: 18, color: colors.muted },
});
