import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUpRight, FileText, ScanLine, Search, Sparkle, X } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Field, Raised, Ribbon } from '@/components/ui/Game';
import { Notice } from '@/components/ui/Screen';
import { StateScreen } from '@/components/ui/StateScreen';
import { Text } from '@/components/ui/Text';
import { parseHandoffCode, parseQrToken } from '@/features/qr/qr-token';
import { useSession } from '@/store/SessionProvider';
import { colors, fonts } from '@/theme/tokens';

function HeaderButton({
  icon: Icon,
  label,
  onPress,
  active,
}: {
  icon: typeof X;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}>
      {({ pressed }) => (
        <Raised depth={3} radius={16} pressed={pressed} faceStyle={styles.headerButton}>
          <Icon size={20} color={active ? colors.hex.warning : colors.text} strokeWidth={2.25} />
        </Raised>
      )}
    </Pressable>
  );
}

function Corner({ style }: { style: object }) {
  return <View style={[styles.corner, style]} />;
}

/** Trainee: Building QR → /qr/<token>. OrganizationUser: the playtest handoff QR shown on the Web → /playtest/handoff. */
export default function ScanQrScreen() {
  const { account } = useSession();
  const handoff = account?.role === 'OrganizationUser';
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState(Platform.OS === 'web');
  const [torch, setTorch] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const locked = useRef(false);
  const camera = Platform.OS !== 'web';
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (camera && permission && !permission.granted && permission.canAskAgain)
      void requestPermission();
  }, [camera, permission, requestPermission]);

  function open(value: string) {
    if (locked.current) return;
    const code = handoff ? parseHandoffCode(value) : parseQrToken(value);
    if (!code) {
      setError(
        handoff
          ? 'Đây không phải mã bàn giao playtest. Quét QR trong tab Playtest trên Web (mã có hạn 5 phút).'
          : 'Mã không hợp lệ. Hãy dán đúng liên kết có dạng https://…/qr/<mã> hoặc mã 43 ký tự.',
      );
      setManual(true);
      return;
    }
    locked.current = true;
    setError('');
    setManual(false);
    if (handoff) router.replace({ pathname: '/playtest/handoff', params: { code } });
    else router.push(`/qr/${code}`);
    setTimeout(() => {
      locked.current = false;
    }, 1000);
  }

  const title = handoff ? 'Quét mã bàn giao' : 'Quét QR tòa nhà';
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (camera && permission && !permission.granted && !permission.canAskAgain && !manual)
    return (
      <StateScreen
        header={title}
        onBack={close}
        icon={ScanLine}
        tone="danger"
        ribbon="Cần quyền camera"
        title="FET3D cần camera để quét QR"
        body="Bạn có thể cho phép trong Cài đặt Android, hoặc nhập mã QR thủ công."
        actions={
          <>
            <Button
              title="Mở cài đặt quyền"
              icon={ArrowUpRight}
              onPress={() => void Linking.openSettings()}
            />
            <Button
              title="Nhập mã thủ công"
              variant="secondary"
              size="sm"
              onPress={() => setManual(true)}
            />
          </>
        }
      />
    );

  return (
    <View style={styles.root}>
      {camera && permission?.granted && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => open(data)}
        />
      )}
      <View style={styles.dim} pointerEvents="none" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <HeaderButton icon={X} label="Đóng" onPress={close} />
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {camera ? (
            <HeaderButton
              icon={Sparkle}
              label={torch ? 'Tắt đèn' : 'Bật đèn'}
              active={torch}
              onPress={() => setTorch(!torch)}
            />
          ) : (
            <View style={{ width: 46 }} />
          )}
        </View>
        <View style={styles.viewfinder} pointerEvents="none">
          <View style={styles.frame}>
            <Corner style={{ top: 0, left: 0, borderTopWidth: 8, borderLeftWidth: 8 }} />
            <Corner style={{ top: 0, right: 0, borderTopWidth: 8, borderRightWidth: 8 }} />
            <Corner style={{ bottom: 0, left: 0, borderBottomWidth: 8, borderLeftWidth: 8 }} />
            <Corner style={{ bottom: 0, right: 0, borderBottomWidth: 8, borderRightWidth: 8 }} />
            <View style={styles.laser} />
          </View>
          <Ribbon label={handoff ? 'Đưa mã bàn giao vào khung' : 'Đưa mã QR vào khung'} />
        </View>
        <View style={[styles.panel, { paddingBottom: 20 + insets.bottom }]}>
          <Text style={styles.panelTitle}>Không quét được?</Text>
          <Text variant="small" muted>
            {handoff
              ? 'Dán đường dẫn bàn giao từ tab Playtest trên Web.'
              : 'Nhập mã hoặc dán liên kết QR của tòa nhà.'}
          </Text>
          <Button
            title="Nhập mã thủ công"
            icon={FileText}
            variant="secondary"
            size="sm"
            onPress={() => setManual(true)}
          />
        </View>
      </SafeAreaView>

      <Modal
        transparent
        visible={manual}
        animationType="slide"
        onRequestClose={() => setManual(false)}
      >
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={{ flex: 1 }}
            accessibilityLabel="Đóng"
            onPress={() => setManual(false)}
          />
          <View style={[styles.sheet, { paddingBottom: 28 + insets.bottom }]}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>
              {handoff ? 'Nhập mã bàn giao' : 'Nhập mã tòa nhà'}
            </Text>
            <Text muted style={{ fontSize: 13, lineHeight: 19 }}>
              {handoff
                ? 'Dán đường dẫn fet3d://playtest/handoff?code=… hiện trên Web.'
                : 'Dán liên kết fet3d.io.vn/qr/… hoặc mã 43 ký tự.'}
            </Text>
            <Field
              label={handoff ? 'Đường dẫn hoặc mã bàn giao' : 'Liên kết hoặc mã QR'}
              icon={Search}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => open(input)}
              placeholder={handoff ? 'fet3d://playtest/handoff?code=…' : 'https://fet3d.io.vn/qr/…'}
              error={!!error}
            />
            {!!error && <Notice error>{error}</Notice>}
            <Button
              title={handoff ? 'Nhận playtest' : 'Mở tòa nhà'}
              icon={ArrowUpRight}
              onPress={() => open(input)}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1B2124' },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  headerButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.black,
    fontSize: 17,
    lineHeight: 23,
    color: '#F3F5F4',
  },
  viewfinder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  frame: { width: 270, height: 270, justifyContent: 'center', alignItems: 'center' },
  corner: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderColor: colors.ribbon,
    borderRadius: 4,
  },
  laser: {
    width: 240,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ribbon,
    shadowColor: colors.ribbon,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  panel: {
    gap: 12,
    padding: 20,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: colors.lineStrong,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  panelTitle: { fontFamily: fonts.black, fontSize: 15, lineHeight: 20 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    gap: 14,
    padding: 20,
    paddingBottom: 28,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: colors.lineStrong,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.lineStrong,
  },
  sheetTitle: { fontFamily: fonts.black, fontSize: 22, lineHeight: 29 },
});
