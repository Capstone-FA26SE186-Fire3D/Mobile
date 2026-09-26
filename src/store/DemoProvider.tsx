import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { restoreSession, loginWithPassword, logoutSession, type Account } from '@/api/auth';
import { initialState, parseDemoState, type DemoState } from './demo.model';
import { buildings, saveBuilding, type Building } from '@/features/buildings/buildings.model';
type Store = {
  state: DemoState;
  ready: boolean;
  reduceMotion: boolean;
  storageError: string;
  account: Account | null;
  signIn: () => void;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  addBuilding: (b: Building) => void;
  loadExamples: () => void;
  clearBuildings: () => void;
  setReducedMotion: (value: boolean) => void;
};
const Context = createContext<Store | null>(null);
export function DemoProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState(initialState),
    [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState(''),
    [account, setAccount] = useState<Account | null>(null),
    [systemReduce, setSystemReduce] = useState(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem('fire3d.demo.v1').catch(() => {
        if (active)
          setStorageError('Không đọc được dữ liệu mẫu đã lưu. Bạn có thể tiếp tục trong phiên này.');
        return null;
      }),
      restoreSession().catch(() => {
        if (active)
          setStorageError('Không thể kiểm tra phiên đăng nhập. Hãy kiểm tra kết nối Fire3D API.');
        return null;
      }),
    ])
      .then(([raw, restoredAccount]) => {
        if (active) {
          const savedState = parseDemoState(raw);
          setAccount(restoredAccount);
          setState({ ...savedState, signedIn: restoredAccount !== null || savedState.signedIn });
        }
      })
      .finally(() => {
        if (active) setReady(true);
      });
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setSystemReduce(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduce);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    writes.current = writes.current
      .then(() =>
        AsyncStorage.setItem(
          'fire3d.demo.v1',
          JSON.stringify({ ...state, signedIn: account === null && state.signedIn }),
        ),
      )
      .then(() => {
        if (active) setStorageError('');
      })
      .catch(() => {
        if (active)
          setStorageError(
            'Chưa lưu được thay đổi trên thiết bị. Dữ liệu có thể mất khi đóng ứng dụng.',
          );
      });
    return () => {
      active = false;
    };
  }, [state, ready, account]);
  return (
    <Context.Provider
      value={{
        state,
        ready,
        storageError,
        account,
        reduceMotion: systemReduce || state.reducedMotion,
        signIn: () => setState((s) => ({ ...s, signedIn: true })),
        signInWithPassword: async (email, password) => {
          const signedInAccount = await loginWithPassword(email, password);
          setAccount(signedInAccount);
          setState((s) => ({ ...s, signedIn: true }));
        },
        signOut: async () => {
          try {
            await logoutSession();
          } finally {
            setAccount(null);
            setState((s) => ({ ...s, signedIn: false }));
          }
        },
        addBuilding: (b) => setState((s) => ({ ...s, saved: saveBuilding(s.saved, b) })),
        loadExamples: () =>
          setState((s) => ({
            ...s,
            saved: buildings.reduce((saved, b) => saveBuilding(saved, b), s.saved),
          })),
        clearBuildings: () => setState((s) => ({ ...s, saved: [] })),
        setReducedMotion: (value) => setState((s) => ({ ...s, reducedMotion: value })),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useDemo() {
  const value = useContext(Context);
  if (!value) throw new Error('DemoProvider is required');
  return value;
}
