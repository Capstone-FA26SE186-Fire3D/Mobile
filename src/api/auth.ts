import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from './client';
import { ApiError } from './types/common';

export type Account = {
  id: string;
  email: string;
  fullName: string | null;
  role: 'PlatformAdmin' | 'OrganizationUser' | 'Trainee';
  organizationId: string | null;
};

type LoginResponse = { accessToken: string; refreshToken: string; user: Account };
type RefreshedSession = LoginResponse & {
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
};
type StoredSession = { accessToken: string; refreshToken: string };

const SESSION_KEY = 'fire3d.auth.session.v1';
let currentSession: StoredSession | null = null;

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
  await saveSession(response);
  return response.user;
}

async function refreshSession(session: StoredSession): Promise<Account> {
  const response = await apiClient.request<RefreshedSession>('/api/auth/refresh', {
    json: { refreshToken: session.refreshToken },
  });
  await saveSession(response);
  return response.user;
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
