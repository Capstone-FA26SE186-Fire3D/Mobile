import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Keyboard, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { requestPasswordReset } from '@/api/auth';
import { ApiError } from '@/api';
import { Brand, Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors, fonts } from '@/theme/tokens';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (busy) return;
    const normalized = email.trim().toLowerCase();
    if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }
    setBusy(true);
    setError('');
    Keyboard.dismiss();
    try {
      await requestPasswordReset(normalized);
      setDone(true);
    } catch (issue) {
      if (issue instanceof ApiError && issue.status === 429)
        setError('Bạn thử quá nhiều lần. Vui lòng đợi rồi thử lại.');
      else if (issue instanceof ApiError && issue.status >= 500)
        setError(`Dịch vụ đặt lại mật khẩu đang gián đoạn (HTTP ${issue.status}).`);
      else setError('Chưa gửi được yêu cầu. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <PageHeader title="Quên mật khẩu" onBack={() => router.replace('/login')} />
      <Brand small />
      {done ? (
        <>
          <Notice>
            Nếu tài khoản đủ điều kiện, hệ thống đã nhận yêu cầu. Hãy kiểm tra email và mở liên kết
            đặt lại mật khẩu. Việc nhận yêu cầu chưa bảo đảm email đã được gửi.
          </Notice>
          <Button title="Quay về đăng nhập" onPress={() => router.replace('/login')} />
        </>
      ) : (
        <>
          <Text muted>Nhập email của tài khoản Fire3D để yêu cầu liên kết đặt lại mật khẩu.</Text>
          <View style={styles.field}>
            <Text variant="label">Email</Text>
            <View style={styles.inputRow}>
              <Ionicons name="mail-outline" size={20} color={colors.muted} />
              <TextInput
                accessibilityLabel="Email đặt lại mật khẩu"
                placeholder="ban@example.com"
                placeholderTextColor={colors.muted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                style={styles.input}
                onSubmitEditing={submit}
              />
            </View>
          </View>
          {!!error && <Notice error>{error}</Notice>}
          <Button title="Gửi yêu cầu" loading={busy} onPress={submit} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { gap: 7 },
  inputRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    fontFamily: fonts.regular,
    color: colors.ink,
  },
});
