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
import {
  restoreSession,
  loginWithPassword,
  logoutSession,
  getCurrentAccount,
  updateCurrentProfile,
  type Account,
  type ProfileUpdate,
} from '@/api/auth';
import { initialState, parseDemoState, type DemoState } from './demo.model';
import {
  buildings,
  findTraining,
  saveBuilding,
  type Building,
  type TrainingMode,
} from '@/features/buildings/buildings.model';
import { advanceSession, createDemoSession, restartSession } from '@/features/game/game.model';
type Store = {
  state: DemoState;
  ready: boolean;
  reduceMotion: boolean;
  storageError: string;
  account: Account | null;
  signIn: () => void;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  refreshAccount: () => Promise<void>;
  updateProfile: (input: ProfileUpdate) => Promise<void>;
  signOut: () => Promise<void>;
  addBuilding: (b: Building) => void;
  loadExamples: () => void;
  clearBuildings: () => void;
  setReducedMotion: (value: boolean) => void;
  startSession: (trainingId: string, mode: TrainingMode) => string;
  chooseScene: (sessionId: string, choiceId: string) => void;
  pauseSession: (sessionId: string) => void;
  resumeSession: (sessionId: string) => void;
  restartSession: (sessionId: string) => void;
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
      Promise.all([AsyncStorage.getItem('fire3d.demo.v2'), AsyncStorage.getItem('fire3d.demo.v1')])
        .then(([current, legacy]) => current ?? legacy)
        .catch(() => {
          if (active)
            setStorageError(
              'Không đọc được dữ liệu mẫu đã lưu. Bạn có thể tiếp tục trong phiên này.',
            );
          return null;
        }),
      restoreSession()
        .then(async (restored) => {
          if (restored?.role === 'Trainee') return restored;
          if (restored) await logoutSession();
          return null;
        })
        .catch(() => {
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
          'fire3d.demo.v2',
          JSON.stringify({ ...state, signedIn: account === null && state.signedIn }),
        ),
      )
      .then(() => AsyncStorage.removeItem('fire3d.demo.v1'))
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
          if (signedInAccount.role !== 'Trainee') {
            await logoutSession();
            throw new Error('Ứng dụng Mobile hiện chỉ dành cho tài khoản Trainee.');
          }
          setAccount(signedInAccount);
          setState((s) => ({ ...s, signedIn: true }));
        },
        refreshAccount: async () => setAccount(await getCurrentAccount()),
        updateProfile: async (input) => setAccount(await updateCurrentProfile(input)),
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
        startSession: (trainingId, mode) => {
          const match = findTraining(trainingId);
          if (!match || match.training.status !== 'active')
            throw new Error('Bài tập không khả dụng.');
          const id = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const session = createDemoSession({
            id,
            trainingId,
            buildingId: match.building.id,
            mode,
          });
          setState((s) => ({ ...s, sessions: [session, ...s.sessions] }));
          return id;
        },
        chooseScene: (sessionId, choiceId) =>
          setState((s) => {
            const current = s.sessions.find((session) => session.id === sessionId);
            if (!current) return s;
            const next = advanceSession(current, choiceId);
            return {
              ...s,
              sessions: s.sessions.map((session) =>
                session.id === sessionId ? next.session : session,
              ),
              results: next.result
                ? [next.result, ...s.results.filter((result) => result.sessionId !== sessionId)]
                : s.results,
            };
          }),
        pauseSession: (sessionId) =>
          setState((s) => ({
            ...s,
            sessions: s.sessions.map((session) =>
              session.id === sessionId && session.status !== 'completed'
                ? { ...session, status: 'paused' }
                : session,
            ),
          })),
        resumeSession: (sessionId) =>
          setState((s) => ({
            ...s,
            sessions: s.sessions.map((session) =>
              session.id === sessionId && session.status === 'paused'
                ? { ...session, status: 'active' }
                : session,
            ),
          })),
        restartSession: (sessionId) =>
          setState((s) => ({
            ...s,
            sessions: s.sessions.map((session) =>
              session.id === sessionId ? restartSession(session) : session,
            ),
            results: s.results.filter((result) => result.sessionId !== sessionId),
          })),
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
