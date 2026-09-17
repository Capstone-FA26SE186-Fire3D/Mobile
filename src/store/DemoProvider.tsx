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
import { initialState, parseDemoState, type DemoState } from './demo.model';
import { buildings, saveBuilding, type Building } from '@/features/buildings/buildings.model';
type Store = {
  state: DemoState;
  ready: boolean;
  reduceMotion: boolean;
  storageError: string;
  signIn: () => void;
  signOut: () => void;
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
    [systemReduce, setSystemReduce] = useState(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem('fire3d.demo.v1')
      .then((raw) => {
        if (active) setState(parseDemoState(raw));
      })
      .catch(() => {
        if (active)
          setStorageError(
            'Không đọc được dữ liệu đã lưu. Bạn có thể tiếp tục trải nghiệm trong phiên này.',
          );
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
      .then(() => AsyncStorage.setItem('fire3d.demo.v1', JSON.stringify(state)))
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
  }, [state, ready]);
  return (
    <Context.Provider
      value={{
        state,
        ready,
        storageError,
        reduceMotion: systemReduce || state.reducedMotion,
        signIn: () => setState((s) => ({ ...s, signedIn: true })),
        signOut: () => setState((s) => ({ ...s, signedIn: false })),
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
