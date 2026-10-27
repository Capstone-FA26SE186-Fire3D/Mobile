import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronRight, LifeBuoy, Plus } from 'lucide-react-native';
import { supportApi, type Feedback, type TicketDetails, type TicketSummary } from '@/api/support';
import { ApiError } from '@/api';
import { Button } from '@/components/ui/Button';
import { Bubble, Composer } from '@/components/ui/Chat';
import { Sheet } from '@/components/ui/Form';
import { Callout, Card, Field, FilterChips, HexBadge, Pill, Raised } from '@/components/ui/Game';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSession } from '@/store/SessionProvider';
import { colors, fonts } from '@/theme/tokens';

function messageFor(error: unknown) {
  if (error instanceof ApiError)
    return `Yêu cầu chưa hoàn tất (HTTP ${error.status}). ${error.message}`;
  return error instanceof Error
    ? error.message
    : 'Không kết nối được máy chủ FET3D. Kiểm tra mạng rồi thử lại.';
}

const STATUS: Record<string, { label: string; tone: 'info' | 'success' | 'neutral' | 'warning' }> =
  {
    Open: { label: 'Đang mở', tone: 'warning' },
    InProgress: { label: 'Đang xử lý', tone: 'info' },
    Pending: { label: 'Chờ phản hồi', tone: 'warning' },
    Resolved: { label: 'Đã giải quyết', tone: 'success' },
    Closed: { label: 'Đã đóng', tone: 'neutral' },
  };
const statusOf = (status: string) => STATUS[status] ?? { label: status, tone: 'neutral' as const };
const stamp = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
const TABS = [
  { value: 'tickets', label: 'Yêu cầu hỗ trợ' },
  { value: 'feedback', label: 'Phản hồi' },
] as const;

