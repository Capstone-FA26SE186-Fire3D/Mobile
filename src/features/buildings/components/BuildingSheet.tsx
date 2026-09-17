import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Button, IconButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Screen';
import { colors } from '@/theme/tokens';
import { useDemo } from '@/store/DemoProvider';
import { getLaunchIssue, type Building } from '../buildings.model';
import { BuildingArt } from './BuildingArt';

export function BuildingSheet({
  building,
  onClose,
}: {
  building: Building | null;
  onClose: () => void;
}) {
  const { reduceMotion } = useDemo();
  const insets = useSafeAreaInsets();
  if (!building) return null;
  const issue = getLaunchIssue(building);
  function launch() {
    onClose();
    router.push({ pathname: '/training/[id]', params: { id: building!.id } });
  }
  return (
    <Modal
      visible
      transparent
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng thông tin tòa nhà"
          onPress={onClose}
          style={styles.scrim}
        />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}
        >
          <View style={styles.handle} />
          <View style={styles.top}>
            <Text variant="small" muted>
              KHÔNG GIAN TẬP HUẤN
            </Text>
            <IconButton name="close" label="Đóng" onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.summary}>
              <BuildingArt kind={building.art} style={styles.art} />
              <View style={{ flex: 1, gap: 6 }}>
                <Text variant="small" muted>
                  {building.kind} · {building.floors} tầng
                </Text>
                <Text variant="heading">{building.name}</Text>
                <Text variant="small" style={{ color: issue ? colors.red : colors.green }}>
                  {issue ? 'Bài tập đã đóng' : 'Có bài tập đang mở'}
                </Text>
              </View>
            </View>
            <View style={styles.training}>
              <View style={styles.trainingTitle}>
                <Ionicons name="flag-outline" size={20} color={colors.green} />
                <Text variant="small" muted>
                  BÀI TẬP HUẤN
                </Text>
              </View>
              <Text variant="heading" style={{ fontSize: 18 }}>
                {building.training}
              </Text>
              <View style={styles.meta}>
                <Ionicons name="time-outline" size={17} color={colors.muted} />
                <Text variant="small" muted>
                  Khoảng {building.minutes} phút
                </Text>
                <Text variant="small" muted>
                  ·
                </Text>
                <Text variant="small" muted>
                  Có hướng dẫn
                </Text>
              </View>
            </View>
            {issue ? (
              <Notice error>{issue}</Notice>
            ) : (
              <Text muted variant="small">
                Làm quen không gian, nhận biết lối đi và luyện tập quyết định trong môi trường mô
                phỏng.
              </Text>
            )}
            <Button
              title={issue ? 'Quét mã QR mới' : 'Vào tập huấn'}
              icon={issue ? 'qr-code-outline' : 'play-outline'}
              onPress={
                issue
                  ? () => {
                      onClose();
                      router.push('/scan');
                    }
                  : launch
              }
            />
            <Text variant="small" muted style={{ textAlign: 'center' }}>
              Nội dung mẫu · Chưa kết nối trò chơi Unity
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(35,42,36,0.38)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 10,
    width: '100%',
    maxWidth: 560,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    height: 4,
    width: 38,
    borderRadius: 4,
    backgroundColor: '#CECFC3',
    marginBottom: 7,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  content: { gap: 18, paddingBottom: 4 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  art: { width: 118, height: 128 },
  training: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    borderRadius: 18,
    gap: 10,
  },
  trainingTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
});
