import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookOpen, History, Lock } from 'lucide-react-native';
import { ApiError } from '@/api';
import {
  getAiQuota,
  getAiRequest,
  listAiRequests,
  submitAiQuestion,
  type AiQuota,
  type AiRequest,
} from '@/api/trainee-ai';
import { IconButton } from '@/components/ui/Button';
import { Bubble, Composer } from '@/components/ui/Chat';
import { Callout, Pill } from '@/components/ui/Game';
import { Notice, PageHeader } from '@/components/ui/Screen';
import { StateView } from '@/components/ui/StateScreen';
import { Text } from '@/components/ui/Text';
import { useSession } from '@/store/SessionProvider';
import { colors, fonts } from '@/theme/tokens';

function describe(issue: unknown): string {
  if (issue instanceof ApiError) {
    if (issue.payload?.code === 'AI_DAILY_QUOTA_EXHAUSTED') return 'Bạn đã dùng hết lượt hôm nay.';
    if (issue.payload?.code === 'AI_BLOCKED_DURING_ASSESSMENT')
      return 'Không thể hỏi AI khi phiên Assessment đang mở.';
    if (issue.payload?.code === 'AI_CONTEXT_NOT_FOUND')
      return 'Bài Learn này không còn khả dụng để hỏi AI.';
    if (issue.payload?.code === 'AI_PROVIDER_UNAVAILABLE') return 'Dịch vụ AI chưa sẵn sàng.';
    return issue.message;
  }
  return issue instanceof Error ? issue.message : 'Không kết nối được Fire3D API.';
}

const PENDING = ['Accepted', 'Processing'];
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

