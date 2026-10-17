import { useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { parseQrToken } from '@/features/qr/qr-token';
import { colors, fonts } from '@/theme/tokens';

export default function ScanQrScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const locked = useRef(false);

  function open(value: string) {
    if (locked.current) return;
    const token = parseQrToken(value);
    if (!token) {
      setError('Mã QR phải là token 43 ký tự hoặc URL HTTPS dạng /qr/<token>.');
      return;
    }
    locked.current = true;
    router.push(`/qr/${token}`);
    setTimeout(() => {
      locked.current = false;
    }, 1000);
  }

  return (
    <Screen>
      <PageHeader title="Quét mã Building" onBack={() => router.back()} />
      <Text muted>Quét QR do tổ chức cấp hoặc dán đường dẫn/mã bên dưới.</Text>
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
        <Text variant="label">URL QR hoặc token</Text>
        <TextInput
          accessibilityLabel="URL QR hoặc token"
          autoCapitalize="none"
          autoCorrect={false}
          value={input}
          onChangeText={setInput}
          placeholder="https://fet3d.io.vn/qr/..."
          style={styles.input}
        />
        {!!error && <Notice error>{error}</Notice>}
        <Button title="Mở Building" onPress={() => open(input)} />
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
