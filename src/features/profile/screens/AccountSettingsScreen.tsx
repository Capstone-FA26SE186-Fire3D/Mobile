import { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import {
  Check,
  Info,
  Lock,
  MessageSquare,
  RefreshCw,
  Smartphone,
  Upload,
  User,
} from 'lucide-react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  changeCurrentPassword,
  deleteCurrentAvatar,
  getCurrentAvatar,
  uploadCurrentAvatar,
  type UserGender,
} from '@/api/auth';
import { ApiError } from '@/api';
import { Button } from '@/components/ui/Button';
import { PasswordStrength, SelectField, Sheet } from '@/components/ui/Form';
import { Callout, Card, Field, HexBadge, ListRow } from '@/components/ui/Game';
import { Notice, PageHeader, Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useSession } from '@/store/SessionProvider';
import { colors } from '@/theme/tokens';

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
  return error instanceof Error
    ? error.message
    : 'Không kết nối được máy chủ FET3D. Kiểm tra mạng rồi thử lại.';
}

export default function AccountSettingsScreen() {
  const {
    account,
    refreshAccount,
    updateProfile,
    clearLocal,
    logoutEverywhere,
    linkGoogle,
    retryDeviceBinding,
    revokeCurrentDevice,
  } = useSession();
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
  const [linkPassword, setLinkPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sheet, setSheet] = useState<
    'profile' | 'details' | 'avatar' | 'password' | 'logout' | 'google' | null
  >(null);

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
      await revokeCurrentDevice();
      try {
        await changeCurrentPassword(currentPassword, newPassword);
      } catch (issue) {
        await retryDeviceBinding().catch(() => {});
        throw issue;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await clearLocal();
      router.replace('/login');
    }, 'Mật khẩu đã thay đổi. Hãy đăng nhập lại.');
  }

  if (!account)
    return (
      <Screen>
        <PageHeader title="Cài đặt tài khoản" onBack={() => router.back()} />
        <Notice>Chỉ tài khoản học viên thật mới có thể cập nhật hồ sơ.</Notice>
      </Screen>
    );

  const close = () => {
    setSheet(null);
    setError('');
  };
  const feedback = (
    <>
      {!!error && <Notice error>{error}</Notice>}
      {!!message && <Callout tone="success">{message}</Callout>}
    </>
  );
  const details = [account.dob, account.gender && genderLabels[account.gender], account.phoneNumber]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen contentStyle={{ padding: 16, gap: 12 }}>
      <PageHeader title="Cài đặt tài khoản" onBack={() => router.back()} />
      {!sheet && feedback}
      <Text variant="caps" style={styles.section}>
        HỒ SƠ
      </Text>
      <Card padding={8}>
        <ListRow
          icon={User}
          tone="info"
          title="Họ tên, username"
          subtitle={[account.fullName, account.username].filter(Boolean).join(' · ')}
          onPress={() => setSheet('profile')}
        />
        <ListRow
          icon={Smartphone}
          tone="info"
          title="Ngày sinh, giới tính, SĐT"
          subtitle={details || 'Chưa cập nhật'}
          onPress={() => setSheet('details')}
        />
        <ListRow
          icon={Upload}
          tone="warning"
          title="Ảnh đại diện"
          subtitle="Chọn ảnh từ máy (≤ 5 MB)"
          onPress={() => setSheet('avatar')}
        />
      </Card>
      <Text variant="caps" style={styles.section}>
        BẢO MẬT
      </Text>
      <Card padding={8}>
        <ListRow
          icon={Lock}
          tone="danger"
          title="Đổi mật khẩu"
          subtitle="Sẽ đăng xuất mọi thiết bị"
          onPress={() => setSheet('password')}
        />
        <ListRow
          icon={RefreshCw}
          tone="danger"
          title="Đăng xuất mọi thiết bị"
          subtitle="Thu hồi mọi phiên đăng nhập"
          onPress={() => setSheet('logout')}
        />
        {Platform.OS === 'android' && (
          <ListRow
            icon={MessageSquare}
            tone="info"
            title="Liên kết Google"
            subtitle="Dùng Google để đăng nhập tài khoản này"
            onPress={() => setSheet('google')}
          />
        )}
      </Card>
      {Platform.OS === 'android' && (
        <>
          <Text variant="caps" style={styles.section}>
            THÔNG BÁO
          </Text>
          <Card padding={8}>
            <ListRow
              icon={Info}
              tone="success"
              title="Nhận thông báo"
              subtitle="Kết quả, nhắc đồng bộ"
              trailing={
                <Button
                  title="Bật"
                  variant="ghost"
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      const enabled = await retryDeviceBinding();
                      if (!enabled) throw new Error('Chưa cấp quyền thông báo cho ứng dụng.');
                    }, 'Đã đăng ký thiết bị nhận thông báo.')
                  }
                />
              }
            />
          </Card>
        </>
      )}
      <Text variant="small" dim style={{ textAlign: 'center' }}>
        {account.email} · {account.emailVerifiedAt ? 'Email đã xác minh' : 'Email chưa xác minh'}
      </Text>

      <Sheet visible={sheet === 'profile'} title="Họ tên, username" onClose={close}>
        <Field label="Họ và tên" value={fullName} onChangeText={setFullName} autoComplete="name" />
        <Field
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {feedback}
        <Button title="Lưu hồ sơ" icon={Check} loading={busy} onPress={saveProfile} />
      </Sheet>

      <Sheet visible={sheet === 'details'} title="Ngày sinh, giới tính, SĐT" onClose={close}>
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <Field
              label="Ngày sinh"
              value={dob}
              onChangeText={setDob}
              placeholder="YYYY-MM-DD"
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
          label="Số điện thoại"
          icon={Smartphone}
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          keyboardType="phone-pad"
        />
        {feedback}
        <Button title="Lưu hồ sơ" icon={Check} loading={busy} onPress={saveProfile} />
      </Sheet>

      <Sheet visible={sheet === 'avatar'} title="Ảnh đại diện" onClose={close}>
        <View style={{ alignItems: 'center' }}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatar}
              accessibilityLabel="Ảnh đại diện"
            />
          ) : (
            <HexBadge icon={User} size={96} />
          )}
        </View>
        <Text variant="small" muted style={{ textAlign: 'center' }}>
          Chọn ảnh JPEG, PNG hoặc WebP, tối đa 5 MB.
        </Text>
        {feedback}
        <Button
          title="Chọn ảnh từ thiết bị"
          icon={Upload}
          disabled={busy}
          onPress={() => void chooseAvatar()}
        />
        {uploadedAvatar && (
          <Button
            title="Xóa ảnh đã tải lên"
            variant="danger"
            size="sm"
            disabled={busy}
            onPress={removeAvatar}
          />
        )}
      </Sheet>

      <Sheet visible={sheet === 'password'} title="Đổi mật khẩu" onClose={close}>
        <Field
          label="Mật khẩu hiện tại"
          icon={Lock}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <Field
          label="Mật khẩu mới"
          icon={Lock}
          placeholder="Từ 12 ký tự"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <PasswordStrength password={newPassword} />
        <Field
          label="Xác nhận mật khẩu mới"
          icon={Lock}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <Callout tone="warning">
          Đổi mật khẩu thành công sẽ đăng xuất mọi phiên. Hãy đăng nhập lại.
        </Callout>
        {feedback}
        <Button title="Đổi mật khẩu" icon={Check} loading={busy} onPress={savePassword} />
      </Sheet>

      <Sheet visible={sheet === 'logout'} title="Đăng xuất mọi thiết bị" onClose={close}>
        <Text muted>
          Thu hồi các phiên trên mọi thiết bị rồi đăng nhập lại. Phiên tập huấn đã bắt đầu vẫn được
          đồng bộ sau khi đăng nhập.
        </Text>
        {feedback}
        <Button
          title="Đăng xuất mọi thiết bị"
          icon={RefreshCw}
          variant="danger"
          loading={busy}
          onPress={() =>
            void run(async () => {
              await logoutEverywhere();
              router.replace('/login');
            }, 'Đã thu hồi mọi phiên đăng nhập.')
          }
        />
      </Sheet>

      <Sheet visible={sheet === 'google'} title="Liên kết Google" onClose={close}>
        <Text muted>
          Liên kết Google với tài khoản FET3D hiện tại. Sau lần liên kết đầu tiên, bạn cần đăng nhập
          lại.
        </Text>
        <Field
          label="Mật khẩu FET3D hiện tại"
          icon={Lock}
          value={linkPassword}
          onChangeText={setLinkPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        {feedback}
        <Button
          title="Liên kết Google"
          icon={Check}
          disabled={busy || !linkPassword}
          onPress={() =>
            void run(async () => {
              const requiresLogin = await linkGoogle(linkPassword);
              setLinkPassword('');
              if (requiresLogin) router.replace('/login');
            }, 'Đã liên kết Google.')
          }
        />
      </Sheet>
    </Screen>
  );
}

const genderOptions: { label: string; value: UserGender | null }[] = [
  { label: 'Không chọn', value: null },
  ...(Object.keys(genderLabels) as UserGender[]).map((value) => ({
    label: genderLabels[value],
    value,
  })),
];

const styles = StyleSheet.create({
  section: { letterSpacing: 1.5 },
  pair: { flexDirection: 'row', gap: 10 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: colors.hardShadow,
    backgroundColor: colors.surfaceRaised,
  },
});
