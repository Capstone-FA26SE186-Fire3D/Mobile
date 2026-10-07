import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from './client';
import { ApiError } from './types/common';
import type { ApiRequestOptions } from './types/common';

export type Account = {
  id: string;
  email: string;
  fullName: string | null;
  username?: string | null;
  profileRevision?: number;
  role: 'PlatformAdmin' | 'OrganizationUser' | 'Trainee';
  organizationId: string | null;
  dob?: string | null;
  gender?: UserGender | null;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  emailVerifiedAt?: string | null;
};

export type UserGender = 'Male' | 'Female' | 'Other' | 'PreferNotToSay';

type LoginResponse = { accessToken: string; refreshToken: string; user: Account };
type StoredSession = { accessToken: string; refreshToken: string };

const SESSION_KEY = 'fire3d.auth.session.v1';
let currentSession: StoredSession | null = null;
let refreshPromise: Promise<Account> | null = null;

async function readSession(): Promise<StoredSession | null> {
  if (currentSession) return currentSession;
  if (Platform.OS === 'web') return null;
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      value &&
      typeof value === 'object' &&
      'accessToken' in value &&
      typeof value.accessToken === 'string' &&
      'refreshToken' in value &&
      typeof value.refreshToken === 'string'
    ) {
      currentSession = { accessToken: value.accessToken, refreshToken: value.refreshToken };
      return currentSession;
    }
  } catch {
    // Treat malformed device state as a missing session.
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
  return null;
}

async function saveSession(session: StoredSession): Promise<void> {
  if (Platform.OS !== 'web') await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  currentSession = session;
}

export async function clearSession(): Promise<void> {
  currentSession = null;
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(SESSION_KEY);
}

export async function loginWithPassword(email: string, password: string): Promise<Account> {
  const response = await apiClient.request<LoginResponse>('/api/auth/login', {
    json: { email, password },
  });
  if (
    !response ||
    typeof response.accessToken !== 'string' ||
    typeof response.refreshToken !== 'string' ||
    !response.user ||
    typeof response.user.id !== 'string' ||
    typeof response.user.email !== 'string'
  ) {
    throw new Error('Fire3D API trả dữ liệu đăng nhập không hợp lệ. Hãy kiểm tra địa chỉ API.');
  }
  await saveSession(response);
  return response.user;
}

export type RegisterTraineeInput = {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  dob: string | null;
  gender: UserGender | null;
  phoneNumber: string | null;
  registrationToken: string;
};

export function requestRegistrationOtp(email: string): Promise<void> {
  return apiClient.request<void>('/api/auth/registration/request-otp', { json: { email } });
}

export function verifyRegistrationOtp(
  email: string,
  otp: string,
): Promise<{ registrationToken: string; expiresAt: string }> {
  return apiClient.request('/api/auth/registration/verify-otp', { json: { email, otp } });
}

export async function registerTrainee(input: RegisterTraineeInput): Promise<Account> {
  const account = await apiClient.request<Account>('/api/auth/register/trainee', {
    json: input,
  });
  if (!account || typeof account.id !== 'string' || account.role !== 'Trainee') {
    throw new Error('Fire3D API trả dữ liệu đăng ký không hợp lệ. Hãy kiểm tra địa chỉ API.');
  }
  return account;
}

async function refreshSession(session: StoredSession): Promise<Account> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const response = await apiClient.request<LoginResponse>('/api/auth/refresh', {
      json: { refreshToken: session.refreshToken },
    });
    await saveSession(response);
    return response.user;
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function requestWithSession<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const response = await requestWithSessionMeta<T>(path, options);
  return response.data;
}

async function requestWithSessionMeta<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<{ data: T; etag: string | null }> {
  const session = await readSession();
  if (!session) throw new ApiError('Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.', 401);
  try {
    return await apiClient.requestWithMeta<T>(path, {
      ...options,
      accessToken: session.accessToken,
    });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    try {
      if (currentSession?.accessToken === session.accessToken) await refreshSession(session);
    } catch (refreshError) {
      if (refreshError instanceof ApiError && [400, 401, 403].includes(refreshError.status)) {
        await clearSession();
      }
      throw refreshError;
    }
    const refreshed = await readSession();
    if (!refreshed) throw new ApiError('Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.', 401);
    return apiClient.requestWithMeta<T>(path, { ...options, accessToken: refreshed.accessToken });
  }
}

