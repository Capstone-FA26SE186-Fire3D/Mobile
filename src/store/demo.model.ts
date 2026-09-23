import { buildings, type SavedBuilding } from '../features/buildings/buildings.model.ts';
import type { DemoResult, DemoSession } from '../features/game/game.model.ts';
export type DemoState = {
  version: 2;
  signedIn: boolean;
  saved: SavedBuilding[];
  reducedMotion: boolean;
  sessions: DemoSession[];
  results: DemoResult[];
};
export const initialState: DemoState = {
  version: 2,
  signedIn: false,
  saved: [],
  reducedMotion: false,
  sessions: [],
  results: [],
};
export const DEMO_EMAIL = 'demo@fire3d.vn';
export const DEMO_PASSWORD = 'Fire3D123!';
export function validateDemoLogin(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return 'Vui lòng nhập địa chỉ email hợp lệ.';
  if (email.trim().toLowerCase() !== DEMO_EMAIL || password !== DEMO_PASSWORD)
    return 'Thông tin chưa đúng. Sử dụng tài khoản trải nghiệm được hiển thị bên dưới.';
  return null;
}
function validSaved(value: unknown): SavedBuilding[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item: unknown): item is SavedBuilding => {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as Partial<SavedBuilding>;
    if (
      typeof candidate.id !== 'string' ||
      !buildings.some((building) => building.id === candidate.id) ||
      seen.has(candidate.id) ||
      typeof candidate.scannedAt !== 'string' ||
      !Number.isFinite(Date.parse(candidate.scannedAt))
    )
      return false;
    seen.add(candidate.id);
    return true;
  });
}

function validSessions(value: unknown): DemoSession[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is DemoSession => {
    if (!item || typeof item !== 'object') return false;
    const session = item as Partial<DemoSession>;
    const building = buildings.find((candidate) => candidate.id === session.buildingId);
    return Boolean(
      typeof session.id === 'string' &&
      building?.trainings.some((training) => training.id === session.trainingId) &&
      ['learn', 'guided', 'assessment'].includes(String(session.mode)) &&
      ['active', 'paused', 'completed'].includes(String(session.status)) &&
      session.checkpoint &&
      typeof session.checkpoint.sequence === 'number' &&
      typeof session.checkpoint.sceneId === 'string' &&
      Array.isArray(session.checkpoint.chosenChoiceIds) &&
      typeof session.checkpoint.modeledExposure === 'number' &&
      typeof session.checkpoint.elapsedSeconds === 'number',
    );
  });
}

function validResults(value: unknown, sessions: DemoSession[]): DemoResult[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item): item is DemoResult => {
    if (!item || typeof item !== 'object') return false;
    const result = item as Partial<DemoResult>;
    if (
      typeof result.id !== 'string' ||
      seen.has(result.id) ||
      typeof result.sessionId !== 'string' ||
      !sessions.some((session) => session.id === result.sessionId) ||
      result.syncStatus !== 'local-only' ||
      typeof result.completedAt !== 'string' ||
      !Number.isFinite(Date.parse(result.completedAt))
    )
      return false;
    seen.add(result.id);
    return true;
  });
}

export function parseDemoState(raw: string | null): DemoState {
  if (!raw) return initialState;
  try {
    const value = JSON.parse(raw);
    if (![1, 2].includes(value?.version) || typeof value.signedIn !== 'boolean')
      return initialState;
    const saved = validSaved(value.saved);
    if (value.version === 1)
      return {
        version: 2,
        signedIn: value.signedIn,
        saved,
        reducedMotion: value.reducedMotion === true,
        sessions: [],
        results: [],
      };
    const sessions = validSessions(value.sessions);
    return {
      version: 2,
      signedIn: value.signedIn,
      saved,
      reducedMotion: value.reducedMotion === true,
      sessions,
      results: validResults(value.results, sessions),
    };
  } catch {
    return initialState;
  }
}
