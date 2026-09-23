import type { TrainingMode } from '@/features/buildings/buildings.model';

export type GameSceneId = 'start' | 'corridor' | 'junction' | 'blocked' | 'exit';

export type SceneChoice = {
  id: string;
  label: string;
  description: string;
  nextScene: GameSceneId | null;
  correct: boolean;
  exposureDelta: number;
  secondsDelta: number;
  replan?: boolean;
  feedback: string;
};

export type GameScene = {
  id: GameSceneId;
  step: number;
  title: string;
  objective: string;
  description: string;
  hint: string;
  hotspot?: string;
  choices: readonly SceneChoice[];
};

export type DemoCheckpoint = {
  sceneId: GameSceneId;
  sequence: number;
  chosenChoiceIds: string[];
  wrongChoices: number;
  replanCount: number;
  modeledExposure: number;
  elapsedSeconds: number;
  updatedAt: string;
};

export type DemoSession = {
  id: string;
  trainingId: string;
  buildingId: string;
  mode: TrainingMode;
  status: 'active' | 'paused' | 'completed';
  startedAt: string;
  completedAt?: string;
  checkpoint: DemoCheckpoint;
};

export type DemoResult = {
  id: string;
  sessionId: string;
  trainingId: string;
  buildingId: string;
  mode: TrainingMode;
  completedAt: string;
  score: number | null;
  elapsedSeconds: number;
  wrongChoices: number;
  replanCount: number;
  modeledExposure: number;
  chosenChoiceIds: string[];
  syncStatus: 'local-only';
};

export const gameScenes: Readonly<Record<GameSceneId, GameScene>> = {
  start: {
    id: 'start',
    step: 1,
    title: 'Điểm bắt đầu',
    objective: 'Quan sát không gian xung quanh',
    description: 'Ghi nhớ cửa, góc rẽ và các mốc kiến trúc trong cảnh mô phỏng.',
    hint: 'Chạm vào điểm quan sát để bắt đầu hành trình.',
    hotspot: 'Điểm quan sát',
    choices: [
      {
        id: 'observe-start',
        label: 'Quan sát hành lang',
        description: 'Nhận biết các mốc trước khi di chuyển.',
        nextScene: 'corridor',
        correct: true,
        exposureDelta: 1,
        secondsDelta: 12,
        feedback: 'Bạn đã ghi nhận điểm bắt đầu và hướng của hành lang.',
      },
    ],
  },
  corridor: {
    id: 'corridor',
    step: 2,
    title: 'Hành lang',
    objective: 'Tiến tới nút giao trong mô hình',
    description: 'Cảnh thay đổi theo từng bước; đây không phải chỉ dẫn tại hiện trường.',
    hint: 'Theo dõi các cột, cửa và góc rẽ để giữ định hướng.',
    hotspot: 'Mốc không gian',
    choices: [
      {
        id: 'follow-landmarks',
        label: 'Đi theo các mốc đã quan sát',
        description: 'Tiến tới điểm có hai nhánh mô phỏng.',
        nextScene: 'junction',
        correct: true,
        exposureDelta: 2,
        secondsDelta: 18,
        feedback: 'Bạn đã tới nút giao và vẫn giữ được định hướng.',
      },
    ],
  },
  junction: {
    id: 'junction',
    step: 3,
    title: 'Nút giao có khói mô phỏng',
    objective: 'Chọn một nhánh để tiếp tục',
    description: 'Hai lựa chọn chỉ có ý nghĩa trong scenario mẫu đang chạy.',
    hint: 'Route mô phỏng ưu tiên nhánh A trong trạng thái hiện tại.',
    choices: [
      {
        id: 'route-a',
        label: 'Chọn nhánh A',
        description: 'Tuyến được scenario mẫu đánh dấu còn khả dụng.',
        nextScene: 'exit',
        correct: true,
        exposureDelta: 8,
        secondsDelta: 24,
        feedback: 'Nhánh A vẫn khả dụng trong trạng thái mô phỏng này.',
      },
      {
        id: 'route-b',
        label: 'Chọn nhánh B',
        description: 'Thử một tuyến chưa được xác nhận trong scenario.',
        nextScene: 'blocked',
        correct: false,
        exposureDelta: 25,
        secondsDelta: 30,
        feedback: 'Nhánh B đã bị chặn trong scenario. Bạn cần chọn lại tuyến.',
      },
    ],
  },
  blocked: {
    id: 'blocked',
    step: 4,
    title: 'Tuyến bị chặn',
    objective: 'Re-plan theo trạng thái mới',
    description: 'Scenario đã thay đổi; phiên ghi nhận một lần đổi tuyến.',
    hint: 'Quay lại nút giao và chuyển sang nhánh còn khả dụng trong mô hình.',
    choices: [
      {
        id: 'replan-route-a',
        label: 'Đổi sang nhánh A',
        description: 'Re-plan và tiếp tục tới điểm kết thúc mô phỏng.',
        nextScene: 'exit',
        correct: true,
        exposureDelta: 10,
        secondsDelta: 26,
        replan: true,
        feedback: 'Route đã được tính lại cho scenario mẫu.',
      },
    ],
  },
  exit: {
    id: 'exit',
    step: 5,
    title: 'Điểm kết thúc mô phỏng',
    objective: 'Hoàn tất phiên và xem debrief',
    description: 'Kết quả chỉ phản ánh lựa chọn trong scenario mẫu.',
    hint: 'Hoàn tất để lưu kết quả cục bộ trên thiết bị.',
    hotspot: 'Điểm kết thúc',
    choices: [
      {
        id: 'finish-session',
        label: 'Hoàn tất mô phỏng',
        description: 'Lưu debrief cục bộ và kết thúc phiên.',
        nextScene: null,
        correct: true,
        exposureDelta: 1,
        secondsDelta: 10,
        feedback: 'Phiên mô phỏng đã hoàn thành.',
      },
    ],
  },
};

