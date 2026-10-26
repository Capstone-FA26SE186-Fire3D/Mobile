import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Check, Play, RefreshCw, ScanLine, User, WifiOff } from 'lucide-react-native';
import { getTrainingHistory, type TrainingHistoryItem } from '@/api/training-history';
import { Button } from '@/components/ui/Button';
import { Card, Chip, Diorama, HexBadge, Ribbon } from '@/components/ui/Game';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { openHistoryItem, outcomeLook } from '@/features/training/screens/ResultsScreen';
import { usePendingSync } from '@/features/training/use-pending-sync';
import { useSession } from '@/store/SessionProvider';
import { fonts } from '@/theme/tokens';

export default function HomeScreen() {
  const { account } = useSession();
  const pending = usePendingSync();
  const [history, setHistory] = useState<TrainingHistoryItem[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      getTrainingHistory(1)
        .then((page) => live && setHistory(page.items))
        .catch(() => live && setHistory((current) => current ?? []));
      return () => {
        live = false;
      };
    }, []),
  );

  const latest = history?.[0];
  const unfinished = history?.find((item) => !item.resultStatus);
  const recent = (history ?? []).filter((item) => item.resultStatus).slice(0, 3);

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.greeting}>
        <HexBadge icon={User} size={48} />
        <View style={{ flex: 1 }}>
          <Text variant="small" muted>
            Xin chào,
          </Text>
          <Text style={styles.name} numberOfLines={1}>
            {account?.fullName || account?.username || 'Học viên'}
          </Text>
        </View>
        {pending.offline ? (
          <Chip label="Mất mạng" tone="warning" icon={WifiOff} />
        ) : pending.count > 0 ? (
          <Chip label={`Chờ đồng bộ · ${pending.count}`} tone="warning" icon={RefreshCw} />
        ) : (
          <Chip label="Đã đồng bộ" tone="success" icon={Check} />
        )}
      </View>

      <Card radius={24} padding={0} style={{ marginBottom: 1 }}>
        <Diorama />
        <View style={styles.heroBody}>
          <Ribbon label={latest ? 'Tòa nhà gần nhất' : 'Bắt đầu'} />
          <Text style={styles.heroTitle} numberOfLines={2}>
            {latest ? latest.building.name : 'Quét QR của tòa nhà để vào bài'}
          </Text>
          <Button title="Quét QR để vào" icon={ScanLine} onPress={() => router.push('/scan-qr')} />
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
                {unfinished.mode} · {unfinished.building.name}
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
});
