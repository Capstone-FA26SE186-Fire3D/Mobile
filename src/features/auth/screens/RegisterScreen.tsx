import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  registerTrainee,
  requestRegistrationOtp,
  resendVerification,
  verifyRegistrationOtp,
  type UserGender,
} from '@/api/auth';
import { ApiError } from '@/api';
import { Brand, Button, IconButton } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors, fonts } from '@/theme/tokens';

const genderOptions: { label: string; value: UserGender | null }[] = [
  { label: 'Không chọn', value: null },
  { label: 'Nam', value: 'Male' },
  { label: 'Nữ', value: 'Female' },
  { label: 'Khác', value: 'Other' },
  { label: 'Không muốn chia sẻ', value: 'PreferNotToSay' },
];

function registrationError(error: unknown): string {
  if (error instanceof ApiError) {
    const traceId =
      typeof error.payload?.traceId === 'string' ? ` Mã tra cứu: ${error.payload.traceId}.` : '';
    if (error.payload?.code === 'EMAIL_EXISTS') {
      return 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.';
    }
    if (error.payload?.code === 'USERNAME_EXISTS')
      return 'Username này đã được sử dụng. Hãy chọn tên khác.';
    if (error.payload?.code === 'OTP_INVALID' || error.payload?.code === 'OTP_EXPIRED')
      return 'Mã xác minh không đúng hoặc đã hết hạn. Hãy thử lại.';
    if (error.status === 429) return 'Bạn thử quá nhiều lần. Vui lòng đợi rồi thử lại.';
    if (error.status === 400)
      return `Thông tin đăng ký chưa hợp lệ. Vui lòng kiểm tra lại.${traceId}`;
    if (error.status >= 500)
      return `Dịch vụ đăng ký đang gặp lỗi (HTTP ${error.status}). Vui lòng thử lại sau.${traceId}`;
    return `Chưa tạo được tài khoản (HTTP ${error.status}). Vui lòng thử lại sau.${traceId}`;
  }
  if (error instanceof Error && error.message.includes('EXPO_PUBLIC_API_BASE_URL')) {
    return error.message;
  }
  if (error instanceof Error && error.message.includes('Fire3D API trả dữ liệu')) {
    return error.message;
  }
  return 'Không kết nối được Fire3D API. Vui lòng thử lại.';
}

