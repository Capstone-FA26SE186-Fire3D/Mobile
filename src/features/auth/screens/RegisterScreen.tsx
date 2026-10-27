import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import {
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  Lock,
  MessageSquare,
  Smartphone,
  User,
} from 'lucide-react-native';
import {
  registerTrainee,
  requestRegistrationOtp,
  resendVerification,
  verifyRegistrationOtp,
  type UserGender,
} from '@/api/auth';
import { ApiError } from '@/api';
import { Button } from '@/components/ui/Button';
import { Field, HexBadge, Ribbon, Segments } from '@/components/ui/Game';
import { Checkbox, OtpInput, PasswordStrength, SelectField } from '@/components/ui/Form';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors, fonts } from '@/theme/tokens';

const genderOptions: { label: string; value: UserGender | null }[] = [
  { label: 'Không chọn', value: null },
  { label: 'Nam', value: 'Male' },
  { label: 'Nữ', value: 'Female' },
  { label: 'Khác', value: 'Other' },
  { label: 'Không muốn chia sẻ', value: 'PreferNotToSay' },
];
const RESEND_SECONDS = 60;
const USERNAME_RULE = /^[a-z0-9._-]{3,30}$/;

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
  if (error instanceof Error && error.message.includes('Máy chủ FET3D trả dữ liệu')) {
    return error.message;
  }
  return 'Không kết nối được máy chủ FET3D. Kiểm tra mạng rồi thử lại.';
}

