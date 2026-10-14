import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
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

type SessionContextValue = {
  account: Account | null;
  ready: boolean;
  reduceMotion: boolean;
  error: string;
  onboardingToken: string | null;
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
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Không kết nối được Fire3D API.';

export function SessionProvider({ children }: PropsWithChildren) {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [error, setError] = useState('');
  const [onboardingToken, setOnboardingToken] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.multiRemove(['fire3d.demo.v1', 'fire3d.demo.v2']).catch((issue) => {
        if (active) setError(`Không xóa được dữ liệu demo cũ: ${message(issue)}`);
      }),
      restoreSession(),
    ])
      .then(async ([, restored]) => {
        if (!active) return;
        if (restored?.role === 'Trainee') setAccount(restored);
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
    if (!account) return;
    let active = true;
    void bindDevice(account.id).catch((issue) => {
      if (active) setError(`Không đăng ký được thông báo: ${message(issue)}`);
    });
    const unsubscribe = listenForDeviceTokenChange(account.id, (issue) => {
      if (active) setError(`Không cập nhật được FCM token: ${message(issue)}`);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [account?.id]);

  async function clearLocal() {
    await clearSession();
    await clearGoogleIdentity();
    setAccount(null);
    setOnboardingToken(null);
    setError('');
  }

  return (
    <Context.Provider
      value={{
        account,
        ready,
        reduceMotion,
        error,
        onboardingToken,
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
          if (!account) return false;
          const bound = await bindDevice(account.id);
          setError('');
          return bound;
        },
        revokeCurrentDevice: async () => {
          if (account) await revokeDevice(account.id);
        },
        signOut: async () => {
          if (account) await revokeDevice(account.id);
          await logoutSession();
          await clearLocal();
        },
        logoutEverywhere: async () => {
          if (account) await revokeDevice(account.id);
          await logoutAllSessions();
          await clearLocal();
        },
        clearLocal,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('SessionProvider is required');
  return value;
}
