import { useCallback, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supportApi, type Feedback, type TicketDetails, type TicketSummary } from '@/api/support';
import { ApiError } from '@/api';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors, fonts } from '@/theme/tokens';

function messageFor(error: unknown) {
  if (error instanceof ApiError)
    return `Yêu cầu chưa hoàn tất (HTTP ${error.status}). ${error.message}`;
  return error instanceof Error ? error.message : 'Không kết nối được Fire3D API.';
}

export default function SupportScreen() {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [selected, setSelected] = useState<TicketDetails | null>(null);
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
    }, 'Đã gửi tin nhắn.');
  }

  return (
    <Screen>
      <PageHeader
        title="Phản hồi và hỗ trợ"
        onBack={() => (selected ? setSelected(null) : router.back())}
      />
      {!!error && <Notice error>{error}</Notice>}
      {!!notice && <Notice>{notice}</Notice>}
      {selected ? (
        <View style={styles.section}>
          <Text variant="heading">{selected.subject}</Text>
          <Text muted>
            {selected.ticketNumber} · {selected.status}
          </Text>
          <Text>{selected.description}</Text>
          {selected.messages.map((item) => (
            <View key={item.id} style={styles.message}>
              <Text>{item.message}</Text>
              <Text variant="small" muted>
                {new Date(item.createdAt).toLocaleString('vi-VN')}
              </Text>
            </View>
          ))}
          {selected.status !== 'Closed' && (
            <>
              <TextInput
                accessibilityLabel="Tin nhắn hỗ trợ"
                multiline
                value={reply}
                onChangeText={setReply}
                placeholder="Nhập tin nhắn"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.multiline]}
              />
              <Button title="Gửi tin nhắn" loading={busy} onPress={sendReply} />
            </>
          )}
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <Text variant="heading">Gửi phản hồi</Text>
            <TextInput
              accessibilityLabel="Nội dung phản hồi"
              multiline
              value={feedbackText}
              onChangeText={setFeedbackText}
              placeholder="Chia sẻ trải nghiệm của bạn"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.multiline]}
            />
            <Button title="Gửi phản hồi" loading={busy} onPress={sendFeedback} />
            <Text variant="small" muted>
              {feedback.length} phản hồi đã gửi.
            </Text>
          </View>
          <View style={styles.section}>
            <Text variant="heading">Yêu cầu hỗ trợ mới</Text>
            <TextInput
              accessibilityLabel="Tiêu đề hỗ trợ"
              value={subject}
              onChangeText={setSubject}
              placeholder="Tiêu đề"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <TextInput
              accessibilityLabel="Mô tả hỗ trợ"
              multiline
              value={description}
              onChangeText={setDescription}
              placeholder="Mô tả vấn đề"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.multiline]}
            />
            <Button title="Tạo yêu cầu hỗ trợ" loading={busy} onPress={openTicket} />
          </View>
          <View style={styles.section}>
            <Text variant="heading">Yêu cầu của bạn</Text>
            {tickets.length === 0 && <Text muted>Chưa có yêu cầu hỗ trợ.</Text>}
            {tickets.map((ticket) => (
              <Button
                key={ticket.id}
                variant="secondary"
                title={`${ticket.subject} · ${ticket.status}`}
                onPress={() =>
                  void run(async () => {
                    setSelected(await supportApi.getTicket(ticket.id));
                  }, '')
                }
              />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, padding: 16, borderRadius: 16, backgroundColor: colors.surface },
  input: {
    minHeight: 52,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.background,
    fontFamily: fonts.regular,
    color: colors.ink,
  },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  message: { padding: 12, borderRadius: 12, backgroundColor: colors.background, gap: 5 },
});