function validBirthDate(value: string): boolean {
  if (!value) return true;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = parts ? new Date(`${value}T00:00:00Z`) : null;
  const today = new Date();
  return (
    date !== null &&
    !Number.isNaN(date.getTime()) &&
    Number(parts?.[1]) >= 1 &&
    date.getUTCFullYear() === Number(parts?.[1]) &&
    date.getUTCMonth() + 1 === Number(parts?.[2]) &&
    date.getUTCDate() === Number(parts?.[3]) &&
    date.getTime() <= Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
}

type Step = 'info' | 'otp' | 'password' | 'done';

export default function RegisterScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('info');
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
  const [acknowledged, setAcknowledged] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function sendOtp() {
    if (busy) return;
    const name = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const phone = phoneNumber.trim();
    let issue: string | null = null;
    if (!name || name.length > 200) issue = 'Vui lòng nhập họ tên từ 1 đến 200 ký tự.';
    else if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
      issue = 'Vui lòng nhập địa chỉ email hợp lệ.';
    else if (!USERNAME_RULE.test(username.trim().toLowerCase()))
      issue =
        'Username cần 3–30 ký tự, chỉ gồm chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.';
    else if (!validBirthDate(dob.trim()))
      issue = 'Ngày sinh không hợp lệ hoặc ở tương lai (YYYY-MM-DD).';
    else if (phone && !/^[0-9+() -]{6,32}$/.test(phone))
      issue = 'Số điện thoại cần 6–32 ký tự, chỉ gồm số và + - ( ) khoảng trắng.';
    if (issue) {
      setError(issue);
      return;
    }
    setError('');
    // Email already verified (back from a USERNAME_EXISTS error): keep the registration token.
    if (registrationToken && verificationEmail === normalizedEmail) {
      setStep('password');
      return;
    }
    setBusy(true);
    Keyboard.dismiss();
    try {
      await requestRegistrationOtp(normalizedEmail);
      setVerificationEmail(normalizedEmail);
      setOtp('');
      setRegistrationToken(null);
      setResendIn(RESEND_SECONDS);
      setStep('otp');
    } catch (issue) {
      setError(registrationError(issue));
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    if (busy || !verificationEmail) return;
    if (!/^\d{6}$/.test(otp.trim())) {
      setError('Vui lòng nhập mã xác minh gồm 6 chữ số.');
      return;
    }
    setError('');
    setBusy(true);
    Keyboard.dismiss();
    try {
      setRegistrationToken(
        (await verifyRegistrationOtp(verificationEmail, otp.trim())).registrationToken,
      );
      setStep('password');
    } catch (issue) {
      setError(registrationError(issue));
    } finally {
      setBusy(false);
    }
  }

  async function createAccount() {
    if (busy || !verificationEmail || !registrationToken) return;
    let issue: string | null = null;
    if (password.length < 12 || password.length > 128 || !password.trim())
      issue = 'Mật khẩu cần từ 12 đến 128 ký tự và không chỉ gồm khoảng trắng.';
    else if (password !== confirmPassword) issue = 'Mật khẩu xác nhận chưa khớp.';
    else if (!acknowledged) issue = 'Hãy xác nhận bạn hiểu FET3D là công cụ học tập.';
    if (issue) {
      setError(issue);
      return;
    }
    setError('');
    setBusy(true);
    Keyboard.dismiss();
    try {
      await registerTrainee({
        fullName: fullName.trim(),
        email: verificationEmail,
        username: username.trim().toLowerCase(),
        password,
        confirmPassword,
        dob: dob.trim() || null,
        gender,
        phoneNumber: phoneNumber.trim() || null,
        registrationToken,
      });
      setPassword('');
      setConfirmPassword('');
      setOtp('');
      setRegistrationToken(null);
      setStep('done');
    } catch (issue) {
      if (issue instanceof ApiError && issue.payload?.code === 'USERNAME_EXISTS') setStep('info');
      // An expired/used registration token must be replaced by a fresh OTP.
      else if (issue instanceof ApiError && /OTP|TOKEN/i.test(String(issue.payload?.code ?? ''))) {
        setRegistrationToken(null);
        setOtp('');
        setStep('otp');
      }
      setError(registrationError(issue));
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    if (busy || !verificationEmail || resendIn > 0) return;
    setBusy(true);
    setError('');
    try {
      await resendVerification(verificationEmail);
      setOtp('');
      setRegistrationToken(null);
      setResendIn(RESEND_SECONDS);
    } catch (issue) {
      setError(registrationError(issue));
    } finally {
      setBusy(false);
    }
  }

  function back() {
    setError('');
    if (step === 'otp' || (step === 'password' && registrationToken)) setStep('info');
    else if (step === 'password') setStep('otp');
    else router.replace('/login');
  }

  if (step === 'done')
    return (
      <Screen scroll={false} contentStyle={styles.done}>
        <HexBadge icon={Check} tone="exit" size={150} />
        <Ribbon label="Hoàn tất" color={colors.exit} shadow="#1F6B44" />
        <Text variant="title" style={styles.center}>
          Tài khoản đã sẵn sàng
        </Text>
        <Text muted style={styles.center}>
          Đăng nhập để quét QR của tòa nhà và bắt đầu nhiệm vụ đầu tiên.
        </Text>
        <Button
          title="Đăng nhập"
          icon={ArrowUpRight}
          style={{ alignSelf: 'stretch' }}
          onPress={() => router.replace('/login')}
        />
      </Screen>
    );

  const index = step === 'info' ? 1 : step === 'otp' ? 2 : 3;
  const primary =
    step === 'info' ? (
      <Button
        title="Gửi mã xác minh"
        icon={ArrowUpRight}
        loading={busy}
        onPress={() => void sendOtp()}
      />
    ) : step === 'otp' ? (
      <Button title="Xác thực" icon={Check} loading={busy} onPress={() => void verifyOtp()} />
    ) : (
      <Button
        title="Tạo tài khoản"
        icon={Check}
        loading={busy}
        onPress={() => void createAccount()}
      />
    );
  const eye = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      hitSlop={10}
      onPress={() => setShowPassword(!showPassword)}
    >
      {showPassword ? (
        <EyeOff size={18} color={colors.dim} strokeWidth={2} />
      ) : (
        <Eye size={18} color={colors.dim} strokeWidth={2} />
      )}
    </Pressable>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen footer={primary}>
        <PageHeader title="Tạo tài khoản học viên" subtitle={`Bước ${index}/3`} onBack={back} />
        <Segments total={3} filled={index} />

        {step === 'info' && (
          <>
            <Text variant="caps" style={styles.section}>
              THÔNG TIN CỦA BẠN
            </Text>
            <Field
              label="Họ và tên"
              icon={User}
              placeholder="Nguyễn Văn A"
              value={fullName}
              onChangeText={setFullName}
              autoComplete="name"
            />
            <Field
              label="Email"
              icon={MessageSquare}
              placeholder="ban@vidu.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
            />
            <View style={{ gap: 6 }}>
              <Field
                label="Username"
                icon={User}
                placeholder="nguyen.van.a"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text variant="small" dim style={{ fontSize: 11 }}>
                3–30 ký tự: chữ thường, số, . _ -
              </Text>
            </View>
            <View style={styles.pair}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Ngày sinh"
                  placeholder="YYYY-MM-DD"
                  value={dob}
                  onChangeText={setDob}
                  autoCapitalize="none"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <SelectField
                label="Giới tính"
                value={gender}
                options={genderOptions}
                onChange={setGender}
              />
            </View>
            <Field
              label="Số điện thoại (tùy chọn)"
              icon={Smartphone}
              placeholder="09xx xxx xxx"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
          </>
        )}

        {step === 'otp' && (
          <>
            <Text variant="title">Nhập mã 6 số</Text>
            <Text muted>Mã đã gửi tới {verificationEmail}, có hiệu lực 10 phút.</Text>
            <OtpInput value={otp} onChange={setOtp} onSubmit={() => void verifyOtp()} />
            <View style={styles.resend}>
              <Text muted style={{ fontSize: 13 }}>
                Chưa nhận được mã?
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={busy || resendIn > 0}
                onPress={() => void resendOtp()}
              >
                <Text style={[styles.resendLink, resendIn > 0 && { color: colors.dim }]}>
                  {resendIn > 0
                    ? `Gửi lại sau 00:${String(resendIn).padStart(2, '0')}`
                    : 'Gửi lại mã'}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {step === 'password' && (
          <>
            <Text variant="caps" style={styles.section}>
              ĐẶT MẬT KHẨU
            </Text>
            <Field
              label="Mật khẩu"
              icon={Lock}
              placeholder="Từ 12 đến 128 ký tự"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="new-password"
              trailing={eye}
            />
            <PasswordStrength password={password} />
            <Field
              label="Xác nhận mật khẩu"
              icon={Lock}
              placeholder="Nhập lại mật khẩu"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="new-password"
              trailing={eye}
              onSubmitEditing={() => void createAccount()}
            />
            <Checkbox checked={acknowledged} onChange={setAcknowledged}>
              Mình hiểu đây là công cụ học tập, không phải chứng nhận an toàn PCCC.
            </Checkbox>
          </>
        )}
        {!!error && <Notice error>{error}</Notice>}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  section: { letterSpacing: 1.5 },
  pair: { flexDirection: 'row', gap: 10 },
  resend: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  resendLink: { fontFamily: fonts.black, fontSize: 13, lineHeight: 18, color: colors.ember },
  done: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  center: { textAlign: 'center' },
});
