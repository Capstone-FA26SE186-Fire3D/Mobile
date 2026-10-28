import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearSession,
  completeGoogleOnboarding,
  getCurrentAccount,
  linkCurrentGoogle,
  loginWithFirebase,
  loginWithPassword,
  logoutAllSessions,
  logoutSession,
  restoreSession,
  updateCurrentProfile,
  type Account,
  type ProfileUpdate,
} from '@/api/auth';
import { bindDevice, listenForDeviceTokenChange, revokeDevice } from '@/services/device';
import { clearGoogleIdentity, firebaseIdTokenFromGoogle } from '@/services/google';
import { readPendingHandoff, writePendingHandoff } from '@/features/playtest/pending-handoff';

type SessionContextValue = {
  account: Account | null;
  ready: boolean;
  reduceMotion: boolean;
  error: string;
  dismissError: () => void;
  onboardingToken: string | null;
  pendingQrToken: string | null;
  setPendingQrToken: (token: string | null) => Promise<void>;
  pendingHandoffCode: string | null;
  setPendingHandoffCode: (code: string | null) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<'authenticated' | 'onboarding'>;
  completeOnboarding: (username: string) => Promise<void>;
  linkGoogle: (currentPassword: string) => Promise<boolean>;
  refreshAccount: () => Promise<void>;
  updateProfile: (input: ProfileUpdate) => Promise<void>;
  retryDeviceBinding: () => Promise<boolean>;
  revokeCurrentDevice: () => Promise<void>;
  signOut: () => Promise<void>;
  logoutEverywhere: () => Promise<void>;
  clearLocal: () => Promise<void>;
};

const Context = createContext<SessionContextValue | null>(null);
const PENDING_QR_KEY = 'fire3d.pending-qr.v1';
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Không kết nối được máy chủ FET3D. Kiểm tra mạng rồi thử lại.';

/**
 * Push registration is optional: the app works without it and re-registers on the next start or token change. Say that in
 * plain words; a lost connection (no DNS, timeout) gets its own line instead of the raw Java exception.
 */
const pushNotice = (issue: unknown) => {
  const raw = issue instanceof Error ? issue.message : '';
  return /UnknownHost|Unable to resolve host|timeout|Network|SERVICE_NOT_AVAILABLE/i.test(raw)
    ? 'Chưa bật được thông báo vì mất kết nối mạng. Ứng dụng sẽ tự thử lại khi có mạng.'
    : 'Chưa bật được thông báo trên máy này. Bạn vẫn dùng ứng dụng bình thường; có thể bật lại trong Tôi › Cài đặt tài khoản.';
};