export default function RegisterScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<UserGender | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [registrationToken, setRegistrationToken] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function register() {
    if (busy) return;
    const name = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const birthDate = dob.trim();
    const phone = phoneNumber.trim();
    const normalizedUsername = username.trim().toLowerCase();
    const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
    const parsedDate = dateParts ? new Date(`${birthDate}T00:00:00Z`) : null;
    const today = new Date();
    const validBirthDate =
      !birthDate ||
      (parsedDate !== null &&
        !Number.isNaN(parsedDate.getTime()) &&
        Number(dateParts?.[1]) >= 1 &&
        parsedDate.getUTCFullYear() === Number(dateParts?.[1]) &&
        parsedDate.getUTCMonth() + 1 === Number(dateParts?.[2]) &&
        parsedDate.getUTCDate() === Number(dateParts?.[3]) &&
        parsedDate.getTime() <=
          Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    let issue: string | null = null;
    if (!name || name.length > 200) issue = 'Vui lòng nhập họ tên từ 1 đến 200 ký tự.';
    else if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
      issue = 'Vui lòng nhập địa chỉ email hợp lệ.';
    else if (!/^[a-z0-9._-]{3,30}$/.test(normalizedUsername))
      issue =
        'Username cần 3–30 ký tự, chỉ gồm chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.';
    else if (!validBirthDate) issue = 'Ngày sinh không hợp lệ hoặc ở tương lai (YYYY-MM-DD).';
    else if (phone && !/^[0-9+() -]{6,32}$/.test(phone))
      issue = 'Số điện thoại cần 6–32 ký tự, chỉ gồm số và + - ( ) khoảng trắng.';
    else if (password.length < 12 || password.length > 128 || !password.trim())
      issue = 'Mật khẩu cần từ 12 đến 128 ký tự và không chỉ gồm khoảng trắng.';
    else if (password !== confirmPassword) issue = 'Mật khẩu xác nhận chưa khớp.';
    if (issue) {
      setError(issue);
      return;
    }

    setError('');
    setBusy(true);
    Keyboard.dismiss();
    try {
      await requestRegistrationOtp(normalizedEmail);
      setVerificationEmail(normalizedEmail);
      setOtp('');
      setRegistrationToken(null);
    } catch (issue) {
      setError(registrationError(issue));
    } finally {
      setBusy(false);
    }
  }

  async function completeRegistration() {
    if (busy || !verificationEmail) return;
    if (!/^[a-z0-9._-]{3,30}$/.test(username.trim().toLowerCase())) {
      setError(
        'Username cần 3–30 ký tự, chỉ gồm chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.',
      );
      return;
    }
    if (!registrationToken && !/^\d{6}$/.test(otp.trim())) {
      setError('Vui lòng nhập mã xác minh gồm 6 chữ số.');
      return;
    }
    setError('');
    setBusy(true);
    Keyboard.dismiss();
    try {
      const token =
        registrationToken ??
        (await verifyRegistrationOtp(verificationEmail, otp.trim())).registrationToken;
      setRegistrationToken(token);
      await registerTrainee({
        fullName: fullName.trim(),
        email: verificationEmail,
        username: username.trim().toLowerCase(),
        password,
        confirmPassword,
        dob: dob.trim() || null,
        gender,
        phoneNumber: phoneNumber.trim() || null,
        registrationToken: token,
      });
      setPassword('');
      setConfirmPassword('');
      setOtp('');
      setRegistrationToken(null);
      setRegistered(true);
    } catch (issue) {
      setError(registrationError(issue));
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    if (busy || !verificationEmail) return;
    setBusy(true);
    setError('');
    try {
      await resendVerification(verificationEmail);
      setOtp('');
      setRegistrationToken(null);
    } catch (issue) {
      setError(registrationError(issue));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={styles.top}>
            <Brand />
            <IconButton
              name="arrow-back"
              label="Về đăng nhập"
              onPress={() => router.replace('/login')}
            />
          </View>

          {registered ? (
            <View style={styles.result}>
              <Ionicons name="checkmark-circle" size={66} color={colors.green} />
              <Text variant="title" style={styles.center}>
                Đã tạo tài khoản
              </Text>
              <Text muted style={styles.center}>
                Tài khoản học viên đã sẵn sàng. Hãy đăng nhập bằng email và mật khẩu vừa tạo.
              </Text>
              <Button title="Đi đến đăng nhập" onPress={() => router.replace('/login')} />
            </View>
          ) : verificationEmail ? (
            <View style={styles.form}>
              <Text variant="title">Xác minh email</Text>
              <Text muted>
                Nhập mã 6 chữ số đã gửi tới {verificationEmail}. Mã có hiệu lực 10 phút.
              </Text>
              <View style={styles.field}>
                <Text variant="label">Username</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="at-outline" size={20} color={colors.muted} />
                  <TextInput
                    accessibilityLabel="Username xác minh"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                  />
                </View>
              </View>
              <View style={styles.field}>
                <Text variant="label">Mã xác minh</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="key-outline" size={20} color={colors.muted} />
                  <TextInput
                    accessibilityLabel="Mã xác minh"
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoComplete="one-time-code"
                    style={styles.input}
                    onSubmitEditing={completeRegistration}
                  />
                </View>
              </View>
              {!!error && <Notice error>{error}</Notice>}
              <Button title="Xác thực và đăng ký" loading={busy} onPress={completeRegistration} />
              <Button
                title="Gửi lại mã"
                variant="secondary"
                disabled={busy}
                onPress={() => void resendOtp()}
              />
              <Button
                title="Sửa thông tin"
                variant="ghost"
                disabled={busy}
                onPress={() => {
                  setVerificationEmail(null);
                  setOtp('');
                  setError('');
                  setRegistrationToken(null);
                }}
              />
            </View>
          ) : (
            <View style={styles.form}>
              <View style={styles.intro}>
                <Text variant="title">Tạo tài khoản học viên</Text>
                <Text muted>Nhập thông tin để đăng ký và bắt đầu trải nghiệm Fire3D.</Text>
              </View>

              <View style={styles.field}>
                <Text variant="label">Họ và tên</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="person-outline" size={20} color={colors.muted} />
                  <TextInput
                    accessibilityLabel="Họ và tên"
                    placeholder="Nguyễn Văn A"
                    placeholderTextColor={colors.muted}
                    value={fullName}
                    onChangeText={setFullName}
                    autoComplete="name"
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text variant="label">Email</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="mail-outline" size={20} color={colors.muted} />
                  <TextInput
                    accessibilityLabel="Email"
                    placeholder="ban@example.com"
                    placeholderTextColor={colors.muted}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoComplete="email"
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text variant="label">Username</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="at-outline" size={20} color={colors.muted} />
                  <TextInput
                    accessibilityLabel="Username"
                    placeholder="nguyen.van.a"
                    placeholderTextColor={colors.muted}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text variant="label">Ngày sinh (tùy chọn)</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="calendar-outline" size={20} color={colors.muted} />
                  <TextInput
                    accessibilityLabel="Ngày sinh"
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.muted}
                    value={dob}
                    onChangeText={setDob}
                    autoCapitalize="none"
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text variant="label">Giới tính (tùy chọn)</Text>
                <View style={styles.genderChoices}>
                  {genderOptions.map((option) => (
                    <Pressable
                      key={option.label}
                      accessibilityRole="button"
                      accessibilityLabel={option.label}
                      accessibilityState={{ selected: gender === option.value }}
                      onPress={() => setGender(option.value)}
                      style={[
                        styles.genderChoice,
                        gender === option.value && styles.genderChoiceSelected,
                      ]}
                    >
                      <Text variant="small">{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.field}>
                <Text variant="label">Số điện thoại (tùy chọn)</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="call-outline" size={20} color={colors.muted} />
                  <TextInput
                    accessibilityLabel="Số điện thoại"
                    placeholder="Nhập số điện thoại"
                    placeholderTextColor={colors.muted}
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text variant="label">Mật khẩu</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.muted} />
                  <TextInput
                    accessibilityLabel="Mật khẩu mới"
                    placeholder="Từ 12 đến 128 ký tự"
                    placeholderTextColor={colors.muted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="new-password"
                    style={styles.input}
                  />
                  <IconButton
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    onPress={() => setShowPassword(!showPassword)}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text variant="label">Xác nhận mật khẩu</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={colors.muted} />
                  <TextInput
                    accessibilityLabel="Xác nhận mật khẩu"
                    placeholder="Nhập lại mật khẩu"
                    placeholderTextColor={colors.muted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="new-password"
                    style={styles.input}
                    onSubmitEditing={register}
                  />
                </View>
              </View>

              {!!error && <Notice error>{error}</Notice>}
              <Button title="Gửi mã xác minh" loading={busy} onPress={register} />
              <Button
                title="Đã có tài khoản? Đăng nhập"
                variant="ghost"
                disabled={busy}
                onPress={() => router.replace('/login')}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: 26,
    paddingTop: 18,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  form: { gap: 16, marginTop: 32 },
  intro: { gap: 8, marginBottom: 4 },
  field: { gap: 7 },
  inputRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 4,
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D5D2C9',
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
  },
  genderChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genderChoice: {
    minHeight: 42,
    borderRadius: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  genderChoiceSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  result: { gap: 16, alignItems: 'center', marginTop: 96 },
  center: { textAlign: 'center' },
});
