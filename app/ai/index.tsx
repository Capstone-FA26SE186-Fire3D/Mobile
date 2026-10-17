import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { ApiError } from '@/api';
import {
  getAiQuota,
  getAiRequest,
  listAiRequests,
  submitAiQuestion,
  type AiQuota,
  type AiRequest,
} from '@/api/trainee-ai';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSession } from '@/store/SessionProvider';
import { colors, fonts } from '@/theme/tokens';

function describe(issue: unknown): string {
  if (issue instanceof ApiError) {
    if (issue.payload?.code === 'AI_DAILY_QUOTA_EXHAUSTED')
      return 'Bạn đã dùng hết quota AI hôm nay.';
    if (issue.payload?.code === 'AI_BLOCKED_DURING_ASSESSMENT')
      return 'Không thể hỏi AI khi phiên Assessment đang mở.';
    if (issue.payload?.code === 'AI_CONTEXT_NOT_FOUND')
      return 'Bài Learn này không còn khả dụng để hỏi AI.';
    if (issue.payload?.code === 'AI_PROVIDER_UNAVAILABLE') return 'Dịch vụ AI chưa sẵn sàng.';
    return issue.message;
  }
  return issue instanceof Error ? issue.message : 'Không kết nối được Fire3D API.';
}

export default function AiScreen() {
  const { account } = useSession();
  const { postId, versionId, sessionId } = useLocalSearchParams<{
    postId?: string;
    versionId?: string;
    sessionId?: string;
  }>();
  const [quota, setQuota] = useState<AiQuota | null>(null);
  const [requests, setRequests] = useState<AiRequest[]>([]);
  const [selected, setSelected] = useState<AiRequest | null>(null);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const keyRef = useRef<string | null>(null);

  async function refresh() {
    if (!account) return;
    setError('');
    try {
      const [nextQuota, page] = await Promise.all([getAiQuota(), listAiRequests()]);
      setQuota(nextQuota);
      setRequests(page.items);
      if (selected) setSelected(await getAiRequest(selected.requestId));
    } catch (issue) {
      setError(describe(issue));
    }
  }

  useEffect(() => {
    void refresh();
  }, [account?.id]);
  useEffect(() => {
    if (!selected || !['Accepted', 'Processing'].includes(selected.status)) return;
    const id = setInterval(() => {
      void getAiRequest(selected.requestId)
        .then(setSelected)
        .catch((issue) => setError(describe(issue)));
    }, 5000);
    return () => clearInterval(id);
  }, [selected?.requestId, selected?.status]);

  async function submit() {
    const text = question.trim();
    if (!text || busy || !quota?.canSubmit) return;
    setBusy(true);
    setError('');
    keyRef.current ??= Crypto.randomUUID();
    try {
      const context =
        typeof postId === 'string' && typeof versionId === 'string'
          ? { kind: 'Learn' as const, postId, versionId }
          : typeof sessionId === 'string'
            ? { kind: 'Result' as const, sessionId }
            : undefined;
      const accepted = await submitAiQuestion(text, context, keyRef.current);
      setSelected(accepted);
      setRequests((current) => [
        accepted,
        ...current.filter((item) => item.requestId !== accepted.requestId),
      ]);
      setQuestion('');
      keyRef.current = null;
      setQuota(await getAiQuota());
    } catch (issue) {
      setError(describe(issue));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <PageHeader title="Trợ lý AI" onBack={() => router.back()} />
      {!account ? (
        <Notice>Đăng nhập Trainee để hỏi AI và xem lịch sử.</Notice>
      ) : (
        <>
          {quota && (
            <Notice>
              Quota hôm nay: còn {quota.remainingUnits} {quota.quotaUnit ?? 'đơn vị'}. Đặt trước mỗi
              câu hỏi: {quota.estimatedReserve ?? '—'}. Làm mới:{' '}
              {new Date(quota.resetsAt).toLocaleString('vi-VN')}.
            </Notice>
          )}
          {quota?.blockedByAssessment && (
            <Notice error>AI bị chặn trong phiên Assessment đang mở.</Notice>
          )}
          {!!error && <Notice error>{error}</Notice>}
          <Text variant="label">
            {postId && versionId
              ? 'Hỏi theo bài Learn đang mở'
              : sessionId
                ? 'Hỏi theo kết quả phiên'
                : 'Câu hỏi của bạn'}
          </Text>
          <TextInput
            accessibilityLabel="Câu hỏi AI"
            value={question}
            onChangeText={(value) => {
              setQuestion(value);
              keyRef.current = null;
            }}
            multiline
            placeholder="Bạn muốn biết gì?"
            style={styles.input}
          />
          <Button
            title="Gửi câu hỏi"
            loading={busy}
            disabled={
              !quota?.canSubmit ||
              !question.trim() ||
              !!(quota.maxInputChars && question.length > quota.maxInputChars)
            }
            onPress={() => void submit()}
          />
          <Button title="Làm mới trạng thái" variant="secondary" onPress={() => void refresh()} />
          {selected && (
            <View style={styles.card}>
              <Text variant="heading">Yêu cầu AI: {selected.status}</Text>
              {selected.resultWithheld ? (
                <Notice error>Kết quả đã bị ẩn vì ngữ cảnh không còn được phép xem.</Notice>
              ) : selected.status === 'Succeeded' ? (
                <>
                  <Text>
                    {selected.result?.answer ??
                      selected.result?.message ??
                      selected.resultType ??
                      'Không có câu trả lời.'}
                  </Text>
                  {selected.citations?.map((citation, index) => (
                    <Text key={index} muted>
                      Nguồn: {citation.title}
                      {citation.locator ? ` — ${citation.locator}` : ''}
                    </Text>
                  ))}
                </>
              ) : selected.status === 'NeedsReconcile' ? (
                <Notice>Yêu cầu đang chờ đối soát. Hãy kiểm tra lại sau.</Notice>
              ) : selected.status === 'Failed' ? (
                <Notice error>
                  Yêu cầu thất bại: {selected.failureCode ?? 'không rõ nguyên nhân'}.
                </Notice>
              ) : (
                <ActivityIndicator color={colors.primary} />
              )}
            </View>
          )}
          <Text variant="heading">Lịch sử câu hỏi</Text>
          {requests.map((item) => (
            <View key={item.requestId} style={styles.card}>
              <Text>{item.input.text}</Text>
              <Text muted>{item.status}</Text>
              <Button
                title="Xem yêu cầu"
                variant="secondary"
                onPress={() =>
                  void getAiRequest(item.requestId)
                    .then(setSelected)
                    .catch((issue) => setError(describe(issue)))
                }
              />
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 110,
    textAlignVertical: 'top',
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    fontFamily: fonts.regular,
    color: colors.ink,
  },
  card: { gap: 10, padding: 16, backgroundColor: colors.surface, borderRadius: 16 },
});