export function SessionProvider({ children }: PropsWithChildren) {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [error, setError] = useState('');
  const [onboardingToken, setOnboardingToken] = useState<string | null>(null);
  const [pendingQrToken, setPendingQrTokenState] = useState<string | null>(null);
  const [pendingHandoffCode, setPendingHandoffCodeState] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.multiRemove(['fire3d.demo.v1', 'fire3d.demo.v2']).catch((issue) => {
        if (active) setError(`Không xóa được dữ liệu demo cũ: ${message(issue)}`);
      }),
      restoreSession(),
      AsyncStorage.getItem(PENDING_QR_KEY),
      readPendingHandoff(),
    ])
      .then(async ([, restored, pendingQr, pendingHandoff]) => {
        if (!active) return;
        setPendingQrTokenState(pendingQr);
        setPendingHandoffCodeState(pendingHandoff);
        if (restored?.role === 'Trainee' || restored?.role === 'OrganizationUser')
          setAccount(restored);
        else if (restored) await logoutSession();
      })
      .catch((issue) => {
        if (active) setError(message(issue));
      })
      .finally(() => {
        if (active) setReady(true);
      });
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduceMotion(value);
      })
      .catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      listener.remove();
    };
  }, []);

  useEffect(() => {
    if (account?.role !== 'Trainee') return;
    let active = true;
    void bindDevice(account.id).catch((issue) => {
      if (active) setError(pushNotice(issue));
    });
    const unsubscribe = listenForDeviceTokenChange(account.id, (issue) => {
      if (active) setError(pushNotice(issue));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [account?.id]);

  const clearLocal = useCallback(async () => {
    await clearSession();
    await clearGoogleIdentity();
    setAccount(null);
    setOnboardingToken(null);
    setError('');
  }, []);

  const setPendingQrToken = useCallback(async (token: string | null) => {
    if (token) await AsyncStorage.setItem(PENDING_QR_KEY, token);
    else await AsyncStorage.removeItem(PENDING_QR_KEY);
    setPendingQrTokenState(token);
  }, []);

  const setPendingHandoffCode = useCallback(async (code: string | null) => {
    await writePendingHandoff(code);
    setPendingHandoffCodeState(code);
  }, []);

  // One stable object between state changes: consumers re-render only when something they can read has changed.
  const value = useMemo<SessionContextValue>(
    () => ({
      account,
      ready,
      reduceMotion,
      error,
      dismissError: () => setError(''),
      onboardingToken,
      pendingQrToken,
      setPendingQrToken,
      pendingHandoffCode,
      setPendingHandoffCode,
      signInWithPassword: async (email, password) => {
        const user = await loginWithPassword(email, password);
        setError('');
        setOnboardingToken(null);
        setAccount(user);
      },
      signInWithGoogle: async () => {
        const idToken = await firebaseIdTokenFromGoogle();
        try {
          const result = await loginWithFirebase(idToken);
          if (result.status === 'OnboardingRequired') {
            setOnboardingToken(result.onboardingToken!);
            return 'onboarding';
          }
          setError('');
          setAccount(result.authentication!.user);
          return 'authenticated';
        } catch (issue) {
          await clearGoogleIdentity();
          throw issue;
        }
      },
      completeOnboarding: async (username) => {
        if (!onboardingToken)
          throw new Error('Phiên tạo tài khoản Google đã hết. Hãy đăng nhập Google lại.');
        const user = await completeGoogleOnboarding(onboardingToken, username);
        setOnboardingToken(null);
        setAccount(user);
      },
      linkGoogle: async (currentPassword) => {
        let revoked = false;
        try {
          const token = await firebaseIdTokenFromGoogle();
          if (account) {
            await revokeDevice(account.id);
            revoked = true;
          }
          const result = await linkCurrentGoogle(token, currentPassword);
          if (result.requiresLogin) await clearLocal();
          else {
            setAccount(result.user);
            await bindDevice(result.user.id).catch((issue) => {
              setError(`Không đăng ký được thông báo: ${message(issue)}`);
            });
          }
          return result.requiresLogin;
        } catch (issue) {
          if (revoked && account) await bindDevice(account.id).catch(() => {});
          throw issue;
        } finally {
          await clearGoogleIdentity();
        }
      },
      refreshAccount: async () => setAccount(await getCurrentAccount()),
      updateProfile: async (input) => setAccount(await updateCurrentProfile(input)),
      retryDeviceBinding: async () => {
        if (account?.role !== 'Trainee') return false;
        const bound = await bindDevice(account.id);
        setError('');
        return bound;
      },
      revokeCurrentDevice: async () => {
        if (account?.role === 'Trainee') await revokeDevice(account.id);
      },
      signOut: async () => {
        if (account?.role === 'Trainee') await revokeDevice(account.id);
        await logoutSession();
        await clearLocal();
      },
      logoutEverywhere: async () => {
        if (account?.role === 'Trainee') await revokeDevice(account.id);
        await logoutAllSessions();
        await clearLocal();
      },
      clearLocal,
    }),
    [
      account,
      ready,
      reduceMotion,
      error,
      onboardingToken,
      pendingQrToken,
      pendingHandoffCode,
      setPendingQrToken,
      setPendingHandoffCode,
      clearLocal,
    ],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('SessionProvider is required');
  return value;
}