function Answer({ request }: { request: AiRequest }) {
  if (request.resultWithheld)
    return (
      <Bubble>
        <Text muted>Kết quả đã bị ẩn vì ngữ cảnh không còn được phép xem.</Text>
      </Bubble>
    );
  if (PENDING.includes(request.status))
    return (
      <Bubble>
        <View style={styles.dots} accessibilityLabel="AI đang trả lời">
          {[1, 0.7, 0.45].map((opacity) => (
            <View key={opacity} style={[styles.dot, { opacity }]} />
          ))}
        </View>
      </Bubble>
    );
  if (request.status === 'Failed')
    return <Callout tone="danger">Chưa trả lời được câu này. Hãy thử hỏi lại.</Callout>;
  if (request.status === 'NeedsReconcile')
    return <Callout tone="info">Yêu cầu đang chờ đối soát. Hãy kiểm tra lại sau.</Callout>;
  return (
    <Bubble>
      <Text style={styles.text}>
        {request.result?.answer ?? request.result?.message ?? 'Không có câu trả lời.'}
      </Text>
      {!!request.citations?.length && (
        <View style={styles.citations}>
          {request.citations.map((citation, index) => (
            <Pill key={index} label={citation.title} tone="info" />
          ))}
        </View>
      )}
    </Bubble>
  );
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
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const keyRef = useRef<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  async function refresh() {
    if (!account) return;
    setError('');
    try {
      const [nextQuota, page] = await Promise.all([getAiQuota(), listAiRequests()]);
      setQuota(nextQuota);
      setRequests(page.items);
    } catch (issue) {
      setError(describe(issue));
    }
  }

  const replace = (next: AiRequest) =>
    setRequests((current) => [
      next,
      ...current.filter((item) => item.requestId !== next.requestId),
    ]);

  useEffect(() => {
    void refresh();
  }, [account?.id]);
  const pendingId = requests.find((item) => PENDING.includes(item.status))?.requestId;
  useEffect(() => {
    if (!pendingId) return;
    const id = setInterval(() => {
      void getAiRequest(pendingId)
        .then((next) =>
          setRequests((current) =>
            current.map((item) => (item.requestId === next.requestId ? next : item)),
          ),
        )
        .catch((issue) => setError(describe(issue)));
    }, 5000);
    return () => clearInterval(id);
  }, [pendingId]);

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
      replace(await submitAiQuestion(text, context, keyRef.current));
      setQuestion('');
      keyRef.current = null;
      setQuota(await getAiQuota());
    } catch (issue) {
      setError(describe(issue));
    } finally {
      setBusy(false);
    }
  }

  const blocked = !!quota?.blockedByAssessment;
  const exhausted = !!quota && !blocked && (!quota.canSubmit || quota.remainingUnits <= 0);
  const tooLong = !!(quota?.maxInputChars && question.length > quota.maxInputChars);
  const canSend = !!quota?.canSubmit && !!question.trim() && !tooLong && !busy;
  const subtitle = !quota
    ? undefined
    : exhausted
      ? 'Hết lượt hôm nay'
      : quota.dailyUnits
        ? `Còn ${quota.remainingUnits}/${quota.dailyUnits} lượt hôm nay`
        : `Còn ${quota.remainingUnits} lượt hôm nay`;
  const context =
    postId && versionId
      ? 'Đang hỏi theo bài Learn đang mở'
      : sessionId
        ? 'Đang hỏi theo kết quả phiên của bạn'
        : 'Hỏi về bài học, kết quả của bạn';
  const thread = [...requests].reverse();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <PageHeader title="Trợ lý AI" subtitle={subtitle} onBack={() => router.back()}>
            {account && (
              <IconButton icon={History} label="Tải lại lịch sử" onPress={() => void refresh()} />
            )}
          </PageHeader>
        </View>
        <View style={styles.context}>
          <BookOpen size={14} color={colors.muted} strokeWidth={2} />
          <Text variant="small" muted style={{ flex: 1 }}>
            {blocked ? 'Phiên Assessment đang mở' : context}
          </Text>
        </View>
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.thread}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        >
          {!account ? (
            <Notice>Đăng nhập học viên để hỏi AI và xem lịch sử.</Notice>
          ) : blocked ? (
            <StateView
              icon={Lock}
              tone="warning"
              ribbon="AI tạm khóa"
              body="Bạn không thể hỏi AI khi một phiên Assessment đang mở. Hoàn thành hoặc đóng phiên để hỏi lại."
            />
          ) : (
            <>
              {thread.map((item) => (
                <View key={item.requestId} style={{ gap: 12 }}>
                  <Bubble mine>
                    <Text style={styles.text}>{item.input.text}</Text>
                  </Bubble>
                  <Answer request={item} />
                </View>
              ))}
              {exhausted && (
                <Callout tone="danger">
                  {`Bạn đã dùng hết lượt hôm nay. Lượt mới được làm mới lúc ${time(quota!.resetsAt)}.`}
                </Callout>
              )}
            </>
          )}
          {!!error && <Notice error>{error}</Notice>}
        </ScrollView>
        {account && (
          <Composer
            label="Câu hỏi AI"
            sendLabel="Gửi câu hỏi"
            value={question}
            editable={!blocked && !exhausted}
            onChangeText={(value) => {
              setQuestion(value);
              keyRef.current = null;
            }}
            onSend={() => void submit()}
            canSend={canSend}
            busy={busy}
            placeholder={
              blocked
                ? 'Đang khóa trong Assessment'
                : exhausted
                  ? 'Hết lượt — chờ sang ngày mới'
                  : 'Hỏi về bài học, kết quả của bạn…'
            }
            footnote={
              tooLong
                ? `Câu hỏi tối đa ${quota?.maxInputChars} ký tự.`
                : `Mỗi câu hỏi dùng khoảng ${quota?.estimatedReserve ?? 1} lượt · AI có thể sai, hãy kiểm tra nguồn`
            }
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingVertical: 6 },
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.bgSoft,
  },
  thread: { padding: 16, gap: 12, flexGrow: 1 },
  text: { fontSize: 14, lineHeight: 21 },
  citations: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dots: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ember },
});
