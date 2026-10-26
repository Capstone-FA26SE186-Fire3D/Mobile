import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { BookOpen, Check, ChevronRight, CircleAlert, RefreshCw, X } from 'lucide-react-native';
import { getTrainingHistory, type TrainingHistoryItem } from '@/api/training-history';
import { Button } from '@/components/ui/Button';
import { Banner, Card, FilterChips, HexBadge, Pill, type LucideIcon } from '@/components/ui/Game';
import { Notice, PageHeader, Screen, ScreenTitle } from '@/components/ui/Screen';
import { AiFab } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { usePendingSync } from '@/features/training/use-pending-sync';
import { colors, fonts, type HexTone } from '@/theme/tokens';

type Look = {
  label: string;
  icon: LucideIcon;
  hex: HexTone;
  pill: 'success' | 'danger' | 'warning' | 'neutral';
};
/** Outcome labels are BE's; Mobile never decides Passed/NotPassed. */
export function outcomeLook(item: Pick<TrainingHistoryItem, 'resultStatus'>): Look {
  switch (item.resultStatus) {
    case 'Passed':
      return { label: 'Đạt', icon: Check, hex: 'success', pill: 'success' };
    case 'NotPassed':
      return { label: 'Chưa đạt', icon: X, hex: 'danger', pill: 'danger' };
    case 'Incomplete':
      return { label: 'Chưa hoàn thành', icon: CircleAlert, hex: 'danger', pill: 'danger' };
    case 'NotAssessed':
      return { label: 'Không chấm', icon: BookOpen, hex: 'neutral', pill: 'neutral' };
    case null:
    case undefined:
      return { label: 'Chờ đồng bộ', icon: RefreshCw, hex: 'warning', pill: 'warning' };
    default:
      return { label: item.resultStatus, icon: BookOpen, hex: 'neutral', pill: 'neutral' };
  }
}

export function openHistoryItem(item: TrainingHistoryItem) {
  if (item.resultStatus) router.push(`/history/${item.sessionId}`);
  else
    router.push({
      pathname: '/training/session/[sessionId]',
      params: { sessionId: item.sessionId, trainingId: item.training.id, mode: item.mode },
    });
}

const shortDate = (iso: string) => {
  const date = new Date(iso);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'Assessment', label: 'Assessment' },
  { value: 'Guided', label: 'Guided' },
  { value: 'Learn', label: 'Learn' },
] as const;

export default function ResultsScreen({ standalone = false }: { standalone?: boolean }) {
  const [items, setItems] = useState<TrainingHistoryItem[]>([]);
  const [mode, setMode] = useState<(typeof FILTERS)[number]['value']>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = usePendingSync();

  const load = useCallback(async (nextPage: number) => {
    setBusy(true);
    setError('');
    try {
      const result = await getTrainingHistory(nextPage);
      setItems((current) =>
        nextPage === 1 ? (result.items ?? []) : [...current, ...(result.items ?? [])],
      );
      setPage(nextPage);
      setTotal(result.totalCount);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Không tải được lịch sử phiên.');
    } finally {
      setBusy(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(1);
    }, [load]),
  );
  // A session that just reached BE gets its result: refresh when the waiting count drops.
  const lastPending = useRef(pending.count);
  useEffect(() => {
    if (pending.count < lastPending.current) void load(1);
    lastPending.current = pending.count;
  }, [pending.count, load]);

  const shown = mode === 'all' ? items : items.filter((item) => item.mode === mode);
  const firstWaiting = items.find((item) => !item.resultStatus);

  return (
    <View style={{ flex: 1 }}>
      <Screen contentStyle={styles.content}>
        {standalone ? (
          <PageHeader title="Kết quả" onBack={() => router.back()} />
        ) : (
          <ScreenTitle>Kết quả</ScreenTitle>
        )}
        {pending.count > 0 && (
          <Banner
            tone="warning"
            icon={RefreshCw}
            title={`${pending.count} phiên đang chờ đồng bộ`}
            subtitle={
              pending.offline
                ? 'Chưa có mạng · dữ liệu an toàn trên máy'
                : 'Dữ liệu an toàn trên máy · bấm để xem'
            }
            onPress={firstWaiting ? () => openHistoryItem(firstWaiting) : undefined}
          />
        )}
        <FilterChips options={FILTERS} value={mode} onChange={setMode} />
        {!!error && <Notice error>{error}</Notice>}
        {busy && items.length === 0 && <ActivityIndicator color={colors.ember} />}
        {!busy && !error && shown.length === 0 && (
          <Card contentStyle={styles.empty}>
            <HexBadge icon={BookOpen} tone="neutral" size={64} />
            <Text style={styles.emptyTitle}>Chưa có kết quả</Text>
            <Text variant="small" muted style={{ textAlign: 'center' }}>
              Quét QR của tòa nhà để bắt đầu bài tập đầu tiên. Kết quả do máy chủ chấm sẽ hiện ở
              đây.
            </Text>
          </Card>
        )}
        {shown.map((item) => {
          const look = outcomeLook(item);
          return (
            <Card
              key={item.sessionId}
              padding={14}
              onPress={() => openHistoryItem(item)}
              accessibilityLabel={`${item.training.name}, ${look.label}`}
              contentStyle={styles.row}
            >
              <HexBadge icon={look.icon} tone={look.hex} size={52} />
              <View style={{ flex: 1, gap: 3, alignItems: 'flex-start' }}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.training.name}
                </Text>
                <Text style={styles.meta} muted numberOfLines={1}>
                  {item.building.name} · {item.mode} · {shortDate(item.startedAt)}
                </Text>
                <Pill label={look.label} tone={look.pill} />
              </View>
              <ChevronRight size={16} color={colors.dim} strokeWidth={2.5} />
            </Card>
          );
        })}
        {items.length < total && (
          <Button
            title="Xem thêm"
            variant="secondary"
            size="sm"
            loading={busy}
            onPress={() => void load(page + 1)}
          />
        )}
      </Screen>
      {!standalone && <AiFab />}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 80 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.extrabold, fontSize: 15, lineHeight: 20 },
  meta: { fontSize: 11, lineHeight: 15 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyTitle: { fontFamily: fonts.black, fontSize: 18, lineHeight: 24 },
});