async function currentProfileEtag(): Promise<string> {
  const response = await requestWithSessionMeta<Account>('/api/auth/me');
  if (!response.etag) throw new Error('Fire3D API chưa trả ETag hồ sơ. Vui lòng thử lại.');
  return response.etag;
}

export function getCurrentAccount(): Promise<Account> {
  return requestWithSession<Account>('/api/auth/me');
}

export type ProfileUpdate = {
  fullName?: string;
  username?: string;
  dob?: string | null;
  gender?: UserGender | null;
  phoneNumber?: string | null;
};

export function updateCurrentProfile(input: ProfileUpdate): Promise<Account> {
  return currentProfileEtag().then((etag) =>
    requestWithSession<Account>('/api/auth/me', {
      method: 'PATCH',
      headers: { 'If-Match': etag },
      json: input,
    }),
  );
}

export function changeCurrentPassword(currentPassword: string, newPassword: string): Promise<void> {
  return requestWithSession<void>('/api/auth/change-password', {
    json: { currentPassword, newPassword },
  });
}

export function logoutAllSessions(): Promise<void> {
  return requestWithSession<void>('/api/auth/logout-all', { method: 'POST' });
}

export function requestPasswordReset(email: string): Promise<void> {
  return apiClient.request<void>('/api/auth/forgot-password', { json: { email } });
}

export function resetPassword(token: string, newPassword: string): Promise<void> {
  return apiClient.request<void>('/api/auth/reset-password', { json: { token, newPassword } });
}

export function resendVerification(email: string): Promise<void> {
  return apiClient.request<void>('/api/auth/resend-verification', { json: { email } });
}

export function verifyEmail(token: string): Promise<void> {
  return apiClient.request<void>('/api/auth/verify-email', { json: { token } });
}

export type AvatarResponse = { url: string; expiresAt: string };

export async function getCurrentAvatar(): Promise<AvatarResponse | null> {
  try {
    return await requestWithSession<AvatarResponse>('/api/me/avatar');
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function deleteCurrentAvatar(): Promise<void> {
  return currentProfileEtag().then((etag) =>
    requestWithSession<void>('/api/me/avatar', {
      method: 'DELETE',
      headers: { 'If-Match': etag },
    }),
  );
}

export async function uploadCurrentAvatar(
  uri: string,
  contentType: string,
): Promise<AvatarResponse> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    throw new Error('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.');
  }
  const image = await fetch(uri).then((response) => response.blob());
  if (image.size < 1 || image.size > 5 * 1024 * 1024) {
    throw new Error('Ảnh đại diện phải có dung lượng tối đa 5 MB.');
  }
  const intent = await requestWithSession<{ uploadId: string; uploadUrl: string }>(
    '/api/me/avatar/upload-intent',
    { json: { contentType, contentLength: image.size } },
  );
  const uploaded = await fetch(intent.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: image,
  });
  if (!uploaded.ok) {
    throw new Error(`Không tải được ảnh lên kho lưu trữ (HTTP ${uploaded.status}).`);
  }
  const etag = await currentProfileEtag();
  return requestWithSession<AvatarResponse>('/api/me/avatar/complete', {
    headers: { 'If-Match': etag },
    json: { uploadId: intent.uploadId },
  });
}

export async function restoreSession(): Promise<Account | null> {
  const session = await readSession();
  if (!session) return null;
  try {
    return await apiClient.request<Account>('/api/auth/me', { accessToken: session.accessToken });
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      await clearSession();
      return null;
    }
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    try {
      return await refreshSession(session);
    } catch (refreshError) {
      if (refreshError instanceof ApiError && [400, 401, 403].includes(refreshError.status)) {
        await clearSession();
        return null;
      }
      throw refreshError;
    }
  }
}

export async function logoutSession(): Promise<void> {
  try {
    const session = await readSession();
    if (session) {
      try {
        await apiClient.request<void>('/api/auth/logout', {
          method: 'POST',
          accessToken: session.accessToken,
        });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) return;
        await refreshSession(session);
        const refreshed = await readSession();
        if (!refreshed) return;
        await apiClient.request<void>('/api/auth/logout', {
          method: 'POST',
          accessToken: refreshed.accessToken,
        });
      }
    }
  } catch {
    // Local logout must still complete when the API is unreachable.
  } finally {
    await clearSession();
  }
}
