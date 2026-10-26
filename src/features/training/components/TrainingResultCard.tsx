import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { BookOpen, Check, CircleAlert, House, RefreshCw, Sparkle, X } from 'lucide-react-native';
import type { TrainingResult } from '@/api/training-history';
import { Button } from '@/components/ui/Button';
import { Card, HexBadge, Ribbon, type LucideIcon } from '@/components/ui/Game';
import { PageHeader } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors, fonts, type HexTone } from '@/theme/tokens';
import { modeName } from '../mode-ui';

type Outcome = {
  label: string;
  icon: LucideIcon;
  tone: HexTone;
  ribbon: string;
  ribbonShadow: string;
  glow: string;
};
const OUTCOMES: Record<string, Outcome> = {
  Passed: {
    label: 'Đạt',
    icon: Check,
    tone: 'exit',
    ribbon: colors.exit,
    ribbonShadow: '#1F6B44',
    glow: '#5FD08A',
  },
  NotPassed: {
    label: 'Chưa đạt',
    icon: X,
    tone: 'danger',
    ribbon: colors.hex.danger,
    ribbonShadow: '#2A2F31',
    glow: '#FF8F8F',
  },
  Incomplete: {
    label: 'Chưa hoàn thành',
    icon: CircleAlert,
    tone: 'warning',
    ribbon: colors.hex.warning,
    ribbonShadow: '#7A5B12',
    glow: '#F2C14E',
  },
  NotAssessed: {
    label: 'Không chấm điểm',
    icon: BookOpen,
    tone: 'neutral',
    ribbon: colors.hex.neutral,
    ribbonShadow: '#2A2F31',
    glow: '#939DA0',
  },
};

export function modeTitle(mode: string): string {
  return modeName(mode);
}

const shortDate = (iso: string) => {
  const date = new Date(iso);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
};

/** Soft radial glow behind the outcome badge (Figma "Burst"). */
export function Burst({ color, children }: { color: string; children: ReactNode }) {
  return (
    <View style={styles.burst}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="burst" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.3} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#burst)" />
      </Svg>
      {children}
    </View>
  );
}

/**
 * Server-computed result screen; Mobile never decides Passed/NotPassed and never shows technical codes.
 * `onRetry` replays the same training; for a NotAssessed result it offers Assessment instead.
 */
export function TrainingResultView({
  result,
  subtitle,
  onClose,
  onRetry,
  onAssessment,
}: {
  result: TrainingResult;
  subtitle?: string;
  onClose: () => void;
  onRetry?: () => void;
  onAssessment?: () => void;
}) {
  const outcome =
    OUTCOMES[result.outcome] ??
    ({ ...OUTCOMES.NotAssessed, label: result.outcome } satisfies Outcome);
  const notAssessed = result.outcome === 'NotAssessed';
  const meta = [
    result.passThresholdPercent !== null ? `ngưỡng ${result.passThresholdPercent}%` : null,
    modeName(result.mode),
    shortDate(result.createdAt),
  ]
    .filter(Boolean)
    .join(' · ');
  const retry = notAssessed ? (onAssessment ?? onRetry) : onRetry;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <Burst color={outcome.glow}>
          <PageHeader title="Kết quả phiên" subtitle={subtitle} onBack={onClose} backIcon={X} />
          <View style={styles.hero}>
            <HexBadge icon={outcome.icon} tone={outcome.tone} size={150} />
            <Ribbon label={outcome.label} color={outcome.ribbon} shadow={outcome.ribbonShadow} />
            {result.scorePercent !== null && (
              <Text style={styles.score}>{result.scorePercent}%</Text>
            )}
            {notAssessed ? (
              <Text variant="small" muted style={{ textAlign: 'center' }}>
                Học và Diễn tập không chấm Đạt/Chưa đạt. Chọn Đánh giá để được chấm.
              </Text>
            ) : result.outcome === 'Incomplete' ? (
              <Text variant="small" muted>
                Phiên kết thúc trước khi hoàn thành tình huống.
              </Text>
            ) : (
              <Text variant="small" muted>
                {meta}
              </Text>
            )}
          </View>
        </Burst>
        <View style={styles.body}>
          {!!result.criteria?.length && (
            <Card contentStyle={{ gap: 6 }}>
              <Text variant="caps" style={{ letterSpacing: 1.5 }}>
                TIÊU CHÍ
              </Text>
              {result.criteria.map((item) => (
                <View key={item.id} style={styles.criterion}>
                  <View
                    style={[
                      styles.tick,
                      item.passed
                        ? { borderColor: colors.success, backgroundColor: colors.successSoft }
                        : { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
                    ]}
                  >
                    {item.passed ? (
                      <Check size={13} color={colors.success} strokeWidth={3} />
                    ) : (
                      <X size={13} color={colors.danger} strokeWidth={3} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.criterionTitle}>{item.label ?? item.metric}</Text>
                    {!!item.reason && (
                      <Text variant="small" muted>
                        {item.reason}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </Card>
          )}
          <Text variant="small" dim style={{ fontSize: 11, lineHeight: 17 }}>
            Kết quả do Fire3D chấm cho mục đích học tập, không phải chứng nhận an toàn PCCC. Làm lại
            không giới hạn.
          </Text>
        </View>
      </ScrollView>
      <View style={styles.actions}>
        {retry && (
          <Button
            title={notAssessed ? 'Thử Đánh giá' : 'Làm lại bài'}
            icon={RefreshCw}
            onPress={retry}
          />
        )}
        <View style={styles.pair}>
          <Button
            title="Hỏi AI"
            icon={Sparkle}
            variant="secondary"
            size="sm"
            style={{ flex: 1 }}
            onPress={() =>
              router.push({ pathname: '/ai', params: { sessionId: result.sessionId } })
            }
          />
          <Button
            title="Trang chủ"
            icon={House}
            variant="secondary"
            size="sm"
            style={{ flex: 1 }}
            onPress={() => router.replace('/(tabs)')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  burst: { paddingHorizontal: 20, paddingVertical: 16, gap: 10 },
  hero: { alignItems: 'center', gap: 6, paddingVertical: 10 },
  score: { fontFamily: fonts.black, fontSize: 44, lineHeight: 54 },
  body: { padding: 16, gap: 12 },
  criterion: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  criterionTitle: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
  actions: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  pair: { flexDirection: 'row', gap: 10 },
});