export function createDemoSession(
  input: {
    id: string;
    trainingId: string;
    buildingId: string;
    mode: TrainingMode;
  },
  now = new Date().toISOString(),
): DemoSession {
  return {
    ...input,
    status: 'active',
    startedAt: now,
    checkpoint: {
      sceneId: 'start',
      sequence: 0,
      chosenChoiceIds: [],
      wrongChoices: 0,
      replanCount: 0,
      modeledExposure: 0,
      elapsedSeconds: 0,
      updatedAt: now,
    },
  };
}

export function scoreAssessment(wrongChoices: number, modeledExposure: number): number {
  return Math.max(0, Math.min(100, 100 - wrongChoices * 20 - modeledExposure));
}

export function advanceSession(
  session: DemoSession,
  choiceId: string,
  now = new Date().toISOString(),
): { session: DemoSession; result?: DemoResult } {
  if (session.status === 'completed') return { session };
  const scene = gameScenes[session.checkpoint.sceneId];
  const choice = scene.choices.find((item) => item.id === choiceId);
  if (!choice) throw new Error('Lựa chọn không hợp lệ cho cảnh hiện tại.');
  const checkpoint: DemoCheckpoint = {
    sceneId: choice.nextScene ?? session.checkpoint.sceneId,
    sequence: session.checkpoint.sequence + 1,
    chosenChoiceIds: [...session.checkpoint.chosenChoiceIds, choice.id],
    wrongChoices: session.checkpoint.wrongChoices + (choice.correct ? 0 : 1),
    replanCount: session.checkpoint.replanCount + (choice.replan ? 1 : 0),
    modeledExposure: Math.min(100, session.checkpoint.modeledExposure + choice.exposureDelta),
    elapsedSeconds: session.checkpoint.elapsedSeconds + choice.secondsDelta,
    updatedAt: now,
  };
  if (choice.nextScene) return { session: { ...session, status: 'active', checkpoint } };
  const completed: DemoSession = { ...session, status: 'completed', checkpoint, completedAt: now };
  return {
    session: completed,
    result: {
      id: session.id,
      sessionId: session.id,
      trainingId: session.trainingId,
      buildingId: session.buildingId,
      mode: session.mode,
      completedAt: now,
      score:
        session.mode === 'assessment'
          ? scoreAssessment(checkpoint.wrongChoices, checkpoint.modeledExposure)
          : null,
      elapsedSeconds: checkpoint.elapsedSeconds,
      wrongChoices: checkpoint.wrongChoices,
      replanCount: checkpoint.replanCount,
      modeledExposure: checkpoint.modeledExposure,
      chosenChoiceIds: checkpoint.chosenChoiceIds,
      syncStatus: 'local-only',
    },
  };
}

export function restartSession(session: DemoSession, now = new Date().toISOString()): DemoSession {
  return createDemoSession(
    {
      id: session.id,
      trainingId: session.trainingId,
      buildingId: session.buildingId,
      mode: session.mode,
    },
    now,
  );
}

export function getModeLabel(mode: TrainingMode): string {
  if (mode === 'learn') return 'Learn';
  if (mode === 'guided') return 'Guided Drill';
  return 'Assessment';
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}
