import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, TextInput } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSession } from '@/store/SessionProvider';
import { traineeUsername } from '@/api/google.contract';
import { colors, fonts } from '@/theme/tokens';

export default function GoogleOnboardingScreen() {
  const { onboardingToken, completeOnboarding } = useSession();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    let value: string;
    try {
      value = traineeUsername(username);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Username không hợp lệ.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await completeOnboarding(value);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Không tạo được tài khoản.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <PageHeader title="Hoàn tất tài khoản" onBack={() => router.replace('/login')} />
      {onboardingToken ? (
        <>
          <Text muted>Chọn username cho tài khoản Trainee Fire3D của bạn.</Text>
          <TextInput
            accessibilityLabel="Username Trainee"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          {!!error && <Notice error>{error}</Notice>}
          <Button title="Hoàn tất đăng ký Google" loading={busy} onPress={() => void submit()} />
        </>
      ) : (
        <Notice error>Phiên Google đã hết. Hãy đăng nhập lại.</Notice>
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  input: {
    minHeight: 54,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    fontFamily: fonts.regular,
    color: colors.ink,
  },
});
