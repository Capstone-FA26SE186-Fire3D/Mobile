import { useState } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Check, User } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Field, Segments } from '@/components/ui/Game';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSession } from '@/store/SessionProvider';
import { traineeUsername } from '@/api/google.contract';

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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        footer={
          onboardingToken ? (
            <Button
              title="Hoàn tất đăng ký Google"
              icon={Check}
              loading={busy}
              onPress={() => void submit()}
            />
          ) : (
            <Button title="Về đăng nhập" onPress={() => router.replace('/login')} />
          )
        }
      >
        <PageHeader
          title="Hoàn tất tài khoản"
          subtitle="Đăng ký bằng Google"
          onBack={() => router.replace('/login')}
        />
        <Segments total={3} filled={3} />
        {onboardingToken ? (
          <>
            <Text muted>Chọn username cho tài khoản học viên FET3D của bạn.</Text>
            <View style={{ gap: 6 }}>
              <Field
                label="Username"
                icon={User}
                placeholder="nguyen.van.a"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => void submit()}
              />
              <Text variant="small" dim style={{ fontSize: 11 }}>
                3–30 ký tự: chữ thường, số, . _ -
              </Text>
            </View>
            {!!error && <Notice error>{error}</Notice>}
          </>
        ) : (
          <Notice error>Phiên Google đã hết. Hãy đăng nhập lại.</Notice>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
