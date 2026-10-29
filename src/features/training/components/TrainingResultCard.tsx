import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import {
  BookOpen,
  Check,
  CircleAlert,
  House,
  Minus,
  RefreshCw,
  ScanLine,
  Sparkle,
  X,
} from 'lucide-react-native';
import type { TrainingResult } from '@/api/training-history';
import { Button } from '@/components/ui/Button';
import { Card, HexBadge, Ribbon, type LucideIcon } from '@/components/ui/Game';
import { PageHeader } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors, fonts, type HexTone } from '@/theme/tokens';
import { modeName } from '../mode-ui';
import { presentResult, type OutcomeKind } from '../result-presentation';

type Look = {
  icon: LucideIcon;
  tone: HexTone;
  ribbon: string;
  ribbonShadow: string;
  glow: string;
};
const NEUTRAL_LOOK: Look = {
  icon: BookOpen,
  tone: 'neutral',
  ribbon: colors.hex.neutral,
  ribbonShadow: '#2A2F31',
  glow: '#939DA0',
};
/** Colours and icons per outcome; the words come from result-presentation. */
const LOOKS: Record<OutcomeKind, Look> = {
  Passed: {
    icon: Check,
    tone: 'exit',
    ribbon: colors.exit,
    ribbonShadow: '#1F6B44',
    glow: '#5FD08A',
  },
  NotPassed: {
    icon: X,
    tone: 'danger',
    ribbon: colors.hex.danger,
    ribbonShadow: '#2A2F31',
    glow: '#FF8F8F',
  },
  Incomplete: {
    icon: CircleAlert,
    tone: 'warning',
    ribbon: colors.hex.warning,
    ribbonShadow: '#7A5B12',
    glow: '#F2C14E',
  },
  Pending: {
    icon: RefreshCw,
    tone: 'warning',
    ribbon: colors.hex.warning,
    ribbonShadow: '#7A5B12',
    glow: '#F2C14E',
  },
  NotAssessed: NEUTRAL_LOOK,
  Unknown: NEUTRAL_LOOK,
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
 * Server-computed result screen; Mobile never decides Passed/NotPassed and never shows technical codes (wording in
 * result-presentation.ts). `onRetry` replays the same training (for NotAssessed `onAssessment` offers Assessment);
 * without either the learner is sent to scan the Building QR.
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
  const view = presentResult(result, { canReplay: !!(onRetry || onAssessment) });
  const look = LOOKS[view.outcome.kind];
  const meta = [view.thresholdText, modeName(result.mode), shortDate(result.createdAt)]
    .filter(Boolean)
    .join(' · ');
  const primary =
    view.primary.intent === 'assessment'
      ? (onAssessment ?? onRetry)
      : view.primary.intent === 'retry'
        ? (onRetry ?? onAssessment)
        : () => router.push('/scan-qr');
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <Burst color={look.glow}>
          <PageHeader title="Kết quả phiên" subtitle={subtitle} onBack={onClose} backIcon={X} />
          <View style={styles.hero}>
            <HexBadge icon={look.icon} tone={look.tone} size={150} />
            <Ribbon label={view.outcome.label} color={look.ribbon} shadow={look.ribbonShadow} />
            {view.scoreText !== null && <Text style={styles.score}>{view.scoreText}</Text>}
            <Text variant="small" muted style={styles.center}>
              {view.headline}
            </Text>
            <Text variant="small" dim style={styles.center}>
              {meta}
            </Text>
          </View>
        </Burst>
        <View style={styles.body}>
          {view.criteria.length > 0 && (
            <Card contentStyle={{ gap: 6 }}>
              <Text variant="caps" style={{ letterSpacing: 1.5 }}>
                TIÊU CHÍ
              </Text>
              {view.criteria.map((item) => (
                <View
                  key={item.id}
                  style={styles.criterion}
                  accessibilityLabel={`${item.label}: ${
                    item.state === 'passed'
                      ? 'đạt'
                      : item.state === 'failed'
                        ? 'chưa đạt'
                        : item.note
                  }`}
                >
                  <View style={[styles.tick, TICKS[item.state].box]}>
                    {item.state === 'passed' ? (
                      <Check size={13} color={colors.success} strokeWidth={3} />
                    ) : item.state === 'failed' ? (
                      <X size={13} color={colors.danger} strokeWidth={3} />
                    ) : (
                      <Minus size={13} color={colors.dim} strokeWidth={3} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.criterionTitle}>{item.label}</Text>
                    {!!item.note && (
                      <Text variant="small" muted>
                        {item.note}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </Card>
          )}
          <Text variant="small" dim style={{ fontSize: 11, lineHeight: 17 }}>
            {view.disclaimer}
          </Text>
        </View>
      </ScrollView>
      <View style={styles.actions}>
        {primary && (
          <Button
            title={view.primary.label}
            icon={view.primary.intent === 'scan' ? ScanLine : RefreshCw}
            onPress={primary}
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
            accessibilityLabel="Về trang chủ"
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

const TICKS = {
  passed: { box: { borderColor: colors.success, backgroundColor: colors.successSoft } },
  failed: { box: { borderColor: colors.danger, backgroundColor: colors.dangerSoft } },
  unavailable: { box: { borderColor: colors.dim, backgroundColor: 'transparent' } },
} as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  burst: { paddingHorizontal: 20, paddingVertical: 16, gap: 10 },
  hero: { alignItems: 'center', gap: 6, paddingVertical: 10 },
  center: { textAlign: 'center' },
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
