import { useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  parseHandoffCode,
  parseQrToken,
  scanMismatch,
  scanMismatchText,
} from '@/features/qr/qr-token';
import { useSession } from '@/store/SessionProvider';
import { colors, fonts } from '@/theme/tokens';

/** Trainee: Building QR → /qr/<token>. OrganizationUser: the playtest handoff QR shown on the Web → /playtest/handoff. */
export default function ScanQrScreen() {
  const { account } = useSession();
  const handoff = account?.role === 'OrganizationUser';
  const [permission, requestPermission] = useCameraPermissions();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const locked = useRef(false);

  function open(value: string) {
    if (locked.current) return;
    const code = handoff ? parseHandoffCode(value) : parseQrToken(value);
    if (!code) {
      const expecting = handoff ? 'handoff' : 'building';
      setError(scanMismatchText(scanMismatch(value, expecting), expecting));
      return;
    }
    locked.current = true;
    setError('');
    if (handoff) router.replace({ pathname: '/playtest/handoff', params: { code } });
    else router.push(`/qr/${code}`);
    setTimeout(() => {
      locked.current = false;
    }, 1000);
  }

  return (
    <Screen>
      <PageHeader
        title={handoff ? 'Quét mã bàn giao playtest' : 'Quét mã Building'}
        onBack={() => router.back()}
      />
      <Text muted>
        {handoff
          ? 'Trên Web, mở tab Playtest của phiên bản và bấm chuyển sang Mobile, rồi quét QR hiện ra hoặc dán đường dẫn bên dưới.'
          : 'Quét QR do tổ chức cấp hoặc dán đường dẫn/mã bên dưới.'}
      </Text>
      {Platform.OS !== 'web' && permission?.granted ? (
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => open(data)}
        />
      ) : Platform.OS !== 'web' ? (
        <Button title="Cho phép dùng camera" onPress={() => void requestPermission()} />
      ) : null}
      <View style={styles.form}>
        <Text variant="label">{handoff ? 'Đường dẫn hoặc mã bàn giao' : 'URL QR hoặc token'}</Text>
        <TextInput
          accessibilityLabel={handoff ? 'Đường dẫn hoặc mã bàn giao' : 'URL QR hoặc token'}
          autoCapitalize="none"
          autoCorrect={false}
          value={input}
          onChangeText={setInput}
          placeholder={handoff ? 'fet3d://playtest/handoff?code=...' : 'https://fet3d.io.vn/qr/...'}
          style={styles.input}
        />
        {!!error && <Notice error>{error}</Notice>}
        <Button title={handoff ? 'Nhận playtest' : 'Mở Building'} onPress={() => open(input)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  camera: { height: 290, borderRadius: 16, overflow: 'hidden' },
  form: { gap: 12 },
  input: {
    minHeight: 54,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    fontFamily: fonts.regular,
    color: colors.ink,
  },
});
