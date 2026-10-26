import { BookOpen, ClipboardCheck, Play, type LucideIcon } from 'lucide-react-native';
import type { HexTone } from '@/theme/tokens';
import type { TrainingMode } from './session-contract';

/** Trainee-facing names of the three modes (Figma "Chọn cách chơi"). */
export const MODE_UI: Record<
  TrainingMode,
  { title: string; description: string; icon: LucideIcon; tone: HexTone }
> = {
  Learn: {
    title: 'Học',
    description: 'Làm quen tòa nhà, có hướng dẫn. Không chấm điểm.',
    icon: BookOpen,
    tone: 'success',
  },
  Guided: {
    title: 'Diễn tập',
    description: 'Gợi ý từng bước. Không chấm điểm.',
    icon: Play,
    tone: 'info',
  },
  Assessment: {
    title: 'Đánh giá',
    description: 'Tự xử lý, không có AI. Được chấm theo tiêu chí.',
    icon: ClipboardCheck,
    tone: 'warning',
  },
};

export function modeName(mode: string): string {
  return MODE_UI[mode as TrainingMode]?.title ?? mode;
}
