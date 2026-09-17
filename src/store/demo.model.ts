import { buildings, type SavedBuilding } from '../features/buildings/buildings.model.ts';
export type DemoState = {
  version: 1;
  signedIn: boolean;
  saved: SavedBuilding[];
  reducedMotion: boolean;
};
export const initialState: DemoState = {
  version: 1,
  signedIn: false,
  saved: [],
  reducedMotion: false,
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
export function parseDemoState(raw: string | null): DemoState {
  if (!raw) return initialState;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || typeof value.signedIn !== 'boolean' || !Array.isArray(value.saved))
      return initialState;
    const seen = new Set<string>();
    const saved = value.saved.filter((item: unknown): item is SavedBuilding => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<SavedBuilding>;
      if (
        typeof candidate.id !== 'string' ||
        !buildings.some((b) => b.id === candidate.id) ||
        seen.has(candidate.id) ||
        typeof candidate.scannedAt !== 'string' ||
        !Number.isFinite(Date.parse(candidate.scannedAt))
      )
        return false;
      seen.add(candidate.id);
      return true;
    });
    return {
      version: 1,
      signedIn: value.signedIn,
      saved,
      reducedMotion: value.reducedMotion === true,
    };
  } catch {
    return initialState;
  }
}
