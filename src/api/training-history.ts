import { requestWithSession } from './auth';

export type TrainingHistoryItem = {
  sessionId: string;
  status: string;
  mode: string;
  resultStatus: string | null;
  endReason: string | null;
  startedAt: string;
  endedAt: string | null;
  training: { id: string; name: string };
  building: { id: string; name: string };
  /** Release the session was played on; matches "Bài đã tải" records for replay. */
  releaseId?: string | null;
};

export type TrainingHistoryPage = {
  items: TrainingHistoryItem[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type TrainingResult = {
  sessionId: string;
  mode: string;
  outcome: string;
  reason: string;
  scorePercent: number | null;
  passThresholdPercent: number | null;
  criteria:
    | {
        id: string;
        label: string | null;
        metric: string;
        /** The measured value (number, or null when the metric was not computed). */
        value?: unknown;
        /** null when the criterion was not evaluable (reason METRIC_NOT_EVALUABLE, BE#216). */
        passed: boolean | null;
        reason: string | null;
      }[]
    | null;
  /** Session metrics BE computed; `optimal_distance_meters` (BE#216) is shown, never scored. */
  metrics?: Record<string, unknown> | null;
  lastEventSequence: number;
  createdAt: string;
};

export function getTrainingHistory(page = 1): Promise<TrainingHistoryPage> {
  return requestWithSession('/api/training/sessions', { query: { page, pageSize: 20 } });
}

export function getTrainingResult(sessionId: string): Promise<TrainingResult> {
  return requestWithSession(`/api/training/sessions/${encodeURIComponent(sessionId)}/result`);
}
