import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, PageHeader, Notice } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { colors, fonts } from '@/theme/tokens';
import { askQuestion, type ChatResponse } from '../services/chat.api';
export default function ChatScreen() {
  const [question, setQuestion] = useState(''),
    [response, setResponse] = useState<ChatResponse>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function ask() {
    if (busy || !question.trim()) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError('');
    setResponse(undefined);
    const timeout = setTimeout(() => request.abort('timeout'), 30000);
    try {
      setResponse(await askQuestion(question.trim(), request.signal));
    } catch (issue) {
      if (!request.signal.aborted || request.signal.reason === 'timeout')
        setError(
          request.signal.reason === 'timeout'
            ? 'Kết nối mất quá nhiều thời gian. Vui lòng thử lại.'
            : issue instanceof Error
              ? issue.message
              : 'Chưa kết nối được dịch vụ.',
        );
    } finally {
      clearTimeout(timeout);
      if (!request.signal.aborted || request.signal.reason === 'timeout') setBusy(false);
    }
  }
  return (
    <Screen>
      <PageHeader title="Trợ lý tài liệu" onBack={() => router.back()} />
      <Text variant="title">Hiểu thêm một chút.{'\n'}Chủ động hơn một bước.</Text>
      <Text muted>Đặt câu hỏi về những tài liệu đã được cung cấp cho hệ thống.</Text>
      <TextInput
        accessibilityLabel="Câu hỏi cho trợ lý"
        value={question}
        onChangeText={setQuestion}
        multiline
        maxLength={2000}
        placeholder="Bạn muốn tìm hiểu điều gì?"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <Button
        title="Gửi câu hỏi"
        icon="send-outline"
        loading={busy}
        disabled={!question.trim()}
        onPress={ask}
      />
      {!!error && <Notice error>{error}</Notice>}
      {response && (
        <View style={styles.answer}>
          <Text>{response.answer}</Text>
          {response.sources.length > 0 && <Text variant="label">Tài liệu tham khảo</Text>}
          {response.sources.map((source, index) => (
            <Text
              key={`${source.document_name}-${source.chunk_index}-${index}`}
              variant="small"
              muted
            >
              {source.document_name} · đoạn {source.chunk_index}
            </Text>
          ))}
        </View>
      )}
      <Notice>
        Câu trả lời hỗ trợ học tập, không thay thế hướng dẫn khẩn cấp tại hiện trường.
      </Notice>
    </Screen>
  );
}
const styles = StyleSheet.create({
  input: {
    minHeight: 145,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    textAlignVertical: 'top',
    color: colors.ink,
    fontFamily: fonts.regular,
    fontSize: 16,
  },
  answer: { padding: 20, backgroundColor: colors.surface, borderRadius: 18, gap: 16 },
});
