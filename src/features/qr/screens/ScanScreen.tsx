import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Screen, PageHeader, Notice } from '@/components/ui/Screen';
import { colors, fonts } from '@/theme/tokens';
import { useDemo } from '@/store/DemoProvider';
import { buildings, resolveDemoCode } from '@/features/buildings/buildings.model';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [enabled, setEnabled] = useState(false),
    [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [torch, setTorch] = useState(false),
    [paused, setPaused] = useState(false);
  const lock = useRef(false);
  const [routeFocused, setRouteFocused] = useState(false),
    [foreground, setForeground] = useState(AppState.currentState === 'active');
  const focused = routeFocused && foreground;
  useFocusEffect(
    useCallback(() => {
      setRouteFocused(true);
      return () => setRouteFocused(false);
    }, []),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (value) =>
      setForeground(value === 'active'),
    );
    return () => subscription.remove();
  }, []);
  const { addBuilding } = useDemo();
  function scan(value: string) {
    if (lock.current) return;
    lock.current = true;
    setPaused(true);
    try {
      const building = resolveDemoCode(value);
      addBuilding(building);
      setEnabled(false);
      if (Platform.OS !== 'web')
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace({ pathname: '/training/[id]', params: { id: building.id, source: 'scan' } });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Không đọc được mã QR.');
    }
  }
  function retry() {
    lock.current = false;
    setPaused(false);
    setError('');
  }
  async function enableCamera() {
    setError('');
    try {
      const result = permission?.granted ? permission : await requestPermission();
      if (result.granted) {
        retry();
        setEnabled(true);
      } else setError('Chưa được cấp quyền camera. Bạn vẫn có thể nhập mã bên dưới.');
    } catch {
      setError('Không mở được camera. Kiểm tra quyền truy cập hoặc nhập mã bên dưới.');
    }
  }
  return (
    <Screen>
      <PageHeader title="Quét QR tòa nhà" onBack={() => router.back()} />
      <Text muted>Đưa mã QR vào trong khung. Tòa nhà sẽ được lưu vào không gian của bạn.</Text>
      <View style={styles.camera}>
        {enabled && permission?.granted && focused ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={paused ? undefined : ({ data }) => scan(data)}
            onMountError={() => {
              setEnabled(false);
              setError('Camera chưa sẵn sàng. Bạn có thể nhập mã thay thế.');
            }}
          />
        ) : (
          <View style={styles.cameraIntro}>
            <Ionicons name="qr-code-outline" size={82} color="#B7C4AA" />
            <Text style={{ color: '#E8EBDC', textAlign: 'center' }}>
              Mã QR mở ra{'\n'}một không gian tập huấn mới
            </Text>
          </View>
        )}
        <View pointerEvents="none" style={styles.frame}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </View>
        {enabled && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={torch ? 'Tắt đèn pin' : 'Bật đèn pin'}
            onPress={() => setTorch(!torch)}
            style={styles.torch}
          >
            <Ionicons name={torch ? 'flash' : 'flash-outline'} size={21} color={colors.white} />
          </Pressable>
        )}
      </View>
      {!enabled && (
        <Button
          title="Bật camera để quét"
          icon="camera-outline"
          variant="secondary"
          onPress={enableCamera}
        />
      )}
      {permission && !permission.granted && !permission.canAskAgain && Platform.OS !== 'web' && (
        <Button
          title="Mở cài đặt quyền camera"
          variant="ghost"
          onPress={() => {
            void Linking.openSettings().catch(() =>
              setError('Không mở được cài đặt. Hãy cấp quyền camera trong Cài đặt của thiết bị.'),
            );
          }}
        />
      )}
      {!!error && (
        <>
          <Notice error>{error}</Notice>
          {paused && <Button title="Thử quét lại" variant="secondary" onPress={retry} />}
        </>
      )}
      <View style={styles.manual}>
        <Text variant="label">Hoặc nhập mã tòa nhà</Text>
        <TextInput
          accessibilityLabel="Mã tòa nhà"
          placeholder="Ví dụ: F3D-ANBINH"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={256}
          value={code}
          onChangeText={(value) => {
            setCode(value);
            retry();
          }}
          style={styles.input}
          onSubmitEditing={() => scan(code)}
        />
        <Button title="Tìm tòa nhà" onPress={() => scan(code)} disabled={!code.trim() || paused} />
      </View>
      <View style={styles.samples}>
        <Text variant="small" muted>
          MÃ TRẢI NGHIỆM · CHẠM ĐỂ ĐIỀN
        </Text>
        <View style={styles.codes}>
          {buildings.map((b) => (
            <Pressable
              key={b.id}
              accessibilityRole="button"
              accessibilityLabel={`Điền mã ${b.code}`}
              onPress={() => {
                retry();
                setCode(b.code);
              }}
              style={styles.code}
            >
              <Text variant="small">{b.code}</Text>
            </Pressable>
          ))}
        </View>
        <Text variant="small" muted>
          Camera đọc mã thật; bản này chỉ nhận ba mã mẫu trên, chưa kết nối hệ thống QR của tổ chức.
        </Text>
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  camera: {
    height: 310,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#35473C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIntro: { alignItems: 'center', gap: 20 },
  frame: { position: 'absolute', width: 220, height: 220 },
  corner: { position: 'absolute', width: 32, height: 32, borderColor: colors.primary },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 },
  br: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 14,
  },
  torch: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    height: 48,
    width: 48,
    borderRadius: 24,
    backgroundColor: '#252B2DAA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  manual: { gap: 12 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    fontFamily: fonts.medium,
    color: colors.ink,
    fontSize: 15,
  },
  samples: { gap: 12 },
  codes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  code: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    justifyContent: 'center',
    backgroundColor: colors.sand,
  },
});