export default function SupportScreen() {
  const { account } = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('tickets');
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [selected, setSelected] = useState<TicketDetails | null>(null);
  const [creating, setCreating] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const [items, ownTickets] = await Promise.all([
      supportApi.listFeedback(),
      supportApi.listTickets(),
    ]);
    setFeedback(items);
    setTickets(ownTickets);
  }, []);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void refresh().catch((issue) => {
        if (active) setError(messageFor(issue));
      });
      return () => {
        active = false;
      };
    }, [refresh]),
  );

  async function run(action: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(success);
    } catch (issue) {
      setError(messageFor(issue));
    } finally {
      setBusy(false);
    }
  }

  function sendFeedback() {
    const message = feedbackText.trim();
    if (!message || message.length > 10000) {
      setError('Phản hồi cần từ 1 đến 10.000 ký tự.');
      return;
    }
    void run(async () => {
      await supportApi.createFeedback('Mobile', message, null);
      setFeedbackText('');
      await refresh();
    }, 'Đã gửi phản hồi.');
  }

  function openTicket() {
    const title = subject.trim(),
      detail = description.trim();
    if (!title || title.length > 255 || !detail || detail.length > 10000) {
      setError('Tiêu đề cần 1–255 ký tự và nội dung cần 1–10.000 ký tự.');
      return;
    }
    void run(async () => {
      const ticket = await supportApi.createTicket(title, detail);
      setSubject('');
      setDescription('');
      setCreating(false);
      setSelected(ticket);
      await refresh();
    }, 'Đã tạo yêu cầu hỗ trợ.');
  }

  function sendReply() {
    if (!selected) return;
    const message = reply.trim();
    if (!message || message.length > 10000) {
      setError('Tin nhắn cần từ 1 đến 10.000 ký tự.');
      return;
    }
    void run(async () => {
      await supportApi.addMessage(selected.id, message);
      setReply('');
      setSelected(await supportApi.getTicket(selected.id));
    }, '');
  }

  if (selected) {
    const status = statusOf(selected.status);
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <PageHeader
              title={selected.subject}
              subtitle={`${selected.ticketNumber} · ${status.label}`}
              onBack={() => {
                setSelected(null);
                setError('');
              }}
            />
          </View>
          <ScrollView contentContainerStyle={styles.thread}>
            <Bubble mine>{selected.description}</Bubble>
            {selected.messages.map((item) => (
              <Bubble key={item.id} mine={item.authorId === account?.id}>
                <Text style={styles.text}>
                  {item.authorId === account?.id ? '' : 'Đội hỗ trợ: '}
                  {item.message}
                </Text>
                <Text style={styles.time}>{stamp(item.createdAt)}</Text>
              </Bubble>
            ))}
            {!!error && <Notice error>{error}</Notice>}
          </ScrollView>
          {selected.status !== 'Closed' ? (
            <Composer
              label="Tin nhắn hỗ trợ"
              sendLabel="Gửi tin nhắn"
              value={reply}
              onChangeText={setReply}
              onSend={sendReply}
              canSend={!!reply.trim() && !busy}
              busy={busy}
              placeholder="Nhắn tin cho đội hỗ trợ…"
            />
          ) : (
            <Text variant="small" dim style={styles.closed}>
              Yêu cầu đã đóng. Tạo yêu cầu mới nếu bạn cần hỗ trợ thêm.
            </Text>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen contentStyle={{ padding: 16, gap: 14, paddingBottom: 96 }}>
        <PageHeader title="Hỗ trợ & phản hồi" onBack={() => router.back()} />
        <FilterChips options={TABS} value={tab} onChange={setTab} />
        {!!error && <Notice error>{error}</Notice>}
        {!!notice && <Callout tone="success">{notice}</Callout>}
        {tab === 'tickets' ? (
          <>
            {tickets.length === 0 && (
              <Card contentStyle={styles.empty}>
                <HexBadge icon={LifeBuoy} tone="success" size={64} />
                <Text style={styles.emptyTitle}>Chưa có yêu cầu hỗ trợ</Text>
                <Text variant="small" muted style={{ textAlign: 'center' }}>
                  Gặp lỗi khi tải gói hay vào màn chơi? Tạo yêu cầu để đội hỗ trợ giúp bạn.
                </Text>
              </Card>
            )}
            {tickets.map((ticket) => {
              const status = statusOf(ticket.status);
              return (
                <Card
                  key={ticket.id}
                  accessibilityLabel={ticket.subject}
                  contentStyle={{ gap: 6 }}
                  onPress={() =>
                    void run(async () => {
                      setSelected(await supportApi.getTicket(ticket.id));
                    }, '')
                  }
                >
                  <View style={styles.row}>
                    <Text variant="strong" style={{ flex: 1 }} numberOfLines={1}>
                      {ticket.subject}
                    </Text>
                    <ChevronRight size={16} color={colors.dim} strokeWidth={2.5} />
                  </View>
                  <Text variant="small" dim>
                    {ticket.ticketNumber} · {stamp(ticket.updatedAt ?? ticket.createdAt)}
                  </Text>
                  <View style={{ alignItems: 'flex-start' }}>
                    <Pill label={status.label} tone={status.tone} />
                  </View>
                </Card>
              );
            })}
          </>
        ) : (
          <>
            <Field
              label="Phản hồi của bạn"
              multiline
              value={feedbackText}
              onChangeText={setFeedbackText}
              placeholder="Chia sẻ trải nghiệm của bạn"
              style={{ minHeight: 110, textAlignVertical: 'top', paddingVertical: 12 }}
            />
            <Button title="Gửi phản hồi" icon={Check} loading={busy} onPress={sendFeedback} />
            <Text variant="small" dim style={{ textAlign: 'center' }}>
              {feedback.length} phản hồi đã gửi.
            </Text>
          </>
        )}
      </Screen>
      {tab === 'tickets' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tạo yêu cầu"
          onPress={() => setCreating(true)}
          style={styles.fab}
        >
          {({ pressed }) => (
            <Raised
              depth={5}
              shadow={colors.emberShadow}
              radius={18}
              pressed={pressed}
              faceStyle={styles.fabFace}
            >
              <Plus size={18} color={colors.emberForeground} strokeWidth={3} />
              <Text style={styles.fabText}>Tạo yêu cầu</Text>
            </Raised>
          )}
        </Pressable>
      )}
      <Sheet visible={creating} title="Yêu cầu hỗ trợ mới" onClose={() => setCreating(false)}>
        <Field
          label="Tiêu đề"
          value={subject}
          onChangeText={setSubject}
          placeholder="Vấn đề bạn gặp"
        />
        <Field
          label="Mô tả"
          multiline
          value={description}
          onChangeText={setDescription}
          placeholder="Mô tả vấn đề, bước đã thử…"
          style={{ minHeight: 110, textAlignVertical: 'top', paddingVertical: 12 }}
        />
        {!!error && <Notice error>{error}</Notice>}
        <Button title="Tạo yêu cầu hỗ trợ" icon={Check} loading={busy} onPress={openTicket} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingVertical: 6 },
  thread: { padding: 16, gap: 12, flexGrow: 1 },
  text: { fontSize: 14, lineHeight: 21 },
  time: { fontSize: 10, lineHeight: 14, color: colors.dim },
  closed: { textAlign: 'center', padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyTitle: { fontFamily: fonts.black, fontSize: 18, lineHeight: 24 },
  fab: { position: 'absolute', right: 16, bottom: 24 },
  fabFace: {
    height: 58,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.ember,
  },
  fabText: { fontFamily: fonts.black, fontSize: 15, lineHeight: 20, color: colors.emberForeground },
});
