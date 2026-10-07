import { useEffect, useState } from 'react';
import {
  ImageBackground,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, IconButton } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Notice } from '@/components/ui/Screen';
import { colors } from '@/theme/tokens';
import { useDemo } from '@/store/DemoProvider';
import { findTraining } from '@/features/buildings/buildings.model';
import { formatDuration, gameScenes, getModeLabel, type GameSceneId } from '../game.model';

const sceneImages: Record<GameSceneId, ImageSourcePropType> = {
  start: require('../../../../assets/images/game-start.png'),
  corridor: require('../../../../assets/images/game-corridor.png'),
  junction: require('../../../../assets/images/game-junction.png'),
  blocked: require('../../../../assets/images/game-junction.png'),
  exit: require('../../../../assets/images/game-exit.png'),
};

export default function GameScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { state, reduceMotion, chooseScene, pauseSession, resumeSession, restartSession } =
    useDemo();
  const session =
    typeof sessionId === 'string'
      ? state.sessions.find((candidate) => candidate.id === sessionId)
      : undefined;
  const [pauseVisible, setPauseVisible] = useState(session?.status === 'paused');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (session?.status === 'paused') setPauseVisible(true);
  }, [session?.status]);

  if (!session) return <MissingSession />;
  const match = findTraining(session.trainingId);
  if (!match || match.building.id !== session.buildingId) return <MissingSession />;
  if (session.status === 'completed')
    return (
      <SafeAreaView style={styles.missing}>
        <Notice>Phiên này đã hoàn thành và có debrief cục bộ.</Notice>
        <Button
          title="Xem debrief"
          onPress={() =>
            router.replace({ pathname: '/results/[sessionId]', params: { sessionId: session.id } })
          }
        />
      </SafeAreaView>
    );

  const scene = gameScenes[session.checkpoint.sceneId];
  const hintsVisible = session.mode !== 'assessment';
  const smokeVisible = scene.id === 'junction' || scene.id === 'blocked';

  function choose(choiceId: string) {
    const choice = scene.choices.find((item) => item.id === choiceId);
    if (!choice) return;
    setFeedback(choice.feedback);
    chooseScene(session!.id, choice.id);
    if (!choice.nextScene)
      router.replace({
        pathname: '/results/[sessionId]',
        params: { sessionId: session!.id },
      });
  }

  function openPause() {
    pauseSession(session!.id);
    setPauseVisible(true);
  }

  function resume() {
    resumeSession(session!.id);
    setPauseVisible(false);
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ImageBackground source={sceneImages[scene.id]} resizeMode="cover" style={styles.background}>
        <LinearGradient
          colors={['rgba(20,28,25,0.72)', 'transparent', 'rgba(20,28,25,0.92)']}
          locations={[0, 0.46, 1]}
          style={StyleSheet.absoluteFill}
        />
        {smokeVisible && (
          <Animated.View
            entering={reduceMotion ? undefined : FadeIn.duration(500)}
            pointerEvents="none"
            style={[styles.smoke, scene.id === 'blocked' && styles.smokeHeavy]}
          />
        )}
        <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
          <View style={styles.topHud}>
            <View style={styles.modePill}>
              <View style={styles.liveDot} />
              <Text variant="small" style={styles.lightText}>
                {getModeLabel(session.mode)} · DEMO
              </Text>
            </View>
            <IconButton name="pause" label="Tạm dừng mô phỏng" onPress={openPause} />
          </View>
          <View style={styles.metrics}>
            <Metric icon="time-outline" label={formatDuration(session.checkpoint.elapsedSeconds)} />
            <Metric
              icon="layers-outline"
              label={`${Math.min(scene.step, 5)}/5`}
              accessibilityLabel={`Bước ${Math.min(scene.step, 5)} trên 5`}
            />
            <Metric
              icon="pulse-outline"
              label={`${session.checkpoint.modeledExposure}%`}
              accessibilityLabel={`Mức tiếp xúc mô phỏng ${session.checkpoint.modeledExposure} phần trăm`}
            />
          </View>
          <View style={styles.stage}>
            {hintsVisible && scene.id === 'junction' && (
              <View style={styles.routeMarker}>
                <Ionicons name="navigate" size={19} color={colors.ink} />
                <Text variant="small">Route mô phỏng A</Text>
              </View>
            )}
            {hintsVisible && scene.hotspot && (
              <View style={styles.hotspot} accessibilityLabel={scene.hotspot}>
                <View style={styles.hotspotCore} />
                <Text variant="small" style={styles.hotspotLabel}>
                  {scene.hotspot}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.bottomHud}>
            <View style={styles.objective}>
              <Text variant="small" style={styles.eyebrow}>
                MỤC TIÊU HIỆN TẠI
              </Text>
              <Text variant="heading" style={styles.lightText}>
                {scene.objective}
              </Text>
              <Text variant="small" style={styles.dimText}>
                {scene.description}
              </Text>
            </View>
            {hintsVisible && (
              <View style={styles.hint} accessibilityLiveRegion="polite">
                <Ionicons name="bulb-outline" size={18} color="#F7D7A9" />
                <View style={styles.flex}>
                  <Text variant="small" style={styles.hintTitle}>
                    GỢI Ý MÔ PHỎNG
                  </Text>
                  <Text variant="small" style={styles.lightText}>
                    {scene.hint}
                  </Text>
                </View>
              </View>
            )}
            {!!feedback && (
              <Text variant="small" style={styles.feedback} accessibilityLiveRegion="polite">
                {feedback}
              </Text>
            )}
            <View style={styles.choices}>
              {scene.choices.map((choice) => (
                <Pressable
                  key={choice.id}
                  accessibilityRole="button"
                  accessibilityLabel={choice.label}
                  onPress={() => choose(choice.id)}
                  style={({ pressed }) => [styles.choice, pressed && styles.choicePressed]}
                >
                  <View style={styles.choiceCopy}>
                    <Text variant="label">{choice.label}</Text>
                    <Text variant="small" muted>
                      {choice.description}
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={20} color={colors.ink} />
                </Pressable>
              ))}
            </View>
          </View>
        </SafeAreaView>
      </ImageBackground>
      <Modal
        visible={pauseVisible}
        transparent
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={resume}
      >
        <View style={styles.modalOverlay}>
          <View accessibilityViewIsModal style={styles.pauseCard}>
            <View style={styles.pauseIcon}>
              <Ionicons name="pause" size={30} color={colors.green} />
            </View>
            <Text variant="title">Đã tạm dừng</Text>
            <Text muted>
              Checkpoint bước {session.checkpoint.sequence + 1} đã được lưu cục bộ trên thiết bị.
            </Text>
            <Button title="Tiếp tục" icon="play-outline" onPress={resume} />
            <Button
              title="Bắt đầu lại"
              variant="secondary"
              onPress={() => {
                restartSession(session.id);
                setFeedback('');
                setPauseVisible(false);
              }}
            />
            <Button
              title="Lưu và về sảnh"
              variant="ghost"
              onPress={() => router.dismissTo('/(tabs)')}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Metric({
  icon,
  label,
  accessibilityLabel,
}: {
  icon: 'time-outline' | 'layers-outline' | 'pulse-outline';
  label: string;
  accessibilityLabel?: string;
}) {
  return (
    <View style={styles.metric} accessibilityLabel={accessibilityLabel ?? label}>
      <Ionicons name={icon} size={16} color="#EDF1E6" />
      <Text variant="small" style={styles.lightText}>
        {label}
      </Text>
    </View>
  );
}

function MissingSession() {
  return (
    <SafeAreaView style={styles.missing}>
      <Notice error>Phiên mô phỏng không tồn tại hoặc đường dẫn không hợp lệ.</Notice>
      <Button title="Về sảnh tòa nhà" onPress={() => router.dismissTo('/(tabs)')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', overflow: 'hidden', backgroundColor: '#17201C' },
  background: { flex: 1, width: '100%', overflow: 'hidden' },
  safe: { flex: 1, paddingHorizontal: 16 },
  topHud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  modePill: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 15,
    backgroundColor: 'rgba(22,31,27,0.82)',
    paddingHorizontal: 13,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  metrics: { flexDirection: 'row', gap: 8, marginTop: 10 },
  metric: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(22,31,27,0.76)',
    paddingHorizontal: 10,
  },
  stage: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  routeMarker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 18,
    backgroundColor: '#F2A66FEE',
    paddingHorizontal: 14,
    paddingVertical: 9,
    transform: [{ translateY: 18 }],
  },
  hotspot: { alignItems: 'center', gap: 8 },
  hotspotCore: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 8,
    borderColor: '#F7F3EACC',
    backgroundColor: colors.primary,
  },
  hotspotLabel: {
    color: colors.ink,
    backgroundColor: '#FFFCF7E8',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  smoke: {
    ...StyleSheet.absoluteFill,
    top: '24%',
    bottom: '34%',
    backgroundColor: 'rgba(72,80,74,0.20)',
  },
  smokeHeavy: { backgroundColor: 'rgba(51,59,54,0.38)' },
  bottomHud: { gap: 10, paddingBottom: 8 },
  objective: { gap: 3 },
  eyebrow: { color: '#F7D7A9', fontSize: 10, letterSpacing: 1 },
  lightText: { color: '#FFFCF7' },
  dimText: { color: '#D6DDD5' },
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderRadius: 14,
    backgroundColor: 'rgba(34,55,46,0.88)',
    padding: 12,
  },
  hintTitle: { color: '#F7D7A9', fontSize: 10 },
  feedback: {
    color: '#FFFCF7',
    backgroundColor: 'rgba(37,43,45,0.76)',
    borderRadius: 12,
    padding: 10,
  },
  choices: { gap: 8 },
  choice: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    backgroundColor: '#FFFCF7F2',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  choicePressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  choiceCopy: { flex: 1 },
  flex: { flex: 1 },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(20,28,25,0.76)',
    padding: 24,
  },
  pauseCard: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 26,
    backgroundColor: colors.background,
    padding: 24,
    gap: 16,
  },
  pauseIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missing: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
    backgroundColor: colors.background,
    padding: 24,
  },
});
