import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  changeCurrentPassword,
  deleteCurrentAvatar,
  getCurrentAvatar,
  logoutAllSessions,
  uploadCurrentAvatar,
  type UserGender,
} from '@/api/auth';
import { ApiError } from '@/api';
import { Button } from '@/components/ui/Button';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useDemo } from '@/store/DemoProvider';
import { colors, fonts } from '@/theme/tokens';

const genderLabels: Record<UserGender, string> = {
  Male: 'Nam',
  Female: 'Nữ',
  Other: 'Khác',
  PreferNotToSay: 'Không muốn chia sẻ',
};

function accountError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.payload?.code === 'INVALID_CURRENT_PASSWORD') return 'Mật khẩu hiện tại không đúng.';
    if (error.status === 412)
      return 'Hồ sơ vừa được thay đổi ở nơi khác. Hãy tải lại rồi thử tiếp.';
    const trace =
      typeof error.payload?.traceId === 'string' ? ` Mã tra cứu: ${error.payload.traceId}.` : '';
    return `Không thực hiện được yêu cầu (HTTP ${error.status}).${trace}`;
  }
  return error instanceof Error ? error.message : 'Không kết nối được Fire3D API.';
}

export default function AccountSettingsScreen() {
  const { account, refreshAccount, updateProfile, signOut } = useDemo();
  const [fullName, setFullName] = useState(account?.fullName ?? '');
  const [username, setUsername] = useState(account?.username ?? '');
  const [dob, setDob] = useState(account?.dob ?? '');
  const [gender, setGender] = useState<UserGender | null>(account?.gender ?? null);
  const [phoneNumber, setPhoneNumber] = useState(account?.phoneNumber ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(account?.avatarUrl ?? null);
  const [uploadedAvatar, setUploadedAvatar] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!account) return;
    setFullName(account.fullName ?? '');
    setUsername(account.username ?? '');
    setDob(account.dob ?? '');
    setGender(account.gender ?? null);
    setPhoneNumber(account.phoneNumber ?? '');
  }, [account?.id, account?.profileRevision]);

  useEffect(() => {
    if (!account) return;
    let active = true;
    getCurrentAvatar()
      .then((avatar) => {
        if (!active) return;
        setUploadedAvatar(!!avatar);
        setAvatarUrl(avatar?.url ?? account.avatarUrl ?? null);
      })
      .catch(() => {
        if (active) setAvatarUrl(account.avatarUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [account?.id, account?.avatarUrl]);

  async function run(action: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(success);
    } catch (issue) {
      setError(accountError(issue));
    } finally {
      setBusy(false);
    }
  }

  function saveProfile() {
    const name = fullName.trim();
    const normalizedUsername = username.trim().toLowerCase();
    const birthDate = dob.trim();
    const phone = phoneNumber.trim();
    if (!name || name.length > 200) {
      setError('Họ tên cần từ 1 đến 200 ký tự.');
      return;
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(normalizedUsername)) {
      setError(
        'Username cần 3–30 ký tự, chỉ gồm chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.',
      );
      return;
    }
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      setError('Ngày sinh cần theo dạng YYYY-MM-DD.');
      return;
    }
    if (phone && !/^[+0-9() -]{6,50}$/.test(phone)) {
      setError('Số điện thoại chưa đúng định dạng.');
      return;
    }
    void run(
      () =>
        updateProfile({
          fullName: name,
          ...(normalizedUsername ? { username: normalizedUsername } : {}),
          dob: birthDate || null,
          gender,
          phoneNumber: phone || null,
        }),
      'Đã cập nhật hồ sơ.',
    );
  }

  async function chooseAvatar() {
    if (busy) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const extension = (asset.fileName ?? asset.uri).split('?')[0].split('.').pop()?.toLowerCase();
      const contentType =
        asset.mimeType?.toLowerCase() ??
        (extension === 'jpg' || extension === 'jpeg'
          ? 'image/jpeg'
          : extension === 'png'
            ? 'image/png'
            : extension === 'webp'
              ? 'image/webp'
              : '');
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        setError('Ảnh đại diện phải có dung lượng tối đa 5 MB.');
        return;
      }
      await run(async () => {
        const uploaded = await uploadCurrentAvatar(asset.uri, contentType);
        setAvatarUrl(uploaded.url);
        setUploadedAvatar(true);
        await refreshAccount();
      }, 'Đã cập nhật ảnh đại diện.');
    } catch (issue) {
      setError(accountError(issue));
    }
  }

  function removeAvatar() {
    void run(async () => {
      await deleteCurrentAvatar();
      await refreshAccount();
      setUploadedAvatar(false);
      setAvatarUrl(account?.avatarUrl ?? null);
    }, 'Đã xóa ảnh đại diện tải lên.');
  }

  function savePassword() {
    if (!currentPassword || currentPassword.length > 128) {
      setError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (newPassword.length < 12 || newPassword.length > 128 || !newPassword.trim()) {
      setError('Mật khẩu mới cần từ 12 đến 128 ký tự và không chỉ gồm khoảng trắng.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận chưa khớp.');
      return;
    }
    void run(async () => {
      await changeCurrentPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await signOut();
      router.replace('/login');
    }, 'Mật khẩu đã thay đổi. Hãy đăng nhập lại.');
  }

  if (!account)
    return (
      <Screen>
        <PageHeader title="Cài đặt tài khoản" onBack={() => router.back()} />
        <Notice>Chỉ tài khoản Trainee thật mới có thể cập nhật hồ sơ.</Notice>
      </Screen>
    );

  return (
    <Screen>
      <PageHeader title="Cài đặt tài khoản" onBack={() => router.back()} />
      <View style={styles.section}>
        <Text variant="heading">Hồ sơ</Text>
        {avatarUrl && (
          <Image
            source={{ uri: avatarUrl }}
            style={styles.avatar}
            accessibilityLabel="Ảnh đại diện"
          />
        )}
        <Text muted>Email: {account.email}</Text>
        <Text muted>Email đã xác minh: {account.emailVerifiedAt ? 'Có' : 'Chưa'}</Text>
        <Text variant="label">Họ và tên</Text>
        <TextInput
          accessibilityLabel="Sửa họ và tên"
          value={fullName}
          onChangeText={setFullName}
          autoComplete="name"
          style={styles.input}
        />
        <Text variant="label">Username</Text>
        <TextInput
          accessibilityLabel="Sửa username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          style={styles.input}
        />
        <Text variant="label">Ngày sinh (YYYY-MM-DD)</Text>
        <TextInput
          accessibilityLabel="Sửa ngày sinh"
          value={dob}
          onChangeText={setDob}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <Text variant="label">Giới tính</Text>
        <View style={styles.options}>
          {([null, 'Male', 'Female', 'Other', 'PreferNotToSay'] as const).map((value) => (
            <Pressable
              key={value ?? 'none'}
              accessibilityRole="button"
              accessibilityLabel={value ? genderLabels[value] : 'Không chọn'}
              accessibilityState={{ selected: gender === value }}
              onPress={() => setGender(value)}
              style={[styles.option, gender === value && styles.optionSelected]}
            >
              <Text variant="small">{value ? genderLabels[value] : 'Không chọn'}</Text>
            </Pressable>
          ))}
        </View>
        <Text variant="label">Số điện thoại</Text>
        <TextInput
          accessibilityLabel="Sửa số điện thoại"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          keyboardType="phone-pad"
          style={styles.input}
        />
        <Button title="Lưu hồ sơ" loading={busy} onPress={saveProfile} />
      </View>
      <View style={styles.section}>
        <Text variant="heading">Ảnh đại diện</Text>
        <Text muted>Chọn ảnh JPEG, PNG hoặc WebP, tối đa 5 MB.</Text>
        <Button
          title="Chọn ảnh từ thiết bị"
          variant="secondary"
          disabled={busy}
          onPress={() => void chooseAvatar()}
        />
        {uploadedAvatar && (
          <Button
            title="Xóa ảnh đã tải lên"
            variant="ghost"
            disabled={busy}
            onPress={removeAvatar}
          />
        )}
      </View>
      <View style={styles.section}>
        <Text variant="heading">Đổi mật khẩu</Text>
        <TextInput
          accessibilityLabel="Mật khẩu hiện tại"
          placeholder="Mật khẩu hiện tại"
          placeholderTextColor={colors.muted}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoCapitalize="none"
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Mật khẩu mới"
          placeholder="Mật khẩu mới, từ 12 ký tự"
          placeholderTextColor={colors.muted}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Xác nhận mật khẩu mới"
          placeholder="Xác nhận mật khẩu mới"
          placeholderTextColor={colors.muted}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          style={styles.input}
        />
        <Text variant="small" muted>
          Đổi mật khẩu thành công sẽ đăng xuất mọi phiên. Hãy đăng nhập lại.
        </Text>
        <Button title="Đổi mật khẩu" loading={busy} onPress={savePassword} />
      </View>
      <View style={styles.section}>
        <Text variant="heading">Phiên đăng nhập</Text>
        <Text muted>Thu hồi các phiên trên mọi thiết bị rồi đăng nhập lại.</Text>
        <Button
          title="Đăng xuất mọi thiết bị"
          variant="secondary"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await logoutAllSessions();
              await signOut();
              router.replace('/login');
            }, 'Đã thu hồi mọi phiên đăng nhập.')
          }
        />
      </View>
      {!!error && <Notice error>{error}</Notice>}
      {!!message && <Notice>{message}</Notice>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, padding: 16, borderRadius: 16, backgroundColor: colors.surface },
  input: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.background,
    fontFamily: fonts.regular,
    color: colors.ink,
  },
  avatar: { width: 82, height: 82, borderRadius: 28 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10 },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
});
